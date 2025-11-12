import { pool } from '../utils/db';
import * as analyticsService from '../services/analyticsService';

const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Analytics Worker - Aggregates merchant profiles and sector benchmarks
 * Runs every hour to update analytics data
 */
async function runAnalytics(): Promise<void> {
  console.log('[AnalyticsWorker] Starting analytics aggregation...');

  try {
    // 1. Rebuild merchant profiles for all active merchants
    const { rows: merchants } = await pool.query(
      `SELECT DISTINCT merchant_id
       FROM disputes
       WHERE created_at > NOW() - INTERVAL '90 days'`
    );

    console.log(`[AnalyticsWorker] Found ${merchants.length} merchants with recent disputes`);

    for (const { merchant_id } of merchants) {
      try {
        await analyticsService.buildMerchantProfile(merchant_id);
        console.log(`[AnalyticsWorker] Rebuilt profile for merchant ${merchant_id}`);
      } catch (error: any) {
        console.error(`[AnalyticsWorker] Failed to build profile for ${merchant_id}:`, error.message);
      }
    }

    // 2. Rebuild sector benchmarks for all active sectors
    const { rows: sectors } = await pool.query(
      `SELECT DISTINCT sector, country, currency
       FROM merchant_dispute_profiles
       WHERE updated_at > NOW() - INTERVAL '7 days'`
    );

    console.log(`[AnalyticsWorker] Found ${sectors.length} sector/country/currency combinations`);

    for (const { sector, country, currency } of sectors) {
      try {
        await analyticsService.buildSectorBenchmarks(sector, country, currency);
        console.log(`[AnalyticsWorker] Rebuilt benchmarks for ${sector}/${country}/${currency}`);
      } catch (error: any) {
        console.error(`[AnalyticsWorker] Failed to build benchmark for ${sector}/${country}:`, error.message);
      }
    }

    // 3. Generate recommendations for merchants below benchmark
    const { rows: underperformers } = await pool.query(
      `SELECT merchant_id, win_rate, benchmark_win_rate, avg_resolution_days, benchmark_resolution_days
       FROM merchant_dispute_profiles
       WHERE win_rate < benchmark_win_rate - 5
       OR avg_resolution_days > benchmark_resolution_days + 10`
    );

    console.log(`[AnalyticsWorker] Found ${underperformers.length} underperforming merchants`);

    for (const merchant of underperformers) {
      try {
        await generateRecommendations(merchant);
      } catch (error: any) {
        console.error(`[AnalyticsWorker] Failed to generate recommendations for ${merchant.merchant_id}:`, error.message);
      }
    }

    console.log('[AnalyticsWorker] Analytics aggregation completed successfully');
  } catch (error: any) {
    console.error('[AnalyticsWorker] Analytics aggregation failed:', error);
  }
}

/**
 * Generate AI recommendations for merchant
 */
async function generateRecommendations(merchant: any): Promise<void> {
  const recommendations: Array<{
    type: string;
    priority: number;
    reason: string;
  }> = [];

  // Win rate recommendation
  if (merchant.win_rate < merchant.benchmark_win_rate - 10) {
    recommendations.push({
      type: 'improve_evidence_quality',
      priority: 3,
      reason: `Your win rate (${merchant.win_rate.toFixed(1)}%) is significantly below sector average (${merchant.benchmark_win_rate.toFixed(1)}%). Focus on submitting comprehensive evidence packages.`,
    });
  } else if (merchant.win_rate < merchant.benchmark_win_rate - 5) {
    recommendations.push({
      type: 'improve_evidence_quality',
      priority: 2,
      reason: `Your win rate (${merchant.win_rate.toFixed(1)}%) is below sector average (${merchant.benchmark_win_rate.toFixed(1)}%). Consider improving evidence quality.`,
    });
  }

  // Resolution time recommendation
  if (merchant.avg_resolution_days > merchant.benchmark_resolution_days + 15) {
    recommendations.push({
      type: 'reduce_response_time',
      priority: 3,
      reason: `Your disputes take ${merchant.avg_resolution_days.toFixed(0)} days to resolve vs sector average of ${merchant.benchmark_resolution_days.toFixed(0)} days. Submit evidence earlier to improve outcomes.`,
    });
  } else if (merchant.avg_resolution_days > merchant.benchmark_resolution_days + 10) {
    recommendations.push({
      type: 'reduce_response_time',
      priority: 2,
      reason: `Your resolution time is ${(merchant.avg_resolution_days - merchant.benchmark_resolution_days).toFixed(0)} days above sector average.`,
    });
  }

  // Insert recommendations (upsert to avoid duplicates)
  for (const rec of recommendations) {
    await pool.query(
      `INSERT INTO sira_recommendations (merchant_id, recommendation_type, priority, reason, model_version)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (merchant_id, recommendation_type)
       DO UPDATE SET priority = EXCLUDED.priority, reason = EXCLUDED.reason, updated_at = NOW()`,
      [merchant.merchant_id, rec.type, rec.priority, rec.reason, 'analytics-v1']
    );
  }

  console.log(`[AnalyticsWorker] Generated ${recommendations.length} recommendations for merchant ${merchant.merchant_id}`);
}

/**
 * Main worker loop
 */
async function start(): Promise<void> {
  console.log('[AnalyticsWorker] Starting analytics worker...');

  // Run immediately on startup
  await runAnalytics();

  // Then run every hour
  setInterval(async () => {
    await runAnalytics();
  }, POLL_INTERVAL_MS);
}

// Start worker
start().catch((error) => {
  console.error('[AnalyticsWorker] Fatal error:', error);
  process.exit(1);
});
