// Sweep Worker
// Periodically evaluates sweep rules and executes auto-sweeps

import { FloatManager } from '../services/float-manager';

const POLL_INTERVAL_MS = parseInt(process.env.SWEEP_POLL_MS || '300000'); // Default: 5 minutes
const SNAPSHOT_INTERVAL_MS = parseInt(process.env.SNAPSHOT_INTERVAL_MS || '600000'); // Default: 10 minutes

/**
 * Sweep Worker Class
 */
export class SweepWorker {
  private floatManager: FloatManager;
  private isRunning: boolean = false;
  private lastSnapshotAt: Date = new Date(0);

  constructor() {
    this.floatManager = new FloatManager();
  }

  /**
   * Start the worker
   */
  async start() {
    this.isRunning = true;
    console.log('[SweepWorker] Starting...');
    console.log(`[SweepWorker] Poll interval: ${POLL_INTERVAL_MS}ms, Snapshot interval: ${SNAPSHOT_INTERVAL_MS}ms`);

    while (this.isRunning) {
      try {
        // Take snapshots if needed
        await this.maybeeTakeSnapshots();

        // Evaluate and execute sweeps
        await this.evaluateAndExecuteSweeps();

      } catch (error) {
        console.error('[SweepWorker] Error in sweep cycle:', error);
      }

      // Wait before next poll
      await this.sleep(POLL_INTERVAL_MS);
    }

    console.log('[SweepWorker] Stopped');
  }

  /**
   * Stop the worker
   */
  stop() {
    this.isRunning = false;
    console.log('[SweepWorker] Stopping...');
  }

  /**
   * Take snapshots if interval has elapsed
   */
  private async maybeeTakeSnapshots(): Promise<void> {
    const now = Date.now();
    const timeSinceLastSnapshot = now - this.lastSnapshotAt.getTime();

    if (timeSinceLastSnapshot >= SNAPSHOT_INTERVAL_MS) {
      console.log('[SweepWorker] Taking float snapshots...');

      try {
        const snapshots = await this.floatManager.takeSnapshots();
        console.log(`[SweepWorker] ✓ Took ${snapshots.length} snapshots`);

        this.lastSnapshotAt = new Date();
      } catch (error) {
        console.error('[SweepWorker] Error taking snapshots:', error);
      }
    }
  }

  /**
   * Evaluate sweep rules and execute
   */
  private async evaluateAndExecuteSweeps(): Promise<void> {
    console.log('[SweepWorker] Evaluating sweep rules...');

    try {
      // Evaluate all sweep rules
      const recommendations = await this.floatManager.evaluateSweepRules();

      if (recommendations.length === 0) {
        console.log('[SweepWorker] No sweep recommendations');
        return;
      }

      console.log(`[SweepWorker] Generated ${recommendations.length} recommendations`);

      // Split into auto and manual
      const autoRecommendations = recommendations.filter(r => r.auto_execute);
      const manualRecommendations = recommendations.filter(r => !r.auto_execute);

      console.log(`[SweepWorker] Auto: ${autoRecommendations.length}, Manual: ${manualRecommendations.length}`);

      // Execute auto-sweeps
      if (autoRecommendations.length > 0) {
        const executedCount = await this.floatManager.executeAutoSweeps(autoRecommendations);
        console.log(`[SweepWorker] ✓ Executed ${executedCount} auto-sweeps`);
      }

      // Create draft plans for manual review
      if (manualRecommendations.length > 0) {
        const createdCount = await this.floatManager.createManualSweepRecommendations(manualRecommendations);
        console.log(`[SweepWorker] ✓ Created ${createdCount} manual sweep recommendations`);
      }

      // Print metrics
      await this.printFloatMetrics();

    } catch (error) {
      console.error('[SweepWorker] Error evaluating sweeps:', error);
    }
  }

  /**
   * Print float metrics
   */
  private async printFloatMetrics(): Promise<void> {
    try {
      const metrics = await this.floatManager.getFloatMetrics();

      console.log('[SweepWorker] Float Metrics:');
      for (const metric of metrics) {
        console.log(`  ${metric.currency}: ${metric.account_count} accounts, Total: ${metric.total_balance.toFixed(2)}, Avg: ${metric.avg_balance.toFixed(2)}`);
      }
    } catch (error) {
      console.error('[SweepWorker] Error fetching metrics:', error);
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
  const worker = new SweepWorker();

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

export default SweepWorker;
