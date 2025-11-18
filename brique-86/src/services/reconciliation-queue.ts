// Reconciliation queue manager
// Handles manual review queue for unmatched or suspicious lines

import { pool } from '../utils/db';
import { matchLine } from './matcher';
import { recoQueueSize } from '../utils/metrics';

/**
 * Enqueue a statement line for reconciliation
 * If auto-match succeeds, no queue entry is created
 * If auto-match fails, line is queued for manual review
 */
export async function enqueueReconciliation(lineId: string, bankProfileId: string): Promise<void> {
  try {
    // Attempt automatic matching
    const matchResult = await matchLine(lineId, bankProfileId);

    if (matchResult.matched) {
      // Successfully matched, no queue entry needed
      return;
    }

    // Match failed - add to manual review queue
    const severity = matchResult.severity || 'medium';
    const reason = matchResult.reason || 'no_match';
    const candidates = matchResult.candidates || [];

    await pool.query(
      `INSERT INTO reconciliation_queue (
        bank_statement_line_id, reason, severity, candidate_entities, status, created_at
      ) VALUES ($1, $2, $3, $4, 'open', now())
      ON CONFLICT (bank_statement_line_id) DO UPDATE
      SET reason = EXCLUDED.reason,
          severity = EXCLUDED.severity,
          candidate_entities = EXCLUDED.candidate_entities,
          updated_at = now()`,
      [lineId, reason, severity, JSON.stringify(candidates)]
    );

    // Update line status
    await pool.query(
      `UPDATE bank_statement_lines
       SET reconciliation_status = 'manual_review', updated_at = now()
       WHERE id = $1`,
      [lineId]
    );

    // Update queue size metric
    updateQueueMetrics();

    console.log(`Line ${lineId} queued for manual review: ${reason} (${severity})`);
  } catch (error: any) {
    console.error('Failed to enqueue reconciliation:', error);
    throw error;
  }
}

/**
 * Get pending reconciliation queue items
 */
export async function getQueueItems(filters: {
  status?: string;
  severity?: string;
  assignedTo?: string;
  limit?: number;
  offset?: number;
}): Promise<any[]> {
  let query = `
    SELECT
      q.id,
      q.reason,
      q.severity,
      q.status,
      q.assigned_to,
      q.candidate_entities,
      q.created_at,
      l.id as line_id,
      l.value_date,
      l.amount,
      l.currency,
      l.description,
      l.reference,
      l.provider_ref,
      l.beneficiary_name,
      l.transaction_type
    FROM reconciliation_queue q
    JOIN bank_statement_lines l ON l.id = q.bank_statement_line_id
    WHERE 1=1
  `;

  const params: any[] = [];
  let paramIndex = 1;

  if (filters.status) {
    query += ` AND q.status = $${paramIndex++}`;
    params.push(filters.status);
  }

  if (filters.severity) {
    query += ` AND q.severity = $${paramIndex++}`;
    params.push(filters.severity);
  }

  if (filters.assignedTo) {
    query += ` AND q.assigned_to = $${paramIndex++}`;
    params.push(filters.assignedTo);
  }

  query += ` ORDER BY
    CASE q.severity
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
    END,
    q.created_at ASC
  `;

  if (filters.limit) {
    query += ` LIMIT $${paramIndex++}`;
    params.push(filters.limit);
  }

  if (filters.offset) {
    query += ` OFFSET $${paramIndex++}`;
    params.push(filters.offset);
  }

  const { rows } = await pool.query(query, params);
  return rows;
}

/**
 * Assign queue item to a user
 */
export async function assignQueueItem(queueId: string, userId: string): Promise<void> {
  await pool.query(
    `UPDATE reconciliation_queue
     SET assigned_to = $2, status = 'in_review', updated_at = now()
     WHERE id = $1`,
    [queueId, userId]
  );

  updateQueueMetrics();
}

/**
 * Resolve queue item with manual match
 */
export async function resolveQueueItem(
  queueId: string,
  userId: string,
  resolution: {
    matchedType: string;
    matchedEntityId: string;
    notes?: string;
  }
): Promise<void> {
  const { rows } = await pool.query(
    `SELECT bank_statement_line_id FROM reconciliation_queue WHERE id = $1`,
    [queueId]
  );

  if (rows.length === 0) {
    throw new Error('Queue item not found');
  }

  const lineId = rows[0].bank_statement_line_id;

  // Use transaction to ensure atomicity
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert reconciliation match
    await client.query(
      `INSERT INTO reconciliation_matches (
        bank_statement_line_id, matched_type, matched_entity_id, match_score, match_rule, matched_by, reconciled_at
      ) VALUES ($1, $2, $3, 1.0, 'manual', $4, now())`,
      [lineId, resolution.matchedType, resolution.matchedEntityId, userId]
    );

    // Update line status
    await client.query(
      `UPDATE bank_statement_lines
       SET reconciliation_status = 'matched', matched_at = now(), updated_at = now()
       WHERE id = $1`,
      [lineId]
    );

    // Update payout status if applicable
    if (resolution.matchedType === 'payout') {
      await client.query(
        `UPDATE payouts
         SET status = 'settled', settled_at = now(), updated_at = now()
         WHERE id = $1`,
        [resolution.matchedEntityId]
      );
    }

    // Mark queue item as resolved
    await client.query(
      `UPDATE reconciliation_queue
       SET status = 'resolved',
           resolution = 'matched',
           resolved_at = now(),
           resolved_by = $2,
           notes = $3,
           updated_at = now()
       WHERE id = $1`,
      [queueId, userId, resolution.notes || null]
    );

    // Log action
    await client.query(
      `INSERT INTO reconciliation_logs (actor, actor_type, action, details, created_at)
       VALUES ($1, 'user', 'manual_matched', $2, now())`,
      [
        userId,
        JSON.stringify({
          queue_id: queueId,
          line_id: lineId,
          matched_type: resolution.matchedType,
          matched_entity_id: resolution.matchedEntityId,
          notes: resolution.notes,
        }),
      ]
    );

    await client.query('COMMIT');

    updateQueueMetrics();
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Ignore/dismiss a queue item
 */
export async function ignoreQueueItem(queueId: string, userId: string, notes?: string): Promise<void> {
  await pool.query(
    `UPDATE reconciliation_queue
     SET status = 'ignored',
         resolution = 'ignored',
         resolved_at = now(),
         resolved_by = $2,
         notes = $3,
         updated_at = now()
     WHERE id = $1`,
    [queueId, userId, notes || null]
  );

  // Log action
  await pool.query(
    `INSERT INTO reconciliation_logs (actor, actor_type, action, details, created_at)
     VALUES ($1, 'user', 'queue_ignored', $2, now())`,
    [userId, JSON.stringify({ queue_id: queueId, notes })]
  );

  updateQueueMetrics();
}

/**
 * Create adjustment for reconciliation discrepancy
 */
export async function createAdjustment(
  lineId: string,
  payoutId: string | null,
  adjustmentData: {
    adjustmentType: string;
    originalAmount: number;
    adjustedAmount: number;
    currency: string;
    reason: string;
  }
): Promise<string> {
  const difference = adjustmentData.originalAmount - adjustmentData.adjustedAmount;

  const { rows } = await pool.query(
    `INSERT INTO reconciliation_adjustments (
      bank_statement_line_id, payout_id, adjustment_type, original_amount,
      adjusted_amount, difference_amount, currency, reason, status, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', now())
    RETURNING id`,
    [
      lineId,
      payoutId,
      adjustmentData.adjustmentType,
      adjustmentData.originalAmount,
      adjustmentData.adjustedAmount,
      difference,
      adjustmentData.currency,
      adjustmentData.reason,
    ]
  );

  return rows[0].id;
}

/**
 * Update queue metrics for monitoring
 */
async function updateQueueMetrics(): Promise<void> {
  const { rows } = await pool.query(`
    SELECT severity, COUNT(*) as count
    FROM reconciliation_queue
    WHERE status IN ('open', 'in_review')
    GROUP BY severity
  `);

  // Reset all metrics
  recoQueueSize.set({ severity: 'critical' }, 0);
  recoQueueSize.set({ severity: 'high' }, 0);
  recoQueueSize.set({ severity: 'medium' }, 0);
  recoQueueSize.set({ severity: 'low' }, 0);

  // Update metrics
  for (const row of rows) {
    recoQueueSize.set({ severity: row.severity }, parseInt(row.count));
  }
}
