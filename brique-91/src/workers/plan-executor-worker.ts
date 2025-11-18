// Plan Executor Worker
// Executes approved treasury plans

import { pool } from '../utils/db';
import { PlanExecutor } from '../services/plan-executor';

const POLL_INTERVAL_MS = parseInt(process.env.PLAN_EXEC_POLL_MS || '30000'); // Default: 30 seconds

/**
 * Plan Executor Worker
 */
export class PlanExecutorWorker {
  private executor: PlanExecutor;
  private isRunning: boolean = false;

  constructor() {
    this.executor = new PlanExecutor();
  }

  /**
   * Start the worker
   */
  async start() {
    this.isRunning = true;
    console.log('[PlanExecutorWorker] Starting...');

    while (this.isRunning) {
      try {
        await this.processNextPlan();
      } catch (error) {
        console.error('[PlanExecutorWorker] Error processing plan:', error);
      }

      // Wait before next poll
      await this.sleep(POLL_INTERVAL_MS);
    }

    console.log('[PlanExecutorWorker] Stopped');
  }

  /**
   * Stop the worker
   */
  stop() {
    this.isRunning = false;
    console.log('[PlanExecutorWorker] Stopping...');
  }

  /**
   * Process next approved plan
   */
  private async processNextPlan(): Promise<void> {
    const client = await pool.connect();

    try {
      // Fetch next approved plan
      const { rows } = await client.query(
        `SELECT id, plan_reference, total_estimated_cost
         FROM treasury_plans
         WHERE status = 'approved'
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`
      );

      if (rows.length === 0) {
        // No approved plans
        return;
      }

      const plan = rows[0];
      console.log(`[PlanExecutorWorker] Executing plan ${plan.plan_reference}`);

      // Execute plan
      const result = await this.executor.executePlan(plan.id);

      if (result.success) {
        console.log(`[PlanExecutorWorker] ✓ Plan ${plan.plan_reference} executed successfully`);
      } else {
        console.log(`[PlanExecutorWorker] ⚠ Plan ${plan.plan_reference} partially completed: ${result.executed_actions} succeeded, ${result.failed_actions} failed`);
        console.log(`[PlanExecutorWorker] Errors: ${result.errors.join(', ')}`);
      }

    } finally {
      client.release();
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Main entry point
 */
if (require.main === module) {
  const worker = new PlanExecutorWorker();

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, stopping worker...');
    worker.stop();
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, stopping worker...');
    worker.stop();
  });

  // Start worker
  worker.start().catch(error => {
    console.error('Fatal error in worker:', error);
    process.exit(1);
  });
}

export default PlanExecutorWorker;
