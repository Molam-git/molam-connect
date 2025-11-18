// Main entry point for Brique 91
// Starts all workers in a single process (for development)

import * as dotenv from 'dotenv';
import { StatementIngestWorker } from './workers/statement-ingest';
import { ReconciliationWorker } from './workers/reconciliation-worker';
import { SweepWorker } from './workers/sweep-worker';
import { PlanExecutorWorker } from './workers/plan-executor-worker';
import { SLAMonitorWorker } from './workers/sla-monitor-worker';

// Load environment variables
dotenv.config();

console.log('═══════════════════════════════════════════════════════');
console.log('  Brique 91 — Treasury Operations');
console.log('  Statement Ingestion, Reconciliation & Treasury Ops');
console.log('═══════════════════════════════════════════════════════');
console.log('');

// Initialize workers
const workers = {
  ingest: new StatementIngestWorker(),
  reconciliation: new ReconciliationWorker(),
  sweep: new SweepWorker(),
  planExecutor: new PlanExecutorWorker(),
  slaMonitor: new SLAMonitorWorker()
};

// Start all workers
async function startAllWorkers() {
  console.log('[Brique-91] Starting all workers...\n');

  try {
    // Start workers in parallel
    await Promise.all([
      workers.ingest.start(),
      workers.reconciliation.start(),
      workers.sweep.start(),
      workers.planExecutor.start(),
      workers.slaMonitor.start()
    ]);
  } catch (error) {
    console.error('[Brique-91] Fatal error starting workers:', error);
    process.exit(1);
  }
}

// Graceful shutdown
function shutdown() {
  console.log('\n[Brique-91] Shutting down gracefully...');

  // Stop all workers
  workers.ingest.stop();
  workers.reconciliation.stop();
  workers.sweep.stop();
  workers.planExecutor.stop();
  workers.slaMonitor.stop();

  // Exit after 5 seconds
  setTimeout(() => {
    console.log('[Brique-91] Shutdown complete');
    process.exit(0);
  }, 5000);
}

// Handle signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[Brique-91] Uncaught exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Brique-91] Unhandled rejection at:', promise, 'reason:', reason);
  shutdown();
});

// Start
startAllWorkers();
