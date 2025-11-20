/**
 * BRIQUE 142 — Playbook Execution Queue
 * Async execution worker
 */

import { pool } from '../db';

/**
 * Enqueue playbook execution
 */
export async function enqueuePlaybookExecution(executionId: string): Promise<void> {
  try {
    // Dans une vraie implémentation, utiliser Redis Queue, Bull, ou Kafka
    // Ici, notification PostgreSQL simple
    await pool.query(`NOTIFY playbook_queue, $1`, [executionId]);

    console.log(`[PlaybookQueue] Enqueued execution: ${executionId}`);
  } catch (error) {
    console.error('[PlaybookQueue] Error enqueueing:', error);
    throw error;
  }
}

/**
 * Dequeue next playbook execution
 */
export async function dequeuePlaybookExecution(): Promise<string | null> {
  try {
    const { rows } = await pool.query(
      `UPDATE playbook_executions
       SET status = 'running'
       WHERE id = (
         SELECT id
         FROM playbook_executions
         WHERE status = 'pending'
         ORDER BY executed_at ASC
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
    console.error('[PlaybookQueue] Error dequeueing:', error);
    return null;
  }
}
