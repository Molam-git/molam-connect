/**
 * BRIQUE 142-SIRA — Playbook Executor Worker
 * Async worker that picks up pending playbook executions and runs them
 */

import { pool } from '../src/db';
import { executeAction } from '../src/services/playbook_runner';
import { publishEvent } from '../src/webhooks/publisher';

const POLL_INTERVAL_MS = 2000; // 2 seconds
const BATCH_SIZE = 20;

/**
 * Main worker tick - pick up pending executions and process them
 */
async function tick() {
  try {
    // Pick up pending executions using FOR UPDATE SKIP LOCKED
    const { rows } = await pool.query(
      `UPDATE playbook_executions
       SET status = 'running', updated_at = now()
       WHERE id IN (
         SELECT id FROM playbook_executions
         WHERE status = 'pending'
         ORDER BY initiated_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       RETURNING *`,
      [BATCH_SIZE]
    );

    if (rows.length === 0) {
      return; // No pending executions
    }

    console.log(`[PlaybookExecutor] Processing ${rows.length} executions`);

    // Process each execution
    for (const exec of rows) {
      await processExecution(exec);
    }
  } catch (error) {
    console.error('[PlaybookExecutor] Tick error:', error);
  }
}

/**
 * Process a single playbook execution
 */
async function processExecution(exec: any) {
  try {
    // Get actions from params or fetch from playbook
    let actions = exec.params?.actions;

    if (!actions && exec.playbook_id) {
      const { rows } = await pool.query(
        `SELECT actions FROM playbooks WHERE id = $1`,
        [exec.playbook_id]
      );
      if (rows.length > 0) {
        actions = rows[0].actions;
      }
    }

    if (!actions || !Array.isArray(actions)) {
      throw new Error('no_actions_found');
    }

    // Execute actions sequentially
    const results: any[] = [];
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      console.log(`[PlaybookExecutor] Executing action ${i + 1}/${actions.length}: ${action.action}`);

      const result = await executeAction(exec.playbook_id, action, exec.id);
      results.push({
        action: action.action,
        index: i,
        result,
        timestamp: new Date().toISOString(),
      });
    }

    // Mark execution as succeeded
    await pool.query(
      `UPDATE playbook_executions
       SET status = 'succeeded', result = $2, updated_at = now()
       WHERE id = $1`,
      [exec.id, JSON.stringify(results)]
    );

    await pool.query(
      `INSERT INTO molam_audit_logs(actor, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [exec.initiated_by, 'playbook.execution.succeeded', 'playbook_execution', exec.id, {
        playbook_id: exec.playbook_id,
        action_count: results.length,
      }]
    );

    await publishEvent('internal', 'ops', 'playbook.execution.succeeded', {
      execution_id: exec.id,
      playbook_id: exec.playbook_id,
    });

    console.log(`[PlaybookExecutor] Execution ${exec.id} succeeded`);
  } catch (error: any) {
    console.error(`[PlaybookExecutor] Execution ${exec.id} failed:`, error);

    // Mark execution as failed
    await pool.query(
      `UPDATE playbook_executions
       SET status = 'failed', result = $2, updated_at = now()
       WHERE id = $1`,
      [exec.id, JSON.stringify({ error: error.message, stack: error.stack })]
    );

    await pool.query(
      `INSERT INTO molam_audit_logs(actor, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [exec.initiated_by, 'playbook.execution.failed', 'playbook_execution', exec.id, {
        error: error.message,
      }]
    );

    await publishEvent('internal', 'ops', 'playbook.execution.failed', {
      execution_id: exec.id,
      error: error.message,
    });
  }
}

/**
 * Main worker loop
 */
async function main() {
  console.log('[PlaybookExecutor] Worker starting...');

  while (true) {
    try {
      await tick();
    } catch (error) {
      console.error('[PlaybookExecutor] Main loop error:', error);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

// Start worker
main().catch((error) => {
  console.error('[PlaybookExecutor] Fatal error:', error);
  process.exit(1);
});
