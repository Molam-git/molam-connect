/**
 * BRIQUE 141 — Ops Plan Runner
 * Exécution orchestrée des plans opérationnels
 */

import { pool } from '../db';
import { publishEvent } from '../events/publisher';

// Stubs pour intégrations
const executePayoutBatch = async (payload: any) => ({ payouts_created: 0 });
const executeSweep = async (payload: any) => ({ amount_swept: 0 });
const pauseBank = async (bankId: string) => ({ bank_id: bankId, paused: true });

/**
 * Process plan run
 */
export async function processPlanRun(
  runId: string,
  opts: { rollback?: boolean } = {}
): Promise<void> {
  try {
    // Fetch run
    const { rows: runRows } = await pool.query(
      `SELECT * FROM ops_plan_runs WHERE id = $1`,
      [runId]
    );

    if (runRows.length === 0) {
      throw new Error('run_not_found');
    }

    const run = runRows[0];

    // Fetch plan
    const { rows: planRows } = await pool.query(
      `SELECT * FROM ops_plans WHERE id = $1`,
      [run.plan_id]
    );

    if (planRows.length === 0) {
      throw new Error('plan_not_found');
    }

    const plan = planRows[0];

    // Update to running
    await pool.query(
      `UPDATE ops_plan_runs SET status = 'running' WHERE id = $1`,
      [runId]
    );

    // Execute plan based on type
    let result: any = {};

    switch (plan.plan_type) {
      case 'payout_batch':
        result = await executePayoutBatch(plan.payload);
        break;
      case 'sweep':
        result = await executeSweep(plan.payload);
        break;
      case 'failover':
      case 'pause_bank':
        result = await pauseBank(plan.payload.bank_profile_id || plan.payload.target);
        break;
      case 'freeze':
        result = { frozen: true, target: plan.payload.target };
        break;
      default:
        result = { note: 'custom_execute_not_implemented' };
    }

    // Success
    await pool.query(
      `UPDATE ops_plan_runs
       SET status = 'success', result = $2, completed_at = NOW()
       WHERE id = $1`,
      [runId, JSON.stringify(result)]
    );

    await pool.query(
      `UPDATE ops_plans
       SET status = 'completed', updated_at = NOW()
       WHERE id = $1`,
      [plan.id]
    );

    await pool.query(
      `INSERT INTO ops_journal(plan_id, actor, role, action, details)
       VALUES ($1, 'system', 'system', 'complete', $2)`,
      [plan.id, result]
    );

    publishEvent('ops', plan.id, 'ops.plan.completed', {
      plan_id: plan.id,
      run_id: runId,
      result,
    });

    console.log(`[OpsRunner] Plan ${plan.id} completed successfully`);
  } catch (err: any) {
    console.error(`[OpsRunner] Error processing run ${runId}:`, err);

    const { rows: runRows } = await pool.query(
      `SELECT plan_id FROM ops_plan_runs WHERE id = $1`,
      [runId]
    );

    const planId = runRows[0]?.plan_id;

    await pool.query(
      `UPDATE ops_plan_runs
       SET status = 'failed', result = $2, completed_at = NOW()
       WHERE id = $1`,
      [runId, JSON.stringify({ error: err.message })]
    );

    if (planId) {
      await pool.query(
        `UPDATE ops_plans
         SET status = 'failed', updated_at = NOW()
         WHERE id = $1`,
        [planId]
      );

      await pool.query(
        `INSERT INTO ops_journal(plan_id, actor, role, action, details)
         VALUES ($1, 'system', 'system', 'fail', $2)`,
        [planId, { error: err.message }]
      );

      publishEvent('ops', planId, 'ops.plan.failed', {
        plan_id: planId,
        run_id: runId,
        error: err.message,
      });
    }
  }
}
