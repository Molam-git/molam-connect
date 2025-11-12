import { pool } from '../utils/db';

const POLL_INTERVAL = 60000; // 1 minute

/**
 * Reconciliation Worker
 * Matches network settlement messages with existing disputes
 */

async function tickOnce() {
  const { rows: pending } = await pool.query(
    `SELECT * FROM dispute_reconciliations WHERE status = 'pending' ORDER BY created_at ASC LIMIT 50`
  );

  if (pending.length === 0) return;

  console.log(`[ReconciliationWorker] Processing ${pending.length} reconciliations`);

  for (const recon of pending) {
    try {
      await matchReconciliation(recon);
    } catch (error: any) {
      console.error(`[ReconciliationWorker] Failed to match ${recon.id}:`, error.message);
    }
  }
}

async function matchReconciliation(recon: any) {
  // Try exact match on dispute_ref
  const { rows: byRef } = await pool.query('SELECT * FROM disputes WHERE dispute_ref = $1', [recon.network_ref]);

  if (byRef.length > 0) {
    await linkReconciliation(recon.id, byRef[0].id);
    return;
  }

  // Fuzzy match: amount + date + merchant
  const { rows: byFuzzy } = await pool.query(
    `SELECT * FROM disputes
     WHERE amount = $1
       AND currency = $2
       AND created_at::date = $3
     LIMIT 1`,
    [recon.amount, recon.currency, recon.settlement_date]
  );

  if (byFuzzy.length > 0) {
    await linkReconciliation(recon.id, byFuzzy[0].id);
    return;
  }

  // Mark as unmatched for manual review
  await pool.query('UPDATE dispute_reconciliations SET status = $1 WHERE id = $2', ['unmatched', recon.id]);
  console.warn(`[ReconciliationWorker] Unmatched reconciliation: ${recon.network_ref}`);
}

async function linkReconciliation(reconId: string, disputeId: string) {
  await pool.query(
    'UPDATE dispute_reconciliations SET dispute_id = $1, status = $2, matched_at = NOW() WHERE id = $3',
    [disputeId, 'matched', reconId]
  );
  console.log(`[ReconciliationWorker] Matched reconciliation ${reconId} -> dispute ${disputeId}`);
}

async function run() {
  console.log('[ReconciliationWorker] Starting...');
  setInterval(tickOnce, POLL_INTERVAL);
  await tickOnce();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
