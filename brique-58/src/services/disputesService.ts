import { pool } from '../utils/db';
import { Counter, Histogram } from 'prom-client';
import * as siraService from './siraService';

const disputeCreatedCounter = new Counter({
  name: 'molam_disputes_created_total',
  help: 'Total disputes created',
  labelNames: ['merchant_id', 'origin', 'network'],
});

const disputeResolutionHistogram = new Histogram({
  name: 'molam_dispute_resolution_duration_seconds',
  help: 'Time from creation to resolution',
  labelNames: ['outcome', 'merchant_id'],
  buckets: [86400, 259200, 604800, 1209600, 2592000], // 1d, 3d, 7d, 14d, 30d in seconds
});

export interface CreateDisputeInput {
  dispute_ref: string;
  origin: 'network' | 'bank' | 'merchant' | 'internal';
  origin_details: any;
  payment_id?: string;
  merchant_id: string;
  customer_id?: string;
  amount: number;
  currency: string;
  country?: string;
  reason_code: string;
  reason_description?: string;
  network?: string;
  network_deadline?: Date;
  actorId?: string;
}

export interface Dispute {
  id: string;
  dispute_ref: string;
  origin: string;
  origin_details: any;
  payment_id: string | null;
  merchant_id: string;
  customer_id: string | null;
  amount: number;
  currency: string;
  country: string | null;
  status: string;
  reason_code: string;
  reason_description: string | null;
  network: string | null;
  network_deadline: string | null;
  submitted_at: string | null;
  resolved_at: string | null;
  outcome: string | null;
  network_response: any;
  sira_score: any;
  hold_amount: number | null;
  fees_charged: number;
  metadata: any;
  created_at: string;
  updated_at: string;
}

/**
 * Create a new dispute
 */
export async function createDispute(input: CreateDisputeInput): Promise<Dispute> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check for duplicate dispute_ref (idempotency)
    const { rows: existing } = await client.query<Dispute>(
      'SELECT * FROM disputes WHERE dispute_ref = $1',
      [input.dispute_ref]
    );

    if (existing.length > 0) {
      await client.query('COMMIT');
      return existing[0];
    }

    // Create dispute
    const { rows } = await client.query<Dispute>(
      `INSERT INTO disputes (
        dispute_ref, origin, origin_details, payment_id, merchant_id, customer_id,
        amount, currency, country, status, reason_code, reason_description,
        network, network_deadline
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        input.dispute_ref,
        input.origin,
        JSON.stringify(input.origin_details),
        input.payment_id || null,
        input.merchant_id,
        input.customer_id || null,
        input.amount,
        input.currency,
        input.country || null,
        'reported',
        input.reason_code,
        input.reason_description || null,
        input.network || null,
        input.network_deadline || null,
      ]
    );

    const dispute = rows[0];

    // Create initial event
    await client.query(
      `INSERT INTO dispute_events (dispute_id, actor, actor_type, action, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [dispute.id, input.actorId || 'system', input.origin, 'ingested', JSON.stringify(input.origin_details)]
    );

    // Create action to request evidence
    await client.query(
      `INSERT INTO dispute_actions (dispute_id, action_type, payload, priority)
       VALUES ($1, $2, $3, $4)`,
      [dispute.id, 'request_evidence', JSON.stringify({ reason: 'new_dispute' }), 1]
    );

    // Audit log
    await client.query(
      `INSERT INTO molam_audit_logs (entity_type, entity_id, action, actor_id, changes, merchant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['dispute', dispute.id, 'created', input.actorId || 'system', JSON.stringify(input), input.merchant_id]
    );

    await client.query('COMMIT');

    disputeCreatedCounter.inc({ merchant_id: input.merchant_id, origin: input.origin, network: input.network || 'unknown' });

    // Async: get SIRA score
    siraService.scoreDispute(dispute.id, input.payment_id, input.merchant_id).catch((err) => {
      console.error(`[DisputesService] SIRA scoring failed for dispute ${dispute.id}:`, err);
    });

    return dispute;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get dispute by ID
 */
export async function getDispute(disputeId: string, merchantId?: string): Promise<Dispute | null> {
  let query = 'SELECT * FROM disputes WHERE id = $1';
  const params: any[] = [disputeId];

  if (merchantId) {
    params.push(merchantId);
    query += ' AND merchant_id = $2';
  }

  const { rows } = await pool.query<Dispute>(query, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * List disputes with filters
 */
export async function listDisputes(filters: {
  merchantId?: string;
  status?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}): Promise<Dispute[]> {
  let query = 'SELECT * FROM disputes WHERE 1=1';
  const params: any[] = [];

  if (filters.merchantId) {
    params.push(filters.merchantId);
    query += ` AND merchant_id = $${params.length}`;
  }

  if (filters.status) {
    params.push(filters.status);
    query += ` AND status = $${params.length}`;
  }

  if (filters.from) {
    params.push(filters.from);
    query += ` AND created_at >= $${params.length}`;
  }

  if (filters.to) {
    params.push(filters.to);
    query += ` AND created_at <= $${params.length}`;
  }

  query += ' ORDER BY created_at DESC';

  if (filters.limit) {
    params.push(filters.limit);
    query += ` LIMIT $${params.length}`;
  } else {
    query += ' LIMIT 500';
  }

  const { rows } = await pool.query<Dispute>(query, params);
  return rows;
}

/**
 * Update dispute status
 */
export async function updateDisputeStatus(
  disputeId: string,
  status: string,
  actorId: string,
  payload?: any
): Promise<Dispute> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<Dispute>(
      `UPDATE disputes SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, disputeId]
    );

    if (rows.length === 0) {
      throw new Error('Dispute not found');
    }

    const dispute = rows[0];

    // Create event
    await client.query(
      `INSERT INTO dispute_events (dispute_id, actor, actor_type, action, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [disputeId, actorId, 'ops', 'status_changed', JSON.stringify({ from: dispute.status, to: status, ...payload })]
    );

    // Audit log
    await client.query(
      `INSERT INTO molam_audit_logs (entity_type, entity_id, action, actor_id, changes, merchant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['dispute', disputeId, 'status_updated', actorId, JSON.stringify({ status }), dispute.merchant_id]
    );

    await client.query('COMMIT');

    return dispute;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Resolve dispute (won/lost/settled)
 */
export async function resolveDispute(
  disputeId: string,
  outcome: 'won' | 'lost' | 'settled',
  actorId: string,
  payload: {
    note?: string;
    network_code?: string;
    network_response?: any;
  }
): Promise<Dispute> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<Dispute>(
      `UPDATE disputes
       SET status = $1, outcome = $1, resolved_at = NOW(), network_response = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [outcome, JSON.stringify(payload.network_response || {}), disputeId]
    );

    if (rows.length === 0) {
      throw new Error('Dispute not found');
    }

    const dispute = rows[0];

    // Create resolution event
    await client.query(
      `INSERT INTO dispute_events (dispute_id, actor, actor_type, action, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [disputeId, actorId, 'ops', 'resolved', JSON.stringify({ outcome, ...payload })]
    );

    // Audit log
    await client.query(
      `INSERT INTO molam_audit_logs (entity_type, entity_id, action, actor_id, changes, merchant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['dispute', disputeId, 'resolved', actorId, JSON.stringify({ outcome, ...payload }), dispute.merchant_id]
    );

    await client.query('COMMIT');

    // Record resolution time metric
    const createdAt = new Date(dispute.created_at).getTime();
    const resolvedAt = new Date().getTime();
    const durationSeconds = (resolvedAt - createdAt) / 1000;
    disputeResolutionHistogram.observe({ outcome, merchant_id: dispute.merchant_id }, durationSeconds);

    return dispute;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get dispute timeline (events)
 */
export async function getDisputeTimeline(disputeId: string): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT * FROM dispute_events WHERE dispute_id = $1 ORDER BY created_at ASC`,
    [disputeId]
  );
  return rows;
}

/**
 * Get dispute statistics for merchant
 */
export async function getDisputeStats(merchantId: string, from: Date, to: Date): Promise<any> {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) as total_disputes,
       COUNT(*) FILTER (WHERE status = 'reported') as reported,
       COUNT(*) FILTER (WHERE status IN ('evidence_requested', 'submitted')) as pending,
       COUNT(*) FILTER (WHERE outcome = 'won') as won,
       COUNT(*) FILTER (WHERE outcome = 'lost') as lost,
       COUNT(*) FILTER (WHERE outcome = 'settled') as settled,
       COALESCE(SUM(amount) FILTER (WHERE outcome = 'lost'), 0) as total_lost_amount,
       COALESCE(SUM(fees_charged), 0) as total_fees,
       COALESCE(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/86400) FILTER (WHERE resolved_at IS NOT NULL), 0) as avg_resolution_days
     FROM disputes
     WHERE merchant_id = $1 AND created_at BETWEEN $2 AND $3`,
    [merchantId, from, to]
  );

  return rows[0];
}
