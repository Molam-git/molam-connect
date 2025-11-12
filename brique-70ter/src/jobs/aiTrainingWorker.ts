/**
 * AI Training Worker - Autonomous Learning Engine
 *
 * Runs periodically to:
 * - Train local models for merchants
 * - Aggregate federated models
 * - Process crawler jobs
 * - Collect external data
 *
 * Schedule: Runs every 24 hours via CRON
 */

import { pool } from '../db';
import { trainLocalModel, aggregateFederatedModels } from '../services/aiTrainer';
import { getPendingCrawlerJobs, processCrawlerJob } from '../services/externalDataCollector';
import { trainPersonalizedModel, scheduleNextTraining } from '../services/personalizedModels';

interface WorkerStats {
  merchantsTrained: number;
  globalModelsCreated: number;
  crawlerJobsProcessed: number;
  errors: number;
}

/**
 * Main worker function
 */
export async function runAITrainingWorker(): Promise<WorkerStats> {
  console.log('[AI Training Worker] Starting...');

  const stats: WorkerStats = {
    merchantsTrained: 0,
    globalModelsCreated: 0,
    crawlerJobsProcessed: 0,
    errors: 0,
  };

  try {
    // 1. Get merchants due for training
    const { rows: merchants } = await pool.query(`
      SELECT merchant_id
      FROM marketing_ai_merchant_configs
      WHERE training_frequency != 'on_demand'
        AND (
          next_training_at IS NULL
          OR next_training_at <= now()
        )
      ORDER BY next_training_at ASC NULLS FIRST
      LIMIT 50
    `);

    console.log(`[AI Training Worker] Found ${merchants.length} merchants due for training`);

    // 2. Train local models for each merchant
    for (const merchant of merchants) {
      try {
        await trainPersonalizedModel(merchant.merchant_id);
        await scheduleNextTraining(merchant.merchant_id);
        stats.merchantsTrained++;
        console.log(`[AI Training Worker] Trained model for merchant ${merchant.merchant_id}`);
      } catch (error) {
        console.error(`[AI Training Worker] Error training merchant ${merchant.merchant_id}:`, error);
        stats.errors++;
      }
    }

    // 3. Aggregate federated models (if enough new training runs)
    try {
      const { rows: recentRuns } = await pool.query(`
        SELECT COUNT(DISTINCT merchant_id) as merchant_count
        FROM marketing_ai_training_runs
        WHERE created_at > now() - interval '7 days'
          AND model_type = 'local'
      `);

      const merchantCount = Number(recentRuns[0]?.merchant_count) || 0;

      if (merchantCount >= 5) {
        await aggregateFederatedModels(5);
        stats.globalModelsCreated++;
        console.log(`[AI Training Worker] Created global federated model from ${merchantCount} merchants`);
      }
    } catch (error) {
      console.error('[AI Training Worker] Error aggregating federated models:', error);
      stats.errors++;
    }

    // 4. Process pending crawler jobs
    const crawlerJobs = await getPendingCrawlerJobs(10);
    console.log(`[AI Training Worker] Processing ${crawlerJobs.length} crawler jobs`);

    for (const job of crawlerJobs) {
      try {
        const success = await processCrawlerJob(job.id);
        if (success) {
          stats.crawlerJobsProcessed++;
        } else {
          stats.errors++;
        }
      } catch (error) {
        console.error(`[AI Training Worker] Error processing crawler job ${job.id}:`, error);
        stats.errors++;
      }
    }

    console.log('[AI Training Worker] Completed:', stats);
  } catch (error) {
    console.error('[AI Training Worker] Fatal error:', error);
    stats.errors++;
  }

  return stats;
}

/**
 * Entry point when run as standalone script
 */
if (require.main === module) {
  (async () => {
    try {
      const stats = await runAITrainingWorker();
      console.log('[AI Training Worker] Final stats:', stats);
      process.exit(stats.errors > 0 ? 1 : 0);
    } catch (error) {
      console.error('[AI Training Worker] Fatal error:', error);
      process.exit(1);
    }
  })();
}
