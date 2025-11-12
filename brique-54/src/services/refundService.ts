/**
 * Refund Service - core refund management logic
 */
import { pool } from "../utils/db.js";
import { publishEvent } from "../webhooks/publisher.js";
import { pickSiraScore, SiraScore } from "./siraService.js";
import fetch from "node-fetch";

const PAYMENTS_URL = process.env.PAYMENTS_URL || "http://localhost:8041";
const LEDGER_URL = process.env.LEDGER_URL || "http://localhost:8034";
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || "";

export interface CreateRefundInput {
  idempotencyKey: string;
  paymentId: string;
  merchantId: string;
  amount: number;
  currency: string;
  reason?: string;
  initiatedBy: "merchant" | "ops" | "system" | "customer";
  metadata?: any;
}

export async function createRefund(input: CreateRefundInput, actor?: string): Promise<any> {
  const {
    idempotencyKey,
    paymentId,
    merchantId,
    amount,
    currency,
    reason = "",
    initiatedBy,
    metadata = {},
  } = input;

  // Idempotency check
  const { rows: existed } = await pool.query(
    "SELECT * FROM refunds WHERE external_id = $1",
    [idempotencyKey]
  );
  if (existed.length) return existed[0];

  // Fetch payment details from B41 Connect
  const paymentResponse = await fetch(`${PAYMENTS_URL}/api/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${SERVICE_TOKEN}` },
  });

  if (!paymentResponse.ok) {
    throw new Error("payment_not_found");
  }

  const payment = await paymentResponse.json() as any;

  // Validation: refund amount cannot exceed payment amount
  if (amount > Number(payment.amount)) {
    throw new Error("refund_amount_exceeds_payment");
  }

  // Check if payment currency matches
  if (currency !== payment.currency) {
    throw new Error("currency_mismatch");
  }

  // Get refund rules for merchant
  const rules = await getRefundRules(merchantId);

  // Check if refund is allowed based on rules
  const paymentDate = new Date(payment.created_at);
  const daysSincePayment = (Date.now() - paymentDate.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSincePayment > rules.max_refund_days) {
    throw new Error(`refund_too_late_max_${rules.max_refund_days}_days`);
  }

  // Check refund percentage
  const refundPercentage = (amount / Number(payment.amount)) * 100;
  if (refundPercentage > rules.max_refund_percentage) {
    throw new Error(`refund_exceeds_max_percentage_${rules.max_refund_percentage}`);
  }

  // SIRA scoring for abuse detection
  let siraScore: SiraScore = { score: 0.1, risk_level: "low", reasons: [] };
  if (payment.customer_id) {
    siraScore = await pickSiraScore(payment.customer_id, {
      payment_id: paymentId,
      refund_amount: amount,
      merchant_id: merchantId,
    });

    if (siraScore.score > rules.sira_threshold) {
      throw new Error(`sira_score_too_high_${siraScore.score}_requires_review`);
    }
  }

  // Determine initial status based on approval requirements
  let status = "pending";
  let approvalRequired = false;

  if (amount > rules.require_ops_approval_above) {
    approvalRequired = true;
    status = "pending"; // Requires ops approval
  } else if (amount <= rules.max_amount_without_approval && rules.auto_refund_enabled) {
    status = "processing"; // Auto-approved
  }

  // Create refund
  const { rows } = await pool.query(
    `INSERT INTO refunds (
      external_id, payment_id, merchant_id, customer_id,
      amount, currency, reason, status, initiated_by, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      idempotencyKey,
      paymentId,
      merchantId,
      payment.customer_id || null,
      amount,
      currency,
      reason,
      status,
      initiatedBy,
      { ...metadata, sira_score: siraScore.score, approval_required: approvalRequired },
    ]
  );

  const refund = rows[0];

  // Log audit event
  await logRefundAudit(refund.id, actor || "system", "created", {
    amount,
    currency,
    reason,
    sira_score: siraScore.score,
    approval_required: approvalRequired,
  });

  // Publish webhook
  await publishEvent("merchant", merchantId, "refund.created", {
    refund_id: refund.id,
    payment_id: paymentId,
    amount,
    currency,
    status,
  });

  // If auto-approved, trigger processing
  if (status === "processing") {
    // Enqueue processing job (in production, use queue)
    setTimeout(() => processRefund(refund.id).catch(console.error), 100);
  }

  return refund;
}

export async function processRefund(refundId: string): Promise<any> {
  const { rows } = await pool.query("SELECT * FROM refunds WHERE id = $1", [refundId]);
  if (!rows.length) throw new Error("refund_not_found");

  const refund = rows[0];

  if (refund.status !== "processing" && refund.status !== "pending") {
    throw new Error(`refund_cannot_be_processed_status_${refund.status}`);
  }

  // Update status to processing
  await pool.query(
    "UPDATE refunds SET status = 'processing', updated_at = now() WHERE id = $1",
    [refundId]
  );

  try {
    // Call payment provider to process refund
    const refundResponse = await fetch(`${PAYMENTS_URL}/api/payments/${refund.payment_id}/refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        amount: refund.amount,
        currency: refund.currency,
        reason: refund.reason,
        idempotency_key: refund.external_id,
      }),
    });

    if (!refundResponse.ok) {
      const error = await refundResponse.json() as any;
      throw new Error(error.message || "payment_processor_rejected");
    }

    // Create mirror transaction in ledger (double-entry)
    await createLedgerRefund(refund);

    // Mark as succeeded
    await pool.query(
      "UPDATE refunds SET status = 'succeeded', completed_at = now(), updated_at = now() WHERE id = $1",
      [refundId]
    );

    // Log audit event
    await logRefundAudit(refundId, "system", "processed", { status: "succeeded" });

    // Publish webhook
    await publishEvent("merchant", refund.merchant_id, "refund.succeeded", {
      refund_id: refundId,
      payment_id: refund.payment_id,
      amount: refund.amount,
      currency: refund.currency,
    });

    const { rows: updated } = await pool.query("SELECT * FROM refunds WHERE id = $1", [refundId]);
    return updated[0];
  } catch (err: any) {
    console.error("Refund processing failed:", err);

    // Mark as failed
    await pool.query(
      "UPDATE refunds SET status = 'failed', failed_reason = $2, updated_at = now() WHERE id = $1",
      [refundId, err.message]
    );

    // Log audit event
    await logRefundAudit(refundId, "system", "failed", { reason: err.message });

    // Publish webhook
    await publishEvent("merchant", refund.merchant_id, "refund.failed", {
      refund_id: refundId,
      payment_id: refund.payment_id,
      reason: err.message,
    });

    throw err;
  }
}

export async function approveRefund(refundId: string, approver: string): Promise<any> {
  const { rows } = await pool.query(
    "UPDATE refunds SET status = 'processing', approved_by = $2, updated_at = now() WHERE id = $1 AND status = 'pending' RETURNING *",
    [refundId, approver]
  );

  if (!rows.length) throw new Error("refund_not_found_or_already_processed");

  const refund = rows[0];

  // Log audit event
  await logRefundAudit(refundId, approver, "approved", {});

  // Trigger processing
  setTimeout(() => processRefund(refundId).catch(console.error), 100);

  return refund;
}

export async function cancelRefund(refundId: string, canceller: string, reason?: string): Promise<any> {
  const { rows } = await pool.query(
    `UPDATE refunds SET
      status = 'cancelled',
      metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{cancel_reason}', to_jsonb($2::text)),
      updated_at = now()
     WHERE id = $1 AND status IN ('pending', 'processing')
     RETURNING *`,
    [refundId, reason || "cancelled_by_ops"]
  );

  if (!rows.length) throw new Error("refund_not_found_or_cannot_be_cancelled");

  const refund = rows[0];

  // Log audit event
  await logRefundAudit(refundId, canceller, "cancelled", { reason });

  // Publish webhook
  await publishEvent("merchant", refund.merchant_id, "refund.cancelled", {
    refund_id: refundId,
    payment_id: refund.payment_id,
    reason,
  });

  return refund;
}

async function createLedgerRefund(refund: any): Promise<void> {
  try {
    await fetch(`${LEDGER_URL}/api/ledger/refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        refund_id: refund.id,
        payment_id: refund.payment_id,
        amount: refund.amount,
        currency: refund.currency,
        merchant_id: refund.merchant_id,
        customer_id: refund.customer_id,
      }),
    });
  } catch (err) {
    console.error("Failed to create ledger refund entry:", err);
    // Don't throw - ledger is important but shouldn't block refund
  }
}

async function getRefundRules(merchantId: string): Promise<any> {
  // Try to get merchant-specific rules first
  const { rows } = await pool.query(
    "SELECT * FROM refund_rules WHERE merchant_id = $1 AND is_active = true LIMIT 1",
    [merchantId]
  );

  if (rows.length) return rows[0];

  // Fall back to global rules
  const { rows: globalRows } = await pool.query(
    "SELECT * FROM refund_rules WHERE merchant_id IS NULL AND is_active = true LIMIT 1"
  );

  if (globalRows.length) return globalRows[0];

  // Return default if no rules found
  return {
    max_refund_days: 30,
    max_amount_without_approval: 1000,
    require_ops_approval_above: 10000,
    auto_refund_enabled: false,
    max_refund_percentage: 100,
    sira_threshold: 0.5,
  };
}

export async function logRefundAudit(
  refundId: string,
  actor: string,
  action: string,
  details: any,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await pool.query(
    `INSERT INTO refund_audit_logs (refund_id, actor, action, details, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [refundId, actor, action, details, ipAddress || null, userAgent || null]
  );
}
