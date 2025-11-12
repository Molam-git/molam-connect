// ============================================================================
// Settlements Service
// Purpose: Manage settlement batch creation and execution
// ============================================================================

import { SplitSettlement, CreateSettlementInput, RecipientType } from '../types';
import pool from '../db';

/**
 * Create a new settlement batch
 */
export async function createSettlement(input: CreateSettlementInput): Promise<SplitSettlement> {
  const {
    platform_id,
    recipient_id,
    recipient_type,
    settlement_period_start,
    settlement_period_end,
    scheduled_at,
    currency = 'USD',
    metadata = {},
  } = input;

  // Generate unique batch ID
  const batch_id = generateSettlementBatchId(platform_id, recipient_type);

  const { rows } = await pool.query<SplitSettlement>(
    `INSERT INTO split_settlements (
      settlement_batch_id, platform_id, recipient_id, recipient_type,
      settlement_period_start, settlement_period_end, scheduled_at,
      currency, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      batch_id,
      platform_id,
      recipient_id,
      recipient_type,
      settlement_period_start,
      settlement_period_end,
      scheduled_at,
      currency,
      JSON.stringify(metadata),
    ]
  );

  // Audit log
  await pool.query(
    `INSERT INTO molam_audit_logs (brique_id, entity_type, entity_id, action, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      'brique-64',
      'settlement',
      rows[0].id,
      'created',
      JSON.stringify({ batch_id, recipient_type, scheduled_at }),
    ]
  );

  return rows[0];
}

/**
 * Get settlement by ID
 */
export async function getSettlementById(id: string): Promise<SplitSettlement | null> {
  const { rows } = await pool.query<SplitSettlement>(
    'SELECT * FROM split_settlements WHERE id = $1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Get settlement by batch ID
 */
export async function getSettlementByBatchId(
  batch_id: string
): Promise<SplitSettlement | null> {
  const { rows } = await pool.query<SplitSettlement>(
    'SELECT * FROM split_settlements WHERE settlement_batch_id = $1',
    [batch_id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * List settlements for a platform
 */
export async function listSettlements(
  platform_id: string,
  filters?: {
    recipient_id?: string;
    status?: string;
    from_date?: Date;
    to_date?: Date;
    limit?: number;
    offset?: number;
  }
): Promise<SplitSettlement[]> {
  const { recipient_id, status, from_date, to_date, limit = 100, offset = 0 } = filters || {};

  let query = 'SELECT * FROM split_settlements WHERE platform_id = $1';
  const params: any[] = [platform_id];
  let paramIndex = 2;

  if (recipient_id) {
    query += ` AND recipient_id = $${paramIndex}`;
    params.push(recipient_id);
    paramIndex++;
  }

  if (status) {
    query += ` AND status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  if (from_date) {
    query += ` AND scheduled_at >= $${paramIndex}`;
    params.push(from_date);
    paramIndex++;
  }

  if (to_date) {
    query += ` AND scheduled_at <= $${paramIndex}`;
    params.push(to_date);
    paramIndex++;
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const { rows } = await pool.query<SplitSettlement>(query, params);
  return rows;
}

/**
 * Update settlement status
 */
export async function updateSettlementStatus(
  id: string,
  status: 'scheduled' | 'processing' | 'completed' | 'partial' | 'failed' | 'cancelled',
  metadata?: {
    payout_id?: string;
    payout_method?: 'wallet' | 'bank_transfer' | 'check';
    payout_reference?: string;
  }
): Promise<SplitSettlement> {
  const fields: string[] = ['status = $1', 'updated_at = NOW()'];
  const params: any[] = [status, id];
  let paramIndex = 3;

  if (status === 'processing') {
    fields.push('executed_at = NOW()');
  }

  if (status === 'completed') {
    fields.push('completed_at = NOW()');
  }

  if (metadata?.payout_id) {
    fields.push(`payout_id = $${paramIndex++}`);
    params.splice(-1, 0, metadata.payout_id);
  }

  if (metadata?.payout_method) {
    fields.push(`payout_method = $${paramIndex++}`);
    params.splice(-1, 0, metadata.payout_method);
  }

  if (metadata?.payout_reference) {
    fields.push(`payout_reference = $${paramIndex++}`);
    params.splice(-1, 0, metadata.payout_reference);
  }

  const query = `UPDATE split_settlements SET ${fields.join(', ')} WHERE id = $${
    params.length
  } RETURNING *`;

  const { rows } = await pool.query<SplitSettlement>(query, params);

  if (rows.length === 0) {
    throw new Error(`Settlement ${id} not found`);
  }

  // Audit log
  await pool.query(
    `INSERT INTO molam_audit_logs (brique_id, entity_type, entity_id, action, changes)
     VALUES ($1, $2, $3, $4, $5)`,
    ['brique-64', 'settlement', id, 'status_updated', JSON.stringify({ new_status: status })]
  );

  return rows[0];
}

/**
 * Update settlement counts and amounts based on assigned splits
 */
export async function updateSettlementTotals(settlement_id: string): Promise<SplitSettlement> {
  const { rows } = await pool.query<SplitSettlement>(
    `UPDATE split_settlements s
     SET total_splits_count = (
       SELECT COUNT(*)
       FROM payment_splits ps
       WHERE ps.settlement_id = s.id
     ),
     total_amount = (
       SELECT COALESCE(SUM(split_amount), 0)
       FROM payment_splits ps
       WHERE ps.settlement_id = s.id
     ),
     failed_splits_count = (
       SELECT COUNT(*)
       FROM payment_splits ps
       WHERE ps.settlement_id = s.id AND ps.status = 'failed'
     ),
     updated_at = NOW()
     WHERE s.id = $1
     RETURNING *`,
    [settlement_id]
  );

  if (rows.length === 0) {
    throw new Error(`Settlement ${settlement_id} not found`);
  }

  return rows[0];
}

/**
 * Mark settlement as requiring manual review
 */
export async function flagForManualReview(
  id: string,
  risk_score: number,
  risk_flags: string[]
): Promise<SplitSettlement> {
  const { rows } = await pool.query<SplitSettlement>(
    `UPDATE split_settlements
     SET requires_manual_review = true,
         risk_score = $1,
         risk_flags = $2,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [risk_score, JSON.stringify(risk_flags), id]
  );

  if (rows.length === 0) {
    throw new Error(`Settlement ${id} not found`);
  }

  return rows[0];
}

/**
 * Approve settlement after manual review
 */
export async function approveSettlement(id: string, reviewed_by: string): Promise<SplitSettlement> {
  const { rows } = await pool.query<SplitSettlement>(
    `UPDATE split_settlements
     SET requires_manual_review = false,
         reviewed_by = $1,
         reviewed_at = NOW(),
         updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [reviewed_by, id]
  );

  if (rows.length === 0) {
    throw new Error(`Settlement ${id} not found`);
  }

  // Audit log
  await pool.query(
    `INSERT INTO molam_audit_logs (brique_id, entity_type, entity_id, action, actor_id)
     VALUES ($1, $2, $3, $4, $5)`,
    ['brique-64', 'settlement', id, 'approved', reviewed_by]
  );

  return rows[0];
}

/**
 * Record settlement failure
 */
export async function recordSettlementFailure(
  id: string,
  failed_splits: Array<{ split_id: string; reason: string }>
): Promise<SplitSettlement> {
  const { rows } = await pool.query<SplitSettlement>(
    `UPDATE split_settlements
     SET failure_summary = $1,
         status = CASE
           WHEN failed_splits_count = total_splits_count THEN 'failed'::settlement_status
           ELSE 'partial'::settlement_status
         END,
         updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [JSON.stringify(failed_splits), id]
  );

  if (rows.length === 0) {
    throw new Error(`Settlement ${id} not found`);
  }

  return rows[0];
}

/**
 * Get settlements ready for execution
 */
export async function getSettlementsDueForExecution(): Promise<SplitSettlement[]> {
  const { rows } = await pool.query<SplitSettlement>(
    `SELECT * FROM split_settlements
     WHERE status = 'scheduled'
       AND scheduled_at <= NOW()
       AND (requires_manual_review = false OR reviewed_at IS NOT NULL)
     ORDER BY scheduled_at ASC
     LIMIT 100`
  );

  return rows;
}

/**
 * Generate unique settlement batch ID
 */
function generateSettlementBatchId(platform_id: string, recipient_type: RecipientType): string {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0];
  const timeStr = date.getTime().toString().slice(-6);
  const platformShort = platform_id.split('-')[0].slice(0, 8);
  return `SETTLE-${dateStr}-${platformShort}-${recipient_type.toUpperCase()}-${timeStr}`;
}

/**
 * Get settlement statistics by platform
 */
export async function getSettlementStatistics(
  platform_id: string,
  from_date: Date,
  to_date: Date
): Promise<{
  total_settlements: number;
  total_amount: number;
  by_status: Record<string, number>;
  by_recipient_type: Record<string, { count: number; amount: number }>;
}> {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) as total_settlements,
       SUM(total_amount) as total_amount,
       jsonb_object_agg(status, status_count) FILTER (WHERE status IS NOT NULL) as by_status,
       jsonb_object_agg(
         recipient_type,
         jsonb_build_object('count', type_count, 'amount', type_amount)
       ) FILTER (WHERE recipient_type IS NOT NULL) as by_recipient_type
     FROM (
       SELECT DISTINCT
         status,
         COUNT(*) OVER (PARTITION BY status) as status_count,
         recipient_type,
         COUNT(*) OVER (PARTITION BY recipient_type) as type_count,
         SUM(total_amount) OVER (PARTITION BY recipient_type) as type_amount
       FROM split_settlements
       WHERE platform_id = $1
         AND created_at >= $2
         AND created_at <= $3
     ) subq`,
    [platform_id, from_date, to_date]
  );

  if (rows.length === 0 || !rows[0].total_settlements) {
    return {
      total_settlements: 0,
      total_amount: 0,
      by_status: {},
      by_recipient_type: {},
    };
  }

  return {
    total_settlements: parseInt(rows[0].total_settlements || '0'),
    total_amount: parseInt(rows[0].total_amount || '0'),
    by_status: rows[0].by_status || {},
    by_recipient_type: rows[0].by_recipient_type || {},
  };
}
