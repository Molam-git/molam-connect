/**
 * SOUS-BRIQUE 140quater-1 — Simulation Queue
 * Enqueue simulation runs pour traitement asynchrone
 */

import { pool } from '../db';

/**
 * Enqueue une simulation run pour exécution par worker
 */
export async function enqueueSimulationRun(runId: string): Promise<void> {
  // Dans une vraie implémentation, utiliser Redis Queue, Bull, ou Kafka
  // Ici, on simule avec une simple notification PostgreSQL

  try {
    await pool.query(`NOTIFY simulation_queue, $1`, [runId]);
    console.log(`[Queue] Enqueued simulation run: ${runId}`);
  } catch (error) {
    console.error('[Queue] Error enqueueing run:', error);
    throw error;
  }
}

/**
 * Déqueue prochaine simulation run
 * (Appelé par worker)
 */
export async function dequeueSimulationRun(): Promise<string | null> {
  try {
    // Use FOR UPDATE SKIP LOCKED pour éviter concurrence
    const { rows } = await pool.query(
      `UPDATE sdk_simulation_runs
       SET status = 'running', run_at = NOW()
       WHERE id = (
         SELECT id
         FROM sdk_simulation_runs
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
    console.error('[Queue] Error dequeueing run:', error);
    return null;
  }
}
