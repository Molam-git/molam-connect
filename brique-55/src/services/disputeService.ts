/**
 * Dispute Service - Core business logic for dispute management
 */
import { pool } from "../utils/db.js";
import { publishEvent } from "../webhooks/publisher.js";
import { requestSiraScore } from "./siraService.js";
import fetch from "node-fetch";

const PAYMENTS_URL = process.env.PAYMENTS_URL || "http://localhost:8041";
const BILLING_URL = process.env.BILLING_URL || "http://localhost:8046";
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || "";

export interface CreateDisputeInput {
  idempotencyKey?: string;
  paymentId: string;
  merchantId: string;
  amount: number;
  currency: string;
  reasonCode: string;
  origin?: string;
  customerId?: string;
  metadata?: any;
}

/**
 * Create a new dispute (manual merchant/customer claim)
 */
export async function createDispute(
  input: CreateDisputeInput,
  actorId?: string
): Promise<any> {
  const {
    idempotencyKey,
    paymentId,
    merchantId,
    amount,
    currency,
    reasonCode,
    origin = "customer_claim",
    customerId,
    metadata = {},
  } = input;

  // Idempotency check
  if (idempotencyKey) {
    const { rows: existed } = await pool.query(
      "SELECT * FROM disputes WHERE metadata->>'idempotency_key' = $1",
      [idempotencyKey]
    );
    if (existed.length) return existed[0];
  }

  // Validate payment exists
  const payment = await fetchPayment(paymentId);
  if (!payment || payment.merchant_id !== merchantId) {
    throw new Error("payment_not_found_or_permission_denied");
  }

  // Create dispute
  const { rows: [dispute] } = await pool.query(
    `INSERT INTO disputes (
      payment_id, merchant_id, customer_id, amount, currency,
      reason_code, origin, status, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8)
    RETURNING *`,
    [
      paymentId,
      merchantId,
      customerId || payment.customer_id,
      amount,
      currency,
      reasonCode,
      origin,
      { ...metadata, idempotency_key: idempotencyKey },
    ]
  );

  // Log timeline event
  await logTimelineEvent(dispute.id, actorId || null, "merchant", "created", { origin });

  // Publish webhook
  await publishEvent("merchant", merchantId, "dispute.created", {
    dispute_id: dispute.id,
    payment_id: paymentId,
    amount,
    currency,
    reason_code: reasonCode,
  });

  return dispute;
}

/**
 * Ingest dispute from network callback
 */
export async function ingestNetworkDispute(
  externalDisputeId: string,
  network: string,
  payload: any
): Promise<any> {
  // Check if already ingested
  const { rows: existed } = await pool.query(
    "SELECT * FROM disputes WHERE external_dispute_id = $1",
    [externalDisputeId]
  );
  if (existed.length) return existed[0];

  // Extract payment reference from payload
  const paymentReference = payload.payment_reference || payload.transaction_id;
  const payment = await fetchPaymentByReference(paymentReference);
  if (!payment) {
    throw new Error("payment_not_found_for_network_dispute");
  }

  // Calculate response deadline (from network payload or default 14 days)
  const responseDueAt = payload.response_due_at
    ? new Date(payload.response_due_at)
    : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  // Create dispute
  const { rows: [dispute] } = await pool.query(
    `INSERT INTO disputes (
      external_dispute_id, payment_id, merchant_id, customer_id,
      amount, currency, reason_code, origin, status, response_due_at, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, $10)
    RETURNING *`,
    [
      externalDisputeId,
      payment.id,
      payment.merchant_id,
      payment.customer_id,
      payload.amount || payment.amount,
      payload.currency || payment.currency,
      payload.reason_code || "unknown",
      "network",
      responseDueAt,
      { network, raw_payload: payload },
    ]
  );

  // Log timeline
  await logTimelineEvent(dispute.id, null, "network", "ingested", { network, externalDisputeId });

  // Request SIRA scoring asynchronously
  requestSiraScore({
    payment_id: payment.id,
    merchant_id: payment.merchant_id,
    customer_id: payment.customer_id,
    amount: dispute.amount,
    currency: dispute.currency,
    reason_code: dispute.reason_code,
  })
    .then(async (siraResult) => {
      await pool.query(
        `UPDATE disputes
         SET sira_score = $1, sira_recommendation = $2, updated_at = now()
         WHERE id = $3`,
        [siraResult.score, siraResult.recommendation, dispute.id]
      );
      await logTimelineEvent(dispute.id, null, "system", "sira_scored", {
        score: siraResult.score,
        recommendation: siraResult.recommendation,
      });
    })
    .catch((err) => console.error("SIRA scoring failed:", err));

  // Publish webhook
  await publishEvent("merchant", payment.merchant_id, "dispute.created", {
    dispute_id: dispute.id,
    external_dispute_id: externalDisputeId,
    network,
    amount: dispute.amount,
    response_due_at: responseDueAt.toISOString(),
  });

  return dispute;
}

/**
 * Get dispute by ID
 */
export async function getDispute(disputeId: string): Promise<any> {
  const { rows } = await pool.query("SELECT * FROM disputes WHERE id = $1", [disputeId]);
  if (!rows.length) throw new Error("dispute_not_found");
  return rows[0];
}

/**
 * List disputes with filters
 */
export async function listDisputes(filters: {
  merchantId?: string;
  status?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}): Promise<{ data: any[]; total: number }> {
  let whereClauses: string[] = [];
  let params: any[] = [];
  let paramIndex = 1;

  if (filters.merchantId) {
    whereClauses.push(`merchant_id = $${paramIndex++}`);
    params.push(filters.merchantId);
  }

  if (filters.status) {
    whereClauses.push(`status = $${paramIndex++}`);
    params.push(filters.status);
  }

  if (filters.fromDate) {
    whereClauses.push(`created_at >= $${paramIndex++}`);
    params.push(filters.fromDate);
  }

  if (filters.toDate) {
    whereClauses.push(`created_at <= $${paramIndex++}`);
    params.push(filters.toDate);
  }

  const whereClause = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  // Get total count
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) FROM disputes ${whereClause}`,
    params
  );
  const total = parseInt(countRows[0].count);

  // Get paginated data
  const limit = filters.limit || 20;
  const offset = filters.offset || 0;
  const { rows: data } = await pool.query(
    `SELECT * FROM disputes ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...params, limit, offset]
  );

  return { data, total };
}

/**
 * Assign dispute to ops user
 */
export async function assignDispute(
  disputeId: string,
  assignedTo: string,
  assignedBy: string
): Promise<void> {
  await pool.query(
    "UPDATE disputes SET assigned_to = $1, updated_at = now() WHERE id = $2",
    [assignedTo, disputeId]
  );

  await logTimelineEvent(disputeId, assignedBy, "ops", "assigned", { assigned_to: assignedTo });
}

/**
 * Resolve dispute (ops decision)
 */
export async function resolveDispute(
  disputeId: string,
  outcome: "merchant_won" | "merchant_lost" | "voided" | "cancelled",
  resolvedBy: string,
  networkFee: number = 0,
  details: any = {}
): Promise<any> {
  const dispute = await getDispute(disputeId);

  // Update dispute status
  const newStatus =
    outcome === "merchant_won"
      ? "won"
      : outcome === "merchant_lost"
      ? "lost"
      : outcome === "voided"
      ? "closed"
      : "cancelled";

  await pool.query(
    "UPDATE disputes SET status = $1, updated_at = now() WHERE id = $2",
    [newStatus, disputeId]
  );

  // Create resolution record
  const { rows: [resolution] } = await pool.query(
    `INSERT INTO dispute_resolutions (
      dispute_id, resolved_by, outcome, network_fee, details
    ) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [disputeId, resolvedBy, outcome, networkFee, details]
  );

  // Accounting & billing integration
  if (outcome === "merchant_lost" && networkFee > 0) {
    // Create billing charge for dispute fee
    await createBillingCharge(dispute.merchant_id, disputeId, networkFee, dispute.currency);
  } else if (outcome === "merchant_won") {
    // Create credit note if merchant had been charged
    const creditNoteRef = await createCreditNote(dispute.merchant_id, disputeId, dispute.amount, dispute.currency);
    await pool.query(
      "UPDATE dispute_resolutions SET adjustment_reference = $1 WHERE id = $2",
      [creditNoteRef, resolution.id]
    );
  }

  // Log timeline
  await logTimelineEvent(disputeId, resolvedBy, "ops", "resolved", { outcome, networkFee });

  // Publish webhook
  await publishEvent("merchant", dispute.merchant_id, "dispute.resolved", {
    dispute_id: disputeId,
    outcome,
    network_fee: networkFee,
  });

  return resolution;
}

/**
 * Helper: Log timeline event
 */
async function logTimelineEvent(
  disputeId: string,
  actorId: string | null,
  actorType: string,
  action: string,
  details: any = {}
): Promise<void> {
  await pool.query(
    `INSERT INTO dispute_timeline (dispute_id, actor_id, actor_type, action, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [disputeId, actorId, actorType, action, details]
  );
}

/**
 * Helper: Fetch payment from B41 Connect
 */
async function fetchPayment(paymentId: string): Promise<any> {
  try {
    const response = await fetch(`${PAYMENTS_URL}/api/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${SERVICE_TOKEN}` },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Helper: Fetch payment by reference
 */
async function fetchPaymentByReference(reference: string): Promise<any> {
  try {
    const response = await fetch(`${PAYMENTS_URL}/api/payments/reference/${reference}`, {
      headers: { Authorization: `Bearer ${SERVICE_TOKEN}` },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Helper: Create billing charge (B46)
 */
async function createBillingCharge(
  merchantId: string,
  disputeId: string,
  amount: number,
  currency: string
): Promise<void> {
  try {
    await fetch(`${BILLING_URL}/api/charges`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        source_module: "connect",
        merchant_id: merchantId,
        event_type: "dispute_fee",
        source_id: disputeId,
        amount,
        source_currency: currency,
        occurred_at: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error("Failed to create billing charge:", err);
  }
}

/**
 * Helper: Create credit note (B46)
 */
async function createCreditNote(
  merchantId: string,
  disputeId: string,
  amount: number,
  currency: string
): Promise<string> {
  try {
    const response = await fetch(`${BILLING_URL}/api/credit-notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        merchant_id: merchantId,
        source_module: "connect",
        source_id: disputeId,
        amount,
        currency,
        reason: "dispute_won",
      }),
    });
    const data = (await response.json()) as any;
    return data.id || "credit_note_pending";
  } catch (err) {
    console.error("Failed to create credit note:", err);
    return "credit_note_failed";
  }
}
