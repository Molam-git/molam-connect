// ============================================================================
// Merchant Service - Core business logic
// ============================================================================

import { pool } from "../utils/db";
import { logger } from "../utils/logger";
import { computeKPIsFromMV, cacheKPIs, KPISummary } from "./kpiHelpers";
import { publishEvent } from "./webhookPublisher";
import axios from "axios";

const RISK_AWARE_APPROVALS_URL =
  process.env.RISK_AWARE_APPROVALS_URL || "http://risk-aware-approvals:3000";
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || "";

/**
 * Get merchant dashboard summary with KPIs
 */
export async function getMerchantSummary(
  merchantId: string,
  period: string,
  currency: string
): Promise<KPISummary> {
  // Try cache first
  const { rows } = await pool.query(
    `SELECT kpi_key, value, currency, usd_equivalent, txn_count
     FROM merchant_kpis_cache
     WHERE merchant_id = $1 AND period = $2`,
    [merchantId, period]
  );

  // Check cache freshness (< 2 minutes old)
  const cacheAge = rows.length > 0 ? Date.now() - new Date(rows[0].computed_at).getTime() : Infinity;
  const isFresh = cacheAge < 120000; // 2 minutes

  if (rows.length > 0 && isFresh) {
    const kpi: any = {};
    for (const r of rows) {
      kpi[r.kpi_key] = {
        value: parseFloat(r.value),
        currency: r.currency,
        usd_equivalent: r.usd_equivalent ? parseFloat(r.usd_equivalent) : undefined,
        txn_count: r.txn_count || undefined,
      };
    }

    logger.info("KPIs served from cache", { merchant_id: merchantId, period });
    return kpi;
  }

  // Compute from materialized view
  const kpi = await computeKPIsFromMV(merchantId, period, currency);

  // Cache for next request
  await cacheKPIs(merchantId, period, kpi);

  return kpi;
}

/**
 * Get paginated transactions list
 */
export async function getTransactions(merchantId: string, query: any): Promise<any> {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Number(query.limit) || 50);
  const offset = (page - 1) * limit;

  const filters: string[] = [];
  const params: any[] = [merchantId];
  let paramIndex = 2;

  // Status filter
  if (query.status) {
    filters.push(`status = $${paramIndex++}`);
    params.push(query.status);
  }

  // Date range filter
  if (query.from && query.to) {
    filters.push(`occurred_at >= $${paramIndex++} AND occurred_at <= $${paramIndex++}`);
    params.push(query.from, query.to);
  }

  // Currency filter
  if (query.currency) {
    filters.push(`currency = $${paramIndex++}`);
    params.push(query.currency);
  }

  // Type filter (payment, refund)
  if (query.type) {
    filters.push(`type = $${paramIndex++}`);
    params.push(query.type);
  }

  // Channel filter (wallet, card, bank_transfer)
  if (query.channel) {
    filters.push(`channel = $${paramIndex++}`);
    params.push(query.channel);
  }

  const whereClause = filters.length > 0 ? `AND ${filters.join(" AND ")}` : "";

  // Get total count
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) as total FROM wallet_transactions WHERE merchant_id = $1 ${whereClause}`,
    params.slice(0, paramIndex - 1)
  );

  const total = parseInt(countRows[0].total, 10);

  // Get transactions
  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT
      id,
      type,
      amount,
      currency,
      fee_molam,
      status,
      reference_code,
      channel,
      occurred_at,
      customer ->> 'email' AS customer_email,
      customer ->> 'name' AS customer_name,
      metadata
    FROM wallet_transactions
    WHERE merchant_id = $1 ${whereClause}
    ORDER BY occurred_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    params
  );

  return {
    page,
    limit,
    total,
    total_pages: Math.ceil(total / limit),
    rows,
  };
}

/**
 * Initiate refund (with approval if threshold exceeded)
 */
export async function refundTransaction(
  merchantId: string,
  txnId: string,
  amount: number,
  reason: string,
  actorId: string,
  evidence?: string[]
): Promise<any> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Get transaction
    const { rows: txns } = await client.query(
      `SELECT * FROM wallet_transactions WHERE id = $1 AND merchant_id = $2`,
      [txnId, merchantId]
    );

    if (txns.length === 0) {
      throw new Error("transaction_not_found");
    }

    const txn = txns[0];

    if (txn.status !== "succeeded") {
      throw new Error("cannot_refund_non_succeeded_txn");
    }

    if (amount > txn.amount) {
      throw new Error("refund_amount_exceeds_transaction_amount");
    }

    // Check if refund requires approval
    const { rows: dashboardRows } = await client.query(
      `SELECT dashboard_config FROM merchant_dashboards WHERE merchant_id = $1`,
      [merchantId]
    );

    const config = dashboardRows[0]?.dashboard_config || {};
    const refundThreshold = config.refund_threshold_requiring_approval || 100000;
    const requiresApproval = amount >= refundThreshold;

    let approvalId: string | null = null;

    if (requiresApproval) {
      // Create approval request via B136ter
      try {
        const approvalResponse = await axios.post(
          `${RISK_AWARE_APPROVALS_URL}/api/approvals`,
          {
            action_type: "refund.merchant_initiated",
            origin_module: "merchant_dashboard",
            origin_entity_id: txnId,
            payload: {
              amount,
              currency: txn.currency,
              origin_country: txn.metadata?.country || "CI",
              account_country: txn.metadata?.country || "CI",
              business_hours: true,
              description: `Merchant refund: ${reason}`,
            },
            created_by: actorId,
            expires_in_minutes: 60,
          },
          {
            headers: {
              Authorization: `Bearer ${SERVICE_TOKEN}`,
              "Content-Type": "application/json",
            },
            timeout: 10000,
          }
        );

        approvalId = approvalResponse.data.approval_id;

        logger.info("Approval request created for refund", {
          merchant_id: merchantId,
          txn_id: txnId,
          approval_id: approvalId,
          amount,
        });
      } catch (error: any) {
        logger.error("Failed to create approval request", {
          merchant_id: merchantId,
          txn_id: txnId,
          error: error.message,
        });
        throw new Error("approval_request_failed");
      }
    }

    // Create refund record
    const { rows: refundRows } = await client.query(
      `INSERT INTO refunds(transaction_id, merchant_id, amount, currency, reason, created_by, requires_approval, approval_id, status, evidence_urls)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        txnId,
        merchantId,
        amount,
        txn.currency,
        reason,
        actorId,
        requiresApproval,
        approvalId,
        requiresApproval ? "pending" : "processing",
        evidence || [],
      ]
    );

    const refund = refundRows[0];

    // If no approval required, process immediately
    if (!requiresApproval) {
      // Create ledger reversal entries (call to ledger service)
      // TODO: Call ledger service to create double-entry reversal

      // Update transaction status
      await client.query(
        `UPDATE wallet_transactions SET status = 'refunded', metadata = metadata || $1::jsonb WHERE id = $2`,
        [JSON.stringify({ refund_id: refund.id, refund_amount: amount }), txnId]
      );

      // Update refund status
      await client.query(
        `UPDATE refunds SET status = 'completed', completed_at = now() WHERE id = $1`,
        [refund.id]
      );
    }

    // Audit log
    await client.query(
      `INSERT INTO merchant_actions_audit(merchant_id, user_id, action_type, resource_type, resource_id, requires_2fa, approval_required, approval_id, changes)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        merchantId,
        actorId,
        "refund_initiated",
        "transaction",
        txnId,
        false,
        requiresApproval,
        approvalId,
        JSON.stringify({ amount, reason, requires_approval: requiresApproval }),
      ]
    );

    await client.query("COMMIT");

    // Publish webhook event
    await publishEvent(merchantId, "refund.created", {
      refund_id: refund.id,
      transaction_id: txnId,
      amount,
      currency: txn.currency,
      status: refund.status,
      requires_approval: requiresApproval,
    });

    logger.info("Refund initiated", {
      merchant_id: merchantId,
      refund_id: refund.id,
      txn_id: txnId,
      amount,
      requires_approval: requiresApproval,
    });

    return refund;
  } catch (error: any) {
    await client.query("ROLLBACK");
    logger.error("Failed to initiate refund", {
      merchant_id: merchantId,
      txn_id: txnId,
      error: error.message,
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get merchant payouts
 */
export async function getPayouts(merchantId: string, query: any): Promise<any> {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Number(query.limit) || 50);
  const offset = (page - 1) * limit;

  const filters: string[] = [];
  const params: any[] = [merchantId];
  let paramIndex = 2;

  if (query.status) {
    filters.push(`status = $${paramIndex++}`);
    params.push(query.status);
  }

  const whereClause = filters.length > 0 ? `AND ${filters.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT
      id,
      amount,
      currency,
      status,
      scheduled_date,
      paid_at,
      fee,
      metadata
    FROM payouts
    WHERE origin_module = 'connect' AND origin_entity_id = $1 ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...params, limit, offset]
  );

  return { page, limit, rows };
}

/**
 * Get merchant disputes
 */
export async function getDisputes(merchantId: string, query: any): Promise<any> {
  const { rows } = await pool.query(
    `SELECT
      id,
      transaction_id,
      type,
      reason,
      amount,
      currency,
      status,
      evidence_required,
      evidence_deadline,
      evidence_submitted_at,
      created_at,
      resolved_at
    FROM disputes
    WHERE merchant_id = $1
    ORDER BY created_at DESC
    LIMIT 100`,
    [merchantId]
  );

  return rows;
}

/**
 * Upload dispute evidence
 */
export async function uploadDisputeEvidence(
  merchantId: string,
  disputeId: string,
  evidenceUrls: string[],
  actorId: string
): Promise<void> {
  await pool.query(
    `UPDATE disputes
     SET evidence_urls = $1, evidence_submitted_at = now(), updated_at = now()
     WHERE id = $2 AND merchant_id = $3`,
    [evidenceUrls, disputeId, merchantId]
  );

  // Audit log
  await pool.query(
    `INSERT INTO merchant_actions_audit(merchant_id, user_id, action_type, resource_type, resource_id, changes)
     VALUES($1, $2, $3, $4, $5, $6)`,
    [
      merchantId,
      actorId,
      "dispute_evidence_uploaded",
      "dispute",
      disputeId,
      JSON.stringify({ evidence_urls: evidenceUrls }),
    ]
  );

  logger.info("Dispute evidence uploaded", {
    merchant_id: merchantId,
    dispute_id: disputeId,
    evidence_count: evidenceUrls.length,
  });
}

/**
 * Update payout schedule
 */
export async function updatePayoutSchedule(
  merchantId: string,
  schedule: string,
  actorId: string
): Promise<void> {
  const validSchedules = ["daily", "weekly", "monthly", "instant"];
  if (!validSchedules.includes(schedule)) {
    throw new Error("invalid_payout_schedule");
  }

  await pool.query(
    `UPDATE merchant_dashboards SET payout_schedule = $1, updated_at = now() WHERE merchant_id = $2`,
    [schedule, merchantId]
  );

  // Audit log
  await pool.query(
    `INSERT INTO merchant_actions_audit(merchant_id, user_id, action_type, resource_type, changes)
     VALUES($1, $2, $3, $4, $5)`,
    [
      merchantId,
      actorId,
      "payout_schedule_changed",
      "settings",
      JSON.stringify({ payout_schedule: schedule }),
    ]
  );

  logger.info("Payout schedule updated", { merchant_id: merchantId, schedule });
}

/**
 * Get merchant alerts (SIRA anomalies, thresholds)
 */
export async function getAlerts(merchantId: string): Promise<any> {
  const { rows } = await pool.query(
    `SELECT * FROM merchant_alerts WHERE merchant_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 50`,
    [merchantId]
  );

  return rows;
}
