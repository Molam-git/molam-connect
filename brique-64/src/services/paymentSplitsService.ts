// ============================================================================
// Payment Splits Service
// Purpose: Manage payment split execution and tracking
// ============================================================================

import { PaymentSplit, CreatePaymentSplitInput } from '../types';
import pool from '../db';

/**
 * Create payment splits for a transaction
 */
export async function createPaymentSplits(
  inputs: CreatePaymentSplitInput[]
): Promise<PaymentSplit[]> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const splits: PaymentSplit[] = [];

    for (const input of inputs) {
      const { rows } = await client.query<PaymentSplit>(
        `INSERT INTO payment_splits (
          payment_id, split_rule_id, platform_id, merchant_id, customer_id,
          recipient_id, recipient_type, recipient_account_id,
          total_payment_amount, split_amount, currency, calculation_basis, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          input.payment_id,
          input.split_rule_id,
          input.platform_id,
          input.merchant_id,
          input.customer_id || null,
          input.recipient_id,
          input.recipient_type,
          input.recipient_account_id || null,
          input.total_payment_amount,
          input.split_amount,
          input.currency,
          JSON.stringify(input.calculation_basis),
          JSON.stringify(input.metadata || {}),
        ]
      );

      splits.push(rows[0]);

      // Audit log
      await client.query(
        `INSERT INTO molam_audit_logs (brique_id, entity_type, entity_id, action, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'brique-64',
          'payment_split',
          rows[0].id,
          'created',
          JSON.stringify({
            payment_id: input.payment_id,
            recipient_type: input.recipient_type,
            amount: input.split_amount,
          }),
        ]
      );
    }

    await client.query('COMMIT');
    return splits;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get splits for a payment
 */
export async function getSplitsByPaymentId(payment_id: string): Promise<PaymentSplit[]> {
  const { rows } = await pool.query<PaymentSplit>(
    'SELECT * FROM payment_splits WHERE payment_id = $1 ORDER BY created_at',
    [payment_id]
  );
  return rows;
}

/**
 * Get split by ID
 */
export async function getSplitById(id: string): Promise<PaymentSplit | null> {
  const { rows } = await pool.query<PaymentSplit>('SELECT * FROM payment_splits WHERE id = $1', [
    id,
  ]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * List splits by recipient
 */
export async function getSplitsByRecipient(
  recipient_id: string,
  filters?: {
    status?: string;
    from_date?: Date;
    to_date?: Date;
    limit?: number;
    offset?: number;
  }
): Promise<PaymentSplit[]> {
  const { status, from_date, to_date, limit = 100, offset = 0 } = filters || {};

  let query = 'SELECT * FROM payment_splits WHERE recipient_id = $1';
  const params: any[] = [recipient_id];
  let paramIndex = 2;

  if (status) {
    query += ` AND status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  if (from_date) {
    query += ` AND created_at >= $${paramIndex}`;
    params.push(from_date);
    paramIndex++;
  }

  if (to_date) {
    query += ` AND created_at <= $${paramIndex}`;
    params.push(to_date);
    paramIndex++;
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const { rows } = await pool.query<PaymentSplit>(query, params);
  return rows;
}

/**
 * Update split status
 */
export async function updateSplitStatus(
  id: string,
  status: 'pending' | 'processing' | 'settled' | 'failed' | 'reversed',
  metadata?: {
    settlement_id?: string;
    failure_reason?: string;
    payout_reference?: string;
  }
): Promise<PaymentSplit> {
  const fields: string[] = ['status = $1', 'updated_at = NOW()'];
  const params: any[] = [status, id];
  let paramIndex = 3;

  if (status === 'settled') {
    fields.push('settled_at = NOW()');
  }

  if (metadata?.settlement_id) {
    fields.push(`settlement_id = $${paramIndex++}`);
    params.splice(-1, 0, metadata.settlement_id);
  }

  if (metadata?.failure_reason) {
    fields.push(`failure_reason = $${paramIndex++}`);
    params.splice(-1, 0, metadata.failure_reason);
  }

  const query = `UPDATE payment_splits SET ${fields.join(', ')} WHERE id = $${
    params.length
  } RETURNING *`;

  const { rows } = await pool.query<PaymentSplit>(query, params);

  if (rows.length === 0) {
    throw new Error(`Payment split ${id} not found`);
  }

  // Audit log
  await pool.query(
    `INSERT INTO molam_audit_logs (brique_id, entity_type, entity_id, action, changes)
     VALUES ($1, $2, $3, $4, $5)`,
    ['brique-64', 'payment_split', id, 'status_updated', JSON.stringify({ new_status: status })]
  );

  return rows[0];
}

/**
 * Mark split for retry
 */
export async function scheduleRetry(id: string, next_retry_at: Date): Promise<PaymentSplit> {
  const { rows } = await pool.query<PaymentSplit>(
    `UPDATE payment_splits
     SET retry_count = retry_count + 1,
         next_retry_at = $1,
         updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [next_retry_at, id]
  );

  if (rows.length === 0) {
    throw new Error(`Payment split ${id} not found`);
  }

  return rows[0];
}

/**
 * Get pending splits ready for settlement
 */
export async function getPendingSplitsForSettlement(
  platform_id: string,
  recipient_id: string,
  currency: string = 'USD'
): Promise<PaymentSplit[]> {
  const { rows } = await pool.query<PaymentSplit>(
    `SELECT * FROM payment_splits
     WHERE platform_id = $1
       AND recipient_id = $2
       AND currency = $3
       AND status = 'pending'
       AND settlement_id IS NULL
       AND (risk_score IS NULL OR risk_score < 90)
     ORDER BY created_at ASC`,
    [platform_id, recipient_id, currency]
  );

  return rows;
}

/**
 * Assign splits to a settlement batch
 */
export async function assignSplitsToSettlement(
  split_ids: string[],
  settlement_id: string
): Promise<void> {
  if (split_ids.length === 0) return;

  await pool.query(
    `UPDATE payment_splits
     SET settlement_id = $1, status = 'processing', updated_at = NOW()
     WHERE id = ANY($2::uuid[])`,
    [settlement_id, split_ids]
  );
}

/**
 * Update SIRA risk score for a split
 */
export async function updateRiskScore(
  id: string,
  risk_score: number,
  risk_flags: string[]
): Promise<PaymentSplit> {
  const { rows } = await pool.query<PaymentSplit>(
    `UPDATE payment_splits
     SET risk_score = $1,
         risk_flags = $2,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [risk_score, JSON.stringify(risk_flags), id]
  );

  if (rows.length === 0) {
    throw new Error(`Payment split ${id} not found`);
  }

  return rows[0];
}

/**
 * Get split statistics by platform
 */
export async function getSplitStatistics(
  platform_id: string,
  from_date: Date,
  to_date: Date
): Promise<{
  total_splits: number;
  total_amount: number;
  by_status: Record<string, { count: number; amount: number }>;
  by_recipient_type: Record<string, { count: number; amount: number }>;
}> {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) as total_splits,
       SUM(split_amount) as total_amount,
       jsonb_object_agg(
         status,
         jsonb_build_object('count', status_count, 'amount', status_amount)
       ) FILTER (WHERE status IS NOT NULL) as by_status,
       jsonb_object_agg(
         recipient_type,
         jsonb_build_object('count', type_count, 'amount', type_amount)
       ) FILTER (WHERE recipient_type IS NOT NULL) as by_recipient_type
     FROM (
       SELECT
         status,
         COUNT(*) OVER (PARTITION BY status) as status_count,
         SUM(split_amount) OVER (PARTITION BY status) as status_amount,
         recipient_type,
         COUNT(*) OVER (PARTITION BY recipient_type) as type_count,
         SUM(split_amount) OVER (PARTITION BY recipient_type) as type_amount
       FROM payment_splits
       WHERE platform_id = $1
         AND created_at >= $2
         AND created_at <= $3
       LIMIT 1
     ) subq`,
    [platform_id, from_date, to_date]
  );

  if (rows.length === 0) {
    return {
      total_splits: 0,
      total_amount: 0,
      by_status: {},
      by_recipient_type: {},
    };
  }

  return {
    total_splits: parseInt(rows[0].total_splits || '0'),
    total_amount: parseInt(rows[0].total_amount || '0'),
    by_status: rows[0].by_status || {},
    by_recipient_type: rows[0].by_recipient_type || {},
  };
}
