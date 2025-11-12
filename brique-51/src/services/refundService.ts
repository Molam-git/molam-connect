/**
 * Brique 51 - Refunds & Reversals
 * Refund Service - Core Business Logic
 */

import { pool } from "../utils/db.js";
import { publishEvent } from "../webhooks/publisher.js";
import { enqueueRefundJob } from "../workers/refundQueue.js";
import { computeSiraScoreForRefund } from "../sira/refundScorer.js";
import { createLedgerHold } from "../ledger/service.js";

export interface CreateRefundInput {
  paymentId: string;
  originModule: string;
  initiator: "merchant" | "customer" | "ops" | "system";
  initiatorId?: string;
  type: "refund" | "reversal";
  amount: number;
  currency: string;
  reason?: string;
  idempotencyKey?: string;
  refundMethod?: "to_card" | "to_wallet" | "to_bank" | "to_agent";
}

/**
 * Create a refund or reversal
 */
export async function createRefund(input: CreateRefundInput): Promise<any> {
  // 1) Idempotency check
  if (input.idempotencyKey) {
    const { rows: existed } = await pool.query(`SELECT * FROM refunds WHERE idempotency_key = $1`, [
      input.idempotencyKey,
    ]);

    if (existed.length) {
      console.log(`[Refund] Idempotency key ${input.idempotencyKey} already exists`);
      return existed[0];
    }
  }

  // 2) Get refund policy for merchant
  const policy = await getRefundPolicy(input.initiatorId);

  // 3) SIRA scoring
  const sira = await computeSiraScoreForRefund(input);
  const siraThreshold = policy?.sira_manual_threshold || 0.7;

  // 4) Determine status based on SIRA and policy
  let status = "processing";

  if (sira.probability > siraThreshold) {
    status = "requires_approval";
  } else if (policy && input.amount > policy.requires_approval_threshold) {
    status = "requires_approval";
  } else if (policy && input.amount > policy.auto_approve_threshold) {
    status = "requires_approval";
  }

  // 5) Create ledger holds for refund reserve if needed
  if (input.type === "refund" && status === "processing") {
    await createLedgerHold({
      paymentId: input.paymentId,
      amount: input.amount,
      currency: input.currency,
      reason: "refund_pending",
    });
  }

  // 6) Insert refund record
  const { rows } = await pool.query(
    `INSERT INTO refunds(
      payment_id, origin_module, initiator, initiator_id, type,
      amount, currency, status, reason, idempotency_key,
      sira_score, refund_method, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now())
    RETURNING *`,
    [
      input.paymentId,
      input.originModule,
      input.initiator,
      input.initiatorId || null,
      input.type,
      input.amount,
      input.currency,
      status,
      input.reason || null,
      input.idempotencyKey || null,
      sira.probability,
      input.refundMethod || null,
    ]
  );

  const refund = rows[0];

  // 7) Create initial event
  await pool.query(
    `INSERT INTO refund_events(refund_id, event_type, payload, created_at)
     VALUES ($1, 'created', $2, now())`,
    [refund.id, { sira, policy }]
  );

  // 8) Process or notify
  if (status === "processing") {
    // Enqueue background job to execute
    await enqueueRefundJob(refund.id);
  } else {
    // Notify ops for approval
    await publishEvent("internal", "ops", "refund.requires_approval", {
      refund_id: refund.id,
      sira,
      amount: input.amount,
      currency: input.currency,
    });
  }

  // 9) Publish created event
  await publishEvent(input.initiator, input.originModule, "refund.created", {
    refund_id: refund.id,
    payment_id: input.paymentId,
    amount: input.amount,
    currency: input.currency,
    status,
  });

  return refund;
}

/**
 * Get refund by ID
 */
export async function getRefundById(refundId: string): Promise<any> {
  const { rows } = await pool.query(`SELECT * FROM refunds WHERE id = $1`, [refundId]);

  if (rows.length === 0) {
    throw new Error("refund_not_found");
  }

  return rows[0];
}

/**
 * List refunds with filters
 */
export async function listRefunds(filters: any = {}): Promise<any[]> {
  let query = `SELECT * FROM refunds WHERE 1=1`;
  const params: any[] = [];

  if (filters.status) {
    params.push(filters.status);
    query += ` AND status = $${params.length}`;
  }

  if (filters.initiator) {
    params.push(filters.initiator);
    query += ` AND initiator = $${params.length}`;
  }

  if (filters.paymentId) {
    params.push(filters.paymentId);
    query += ` AND payment_id = $${params.length}`;
  }

  query += ` ORDER BY created_at DESC LIMIT 200`;

  const { rows } = await pool.query(query, params);
  return rows;
}

/**
 * Get refund policy for merchant
 */
async function getRefundPolicy(merchantId?: string): Promise<any> {
  const { rows } = await pool.query(
    `SELECT * FROM refund_policies WHERE merchant_id = $1 OR merchant_id = '00000000-0000-0000-0000-000000000000' ORDER BY created_at DESC LIMIT 1`,
    [merchantId || "00000000-0000-0000-0000-000000000000"]
  );

  return rows[0] || null;
}

/**
 * Approve refund (Ops action)
 */
export async function approveRefund(refundId: string, approverId: string, approverRole: string, note?: string): Promise<void> {
  // Create approval record
  await pool.query(
    `INSERT INTO refund_approvals(refund_id, approver_id, approver_role, decision, note, created_at)
     VALUES ($1, $2, $3, 'approved', $4, now())`,
    [refundId, approverId, approverRole, note || null]
  );

  // Update refund status to processing
  await pool.query(`UPDATE refunds SET status = 'processing', updated_at = now() WHERE id = $1`, [refundId]);

  // Create event
  await pool.query(
    `INSERT INTO refund_events(refund_id, event_type, payload, created_at)
     VALUES ($1, 'approved', $2, now())`,
    [refundId, { approver_id: approverId, note }]
  );

  // Enqueue for processing
  await enqueueRefundJob(refundId);

  // Publish event
  await publishEvent("internal", "ops", "refund.approved", {
    refund_id: refundId,
    approver_id: approverId,
  });
}

/**
 * Reject refund (Ops action)
 */
export async function rejectRefund(refundId: string, approverId: string, approverRole: string, note?: string): Promise<void> {
  // Create approval record
  await pool.query(
    `INSERT INTO refund_approvals(refund_id, approver_id, approver_role, decision, note, created_at)
     VALUES ($1, $2, $3, 'rejected', $4, now())`,
    [refundId, approverId, approverRole, note || null]
  );

  // Update refund status to cancelled
  await pool.query(`UPDATE refunds SET status = 'cancelled', updated_at = now() WHERE id = $1`, [refundId]);

  // Create event
  await pool.query(
    `INSERT INTO refund_events(refund_id, event_type, payload, created_at)
     VALUES ($1, 'rejected', $2, now())`,
    [refundId, { approver_id: approverId, note }]
  );

  // Publish event
  await publishEvent("internal", "ops", "refund.rejected", {
    refund_id: refundId,
    approver_id: approverId,
  });
}
