/**
 * BRIQUE 139 — Internationalisation & Accessibilité
 * CRON Workers
 */

import cron from 'node-cron';
import { translationSyncWorker } from './translationSyncWorker';
import { accessibilityCheckerWorker } from './accessibilityCheckerWorker';
import { currencyUpdaterWorker } from './currencyUpdaterWorker';

const jobs: cron.ScheduledTask[] = [];

/**
 * Start all CRON workers
 */
export async function startWorkers(): Promise<void> {
  console.log('[Workers] Starting all CRON jobs...');

  // Translation sync worker - runs every night at 2 AM
  const translationSyncJob = cron.schedule('0 2 * * *', async () => {
    console.log('[Workers] Running translation sync...');
    try {
      await translationSyncWorker();
    } catch (error) {
      console.error('[Workers] Translation sync error:', error);
    }
  });
  jobs.push(translationSyncJob);
  console.log('[Workers] Translation sync worker scheduled (daily at 2 AM)');

  // Accessibility checker worker - runs every 6 hours
  const accessibilityJob = cron.schedule('0 */6 * * *', async () => {
    console.log('[Workers] Running accessibility checker...');
    try {
      await accessibilityCheckerWorker();
    } catch (error) {
      console.error('[Workers] Accessibility checker error:', error);
    }
  });
  jobs.push(accessibilityJob);
  console.log('[Workers] Accessibility checker scheduled (every 6 hours)');

  // Currency updater worker - runs daily at 1 AM
  const currencyJob = cron.schedule('0 1 * * *', async () => {
    console.log('[Workers] Running currency updater...');
    try {
      await currencyUpdaterWorker();
    } catch (error) {
      console.error('[Workers] Currency updater error:', error);
    }
  });
  jobs.push(currencyJob);
  console.log('[Workers] Currency updater scheduled (daily at 1 AM)');

  console.log(`[Workers] ${jobs.length} CRON jobs started successfully`);
}

/**
 * Stop all CRON workers
 */
export async function stopWorkers(): Promise<void> {
  console.log('[Workers] Stopping all CRON jobs...');
  jobs.forEach((job) => job.stop());
  jobs.length = 0;
  console.log('[Workers] All CRON jobs stopped');
}

/**
 * Run a specific worker manually (useful for testing)
 */
export async function runWorker(workerName: string): Promise<void> {
  console.log(`[Workers] Running worker manually: ${workerName}`);

  switch (workerName) {
    case 'translation-sync':
      await translationSyncWorker();
      break;
    case 'accessibility-checker':
      await accessibilityCheckerWorker();
      break;
    case 'currency-updater':
      await currencyUpdaterWorker();
      break;
    default:
      throw new Error(`Unknown worker: ${workerName}`);
  }

  console.log(`[Workers] Worker completed: ${workerName}`);
}
