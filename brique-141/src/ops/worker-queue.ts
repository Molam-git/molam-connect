/**
 * BRIQUE 141 — Ops Worker Queue
 * Enqueue plan runs pour exécution asynchrone
 */

import { pool } from '../db';

/**
 * Enqueue plan run pour exécution par worker
 */
export async function enqueuePlanRun(
  runId: string,
  options: { rollback?: boolean } = {}
): Promise<void> {
  try {
    // Dans une vraie implémentation, utiliser Redis Queue, Bull, ou Kafka
    // Ici, notification PostgreSQL simple
    await pool.query(`NOTIFY ops_plan_queue, $1`, [
      JSON.stringify({ run_id: runId, ...options }),
    ]);

    console.log(`[OpsQueue] Enqueued plan run: ${runId}`);
  } catch (error) {
    console.error('[OpsQueue] Error enqueueing run:', error);
    throw error;
  }
}

/**
 * Dequeue next plan run
 */
export async function dequeuePlanRun(): Promise<string | null> {
  try {
    const { rows } = await pool.query(
      `UPDATE ops_plan_runs
       SET status = 'running', run_at = NOW()
       WHERE id = (
         SELECT id
         FROM ops_plan_runs
         WHERE status = 'queued'
         ORDER BY run_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id`
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0].id;
  } catch (error) {
    console.error('[OpsQueue] Error dequeueing run:', error);
    return null;
  }
}
