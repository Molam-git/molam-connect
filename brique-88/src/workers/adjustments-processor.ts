// Adjustments Processor Worker
// Processes pending adjustments: validates, posts journal entries, enqueues compensations

import { pool } from '../utils/db';
import { mapAdjustmentToGL, validateGLBalance } from '../services/gl-mapping';
import { enqueueCompensation } from '../services/compensations';

const BATCH_SIZE = 50;
const POLL_INTERVAL_MS = 5000;

/**
 * Main worker loop
 */
export async function runAdjustmentsProcessor(): Promise<void> {
  console.log('🔄 Starting Adjustments Processor Worker');

  while (true) {
    try {
      await processPendingAdjustments();
    } catch (error: any) {
      console.error('Processor error:', error);
      await sleep(10000); // Back off on error
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Process batch of pending adjustments
 */
async function processPendingAdjustments(): Promise<void> {
  // Lock and fetch pending adjustments
  const { rows: adjustments } = await pool.query(
    `UPDATE ledger_adjustments
     SET status = 'processing', updated_at = now()
     WHERE id IN (
       SELECT id FROM ledger_adjustments
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [BATCH_SIZE]
  );

  if (adjustments.length === 0) {
    return; // No work
  }

  console.log(`Processing ${adjustments.length} adjustments`);

  for (const adj of adjustments) {
    try {
      await processAdjustment(adj);
    } catch (error: any) {
      console.error(`Failed to process adjustment ${adj.id}:`, error);
      await markAdjustmentFailed(adj.id, error.message);
    }
  }
}

/**
 * Process single adjustment
 */
async function processAdjustment(adj: any): Promise<void> {
  // 1. Check approval requirements
  const approvalNeeded = await checkApprovalRequired(adj);

  if (approvalNeeded) {
    const hasApprovals = await checkHasApprovals(adj.id, adj.approval_required);

    if (!hasApprovals) {
      console.log(`Adjustment ${adj.id} requires ${adj.approval_required} approvals`);
      await pool.query(
        `UPDATE ledger_adjustments
         SET status = 'awaiting_approval', updated_at = now()
         WHERE id = $1`,
        [adj.id]
      );

      // Notify Ops
      await notifyOpsApprovalNeeded(adj);
      return;
    }
  }

  // 2. Build and post journal entry
  const journalEntryId = await buildAndPostJournalEntry(adj);

  // 3. Enqueue compensation actions
  if (adj.actions && Array.isArray(adj.actions)) {
    for (const action of adj.actions) {
      await enqueueCompensation(adj.id, action);
    }
  }

  // 4. Mark as applied
  await pool.query(
    `UPDATE ledger_adjustments
     SET status = 'applied', applied_at = now(), updated_at = now()
     WHERE id = $1`,
    [adj.id]
  );

  console.log(`✅ Adjustment ${adj.id} applied with journal ${journalEntryId}`);
}

/**
 * Check if approval required based on amount threshold
 */
async function checkApprovalRequired(adj: any): Promise<boolean> {
  // Get threshold from config
  const { rows } = await pool.query(
    `SELECT value FROM adjustment_config WHERE key = 'ops_auto_threshold'`
  );

  if (rows.length === 0) {
    return false; // No threshold configured
  }

  const thresholds = rows[0].value;
  const threshold = thresholds[adj.currency] || 0;

  return Math.abs(adj.amount) > threshold;
}

/**
 * Check if adjustment has sufficient approvals
 */
async function checkHasApprovals(adjId: string, required: number): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT approval_count FROM ledger_adjustments WHERE id = $1`,
    [adjId]
  );

  return rows[0]?.approval_count >= required;
}

/**
 * Build and post journal entry (atomic)
 */
async function buildAndPostJournalEntry(adj: any): Promise<string> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Map to GL lines
    const glLines = mapAdjustmentToGL({
      adjustment_type: adj.adjustment_type,
      amount: adj.amount,
      currency: adj.currency,
      reason: adj.reason,
      source_type: adj.source_type,
      metadata: adj.metadata,
    });

    // Validate balance
    const validation = validateGLBalance(glLines);
    if (!validation.balanced) {
      throw new Error(
        `Unbalanced journal entry: debit=${validation.debitTotal}, credit=${validation.creditTotal}`
      );
    }

    // Create journal entry
    const entryRef = `ADJ-${adj.id}`;
    const { rows: [entry] } = await client.query(
      `INSERT INTO journal_entries (entry_ref, entry_date, status, source_adjustment_id, description)
       VALUES ($1, CURRENT_DATE, 'draft', $2, $3)
       RETURNING id`,
      [entryRef, adj.id, adj.reason]
    );

    const journalEntryId = entry.id;

    // Insert journal lines
    for (let i = 0; i < glLines.length; i++) {
      const line = glLines[i];
      await client.query(
        `INSERT INTO journal_lines (
          journal_entry_id, line_number, gl_code, debit, credit, currency, description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [journalEntryId, i + 1, line.gl_code, line.debit, line.credit, adj.currency, line.description]
      );
    }

    // Post journal entry
    await client.query(
      `UPDATE journal_entries
       SET status = 'posted', posted_at = now()
       WHERE id = $1`,
      [journalEntryId]
    );

    await client.query('COMMIT');

    return journalEntryId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Mark adjustment as failed
 */
async function markAdjustmentFailed(adjId: string, error: string): Promise<void> {
  await pool.query(
    `UPDATE ledger_adjustments
     SET status = 'failed', metadata = metadata || jsonb_build_object('error', $2), updated_at = now()
     WHERE id = $1`,
    [adjId, error]
  );
}

/**
 * Notify Ops that approval is needed
 */
async function notifyOpsApprovalNeeded(adj: any): Promise<void> {
  await pool.query(
    `INSERT INTO system_notifications (channel, severity, title, message, payload)
     VALUES ('treasury', 'warning', 'Adjustment Approval Required', $1, $2)`,
    [
      `Adjustment ${adj.id} (${adj.currency} ${adj.amount}) requires approval`,
      JSON.stringify({ adjustment_id: adj.id, amount: adj.amount, currency: adj.currency }),
    ]
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run worker if executed directly
if (require.main === module) {
  runAdjustmentsProcessor().catch(err => {
    console.error('Fatal processor error:', err);
    process.exit(1);
  });
}
