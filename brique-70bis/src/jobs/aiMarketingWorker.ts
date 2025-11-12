/**
 * AI Marketing Worker - Autonomous marketing optimization
 *
 * Runs periodically to:
 * - Generate marketing recommendations for all merchants
 * - Analyze A/B tests and auto-stop winners
 * - Detect anomalies in promo usage
 * - Auto-tune campaigns based on performance
 * - Refresh market benchmarks
 *
 * Schedule: Runs every 6 hours via CRON
 */

import { pool } from '../db';
import { generateRecommendations } from '../services/aiEngine';
import { analyzeABTest, getABTests } from '../services/abTesting';
import {
  detectPromoAnomalies,
  fetchMarketBenchmarks,
  autoTuneCampaign,
} from '../services/siraIntegration';

interface WorkerStats {
  merchantsProcessed: number;
  recommendationsGenerated: number;
  abTestsAnalyzed: number;
  anomaliesDetected: number;
  campaignsTuned: number;
  benchmarksRefreshed: number;
  errors: number;
}

/**
 * Main worker function
 */
export async function runAIMarketingWorker(): Promise<WorkerStats> {
  console.log('[AI Marketing Worker] Starting...');

  const stats: WorkerStats = {
    merchantsProcessed: 0,
    recommendationsGenerated: 0,
    abTestsAnalyzed: 0,
    anomaliesDetected: 0,
    campaignsTuned: 0,
    benchmarksRefreshed: 0,
    errors: 0,
  };

  try {
    // Get all active merchants
    const { rows: merchants } = await pool.query(`
      SELECT DISTINCT m.id, m.industry, m.country
      FROM merchants m
      WHERE m.status = 'active'
        AND EXISTS (
          SELECT 1 FROM orders o
          WHERE o.merchant_id = m.id
            AND o.created_at > now() - interval '30 days'
        )
    `);

    console.log(`[AI Marketing Worker] Processing ${merchants.length} active merchants`);

    // Process each merchant
    for (const merchant of merchants) {
      try {
        await processMerchant(merchant, stats);
        stats.merchantsProcessed++;
      } catch (error) {
        console.error(`[AI Marketing Worker] Error processing merchant ${merchant.id}:`, error);
        stats.errors++;
      }
    }

    // Analyze all running A/B tests
    await analyzeAllABTests(stats);

    console.log('[AI Marketing Worker] Completed:', stats);
  } catch (error) {
    console.error('[AI Marketing Worker] Fatal error:', error);
    stats.errors++;
  }

  // Log worker execution
  await logWorkerExecution(stats);

  return stats;
}

/**
 * Process a single merchant
 */
async function processMerchant(
  merchant: { id: string; industry: string; country: string },
  stats: WorkerStats
): Promise<void> {
  const merchantId = merchant.id;

  // 1. Generate AI recommendations (once per day)
  const shouldGenerateRecs = await shouldGenerateRecommendations(merchantId);
  if (shouldGenerateRecs) {
    try {
      const recs = await generateRecommendations(merchantId);
      stats.recommendationsGenerated += recs.length;
      console.log(`[AI Marketing Worker] Generated ${recs.length} recommendations for merchant ${merchantId}`);
    } catch (error) {
      console.error(`[AI Marketing Worker] Error generating recommendations for ${merchantId}:`, error);
    }
  }

  // 2. Detect anomalies in promo codes
  try {
    const anomalies = await detectMerchantAnomalies(merchantId);
    stats.anomaliesDetected += anomalies;
  } catch (error) {
    console.error(`[AI Marketing Worker] Error detecting anomalies for ${merchantId}:`, error);
  }

  // 3. Auto-tune campaigns
  try {
    const tuned = await autoTuneMerchantCampaigns(merchantId);
    stats.campaignsTuned += tuned;
  } catch (error) {
    console.error(`[AI Marketing Worker] Error auto-tuning campaigns for ${merchantId}:`, error);
  }

  // 4. Refresh market benchmarks (once per week)
  const shouldRefreshBenchmarks = await shouldRefreshBenchmarks(merchantId);
  if (shouldRefreshBenchmarks) {
    try {
      const benchmark = await fetchMarketBenchmarks(
        merchantId,
        merchant.industry || 'e-commerce',
        merchant.country || 'US'
      );
      if (benchmark) {
        stats.benchmarksRefreshed++;
        console.log(`[AI Marketing Worker] Refreshed benchmarks for merchant ${merchantId}`);
      }
    } catch (error) {
      console.error(`[AI Marketing Worker] Error refreshing benchmarks for ${merchantId}:`, error);
    }
  }

  // 5. Expire old recommendations
  await expireOldRecommendations(merchantId);
}

/**
 * Check if we should generate recommendations for this merchant
 */
async function shouldGenerateRecommendations(merchantId: string): Promise<boolean> {
  const { rows } = await pool.query(`
    SELECT MAX(generated_at) as last_generated
    FROM marketing_ai_recommendations
    WHERE merchant_id = $1
  `, [merchantId]);

  const lastGenerated = rows[0]?.last_generated;
  if (!lastGenerated) return true;

  const hoursSinceLastGeneration = (Date.now() - new Date(lastGenerated).getTime()) / (1000 * 60 * 60);
  return hoursSinceLastGeneration >= 24; // Generate once per day
}

/**
 * Detect anomalies for a merchant's promo codes
 */
async function detectMerchantAnomalies(merchantId: string): Promise<number> {
  let anomalyCount = 0;

  // Get active promo codes
  const { rows: promoCodes } = await pool.query(`
    SELECT id
    FROM promo_codes
    WHERE merchant_id = $1
      AND status = 'active'
      AND valid_until > now()
  `, [merchantId]);

  // Check each promo code for anomalies
  for (const promo of promoCodes) {
    try {
      const anomaly = await detectPromoAnomalies(merchantId, promo.id);
      if (anomaly && anomaly.anomalyDetected) {
        anomalyCount++;
        console.log(`[AI Marketing Worker] Anomaly detected for promo ${promo.id}: ${anomaly.anomalyType}`);
      }
    } catch (error) {
      // Continue with other promo codes
    }
  }

  return anomalyCount;
}

/**
 * Auto-tune campaigns for a merchant
 */
async function autoTuneMerchantCampaigns(merchantId: string): Promise<number> {
  let tunedCount = 0;

  // Get active campaigns
  const { rows: campaigns } = await pool.query(`
    SELECT id
    FROM marketing_campaigns
    WHERE merchant_id = $1
      AND status = 'active'
      AND created_at > now() - interval '90 days'
  `, [merchantId]);

  // Check each campaign for tuning opportunities
  for (const campaign of campaigns) {
    try {
      const tuning = await autoTuneCampaign(merchantId, campaign.id);
      if (tuning && tuning.shouldTune) {
        tunedCount++;
        console.log(`[AI Marketing Worker] Auto-tuned campaign ${campaign.id}: ${tuning.adjustmentType}`);

        // Apply the tuning (simplified - in production would update actual campaign)
        // For now, just log it
      }
    } catch (error) {
      // Continue with other campaigns
    }
  }

  return tunedCount;
}

/**
 * Check if we should refresh benchmarks for this merchant
 */
async function shouldRefreshBenchmarks(merchantId: string): Promise<boolean> {
  const { rows } = await pool.query(`
    SELECT MAX(fetched_at) as last_fetched
    FROM marketing_benchmarks
    WHERE merchant_id = $1
  `, [merchantId]);

  const lastFetched = rows[0]?.last_fetched;
  if (!lastFetched) return true;

  const daysSinceLastFetch = (Date.now() - new Date(lastFetched).getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceLastFetch >= 7; // Refresh once per week
}

/**
 * Expire old recommendations
 */
async function expireOldRecommendations(merchantId: string): Promise<void> {
  await pool.query(`
    UPDATE marketing_ai_recommendations
    SET status = 'expired'
    WHERE merchant_id = $1
      AND status = 'suggested'
      AND generated_at < now() - interval '14 days'
  `, [merchantId]);
}

/**
 * Analyze all running A/B tests
 */
async function analyzeAllABTests(stats: WorkerStats): Promise<void> {
  const { rows: tests } = await pool.query(`
    SELECT id, merchant_id
    FROM marketing_ab_tests
    WHERE status = 'running'
      AND start_date <= now()
  `);

  console.log(`[AI Marketing Worker] Analyzing ${tests.length} running A/B tests`);

  for (const test of tests) {
    try {
      const result = await analyzeABTest(test.id);

      // If test has clear winner and is statistically significant, it might auto-stop
      if (result.statisticalSignificance && result.winner !== 'no_clear_winner') {
        console.log(`[AI Marketing Worker] A/B test ${test.id} has winner: ${result.winner} with ${result.uplift}% uplift`);
      }

      stats.abTestsAnalyzed++;
    } catch (error) {
      console.error(`[AI Marketing Worker] Error analyzing A/B test ${test.id}:`, error);
      stats.errors++;
    }
  }
}

/**
 * Log worker execution for monitoring
 */
async function logWorkerExecution(stats: WorkerStats): Promise<void> {
  try {
    await pool.query(`
      INSERT INTO worker_executions (
        worker_name,
        execution_time,
        stats,
        status
      ) VALUES (
        'ai_marketing_worker',
        now(),
        $1,
        CASE WHEN $2 > 0 THEN 'completed_with_errors' ELSE 'completed' END
      )
    `, [JSON.stringify(stats), stats.errors]);
  } catch (error) {
    // If worker_executions table doesn't exist, just log to console
    console.log('[AI Marketing Worker] Execution stats:', stats);
  }
}

/**
 * Entry point when run as standalone script
 */
if (require.main === module) {
  (async () => {
    try {
      await runAIMarketingWorker();
      process.exit(0);
    } catch (error) {
      console.error('[AI Marketing Worker] Fatal error:', error);
      process.exit(1);
    }
  })();
}
