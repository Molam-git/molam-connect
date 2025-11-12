import { pool } from '../utils/db';
import * as analyticsService from '../services/analyticsService';

/**
 * Analytics Generator Worker
 * Runs periodically to calculate subscription analytics for all merchants
 */

const INTERVAL_MS = parseInt(process.env.ANALYTICS_INTERVAL_MS || '3600000', 10); // Default: 1 hour

async function generateAnalyticsForAllMerchants(): Promise<void> {
  console.log('[Analytics Worker] Starting analytics generation...');

  try {
    // Get all unique merchant IDs from subscriptions
    const { rows } = await pool.query<{ merchant_id: string }>(
      `SELECT DISTINCT merchant_id FROM subscriptions WHERE status IN ('active', 'trialing', 'past_due')`
    );

    console.log(`[Analytics Worker] Found ${rows.length} merchants to process`);

    for (const { merchant_id } of rows) {
      try {
        await analyticsService.calculateAnalytics(merchant_id);
        console.log(`[Analytics Worker] ✓ Processed merchant ${merchant_id}`);
      } catch (error: any) {
        console.error(`[Analytics Worker] ✗ Error processing merchant ${merchant_id}:`, error.message);
      }
    }

    console.log('[Analytics Worker] Completed analytics generation');
  } catch (error: any) {
    console.error('[Analytics Worker] Fatal error:', error);
  }
}

async function run(): Promise<void> {
  console.log(`[Analytics Worker] Starting with interval: ${INTERVAL_MS}ms`);

  // Run immediately on startup
  await generateAnalyticsForAllMerchants();

  // Then run periodically
  setInterval(async () => {
    await generateAnalyticsForAllMerchants();
  }, INTERVAL_MS);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('[Analytics Worker] Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[Analytics Worker] Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

// Start the worker
run().catch((error) => {
  console.error('[Analytics Worker] Failed to start:', error);
  process.exit(1);
});
