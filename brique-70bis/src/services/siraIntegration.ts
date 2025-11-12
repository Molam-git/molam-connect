/**
 * SIRA Advanced Integration
 *
 * Enhanced SIRA capabilities for AI Smart Marketing:
 * - Anomaly detection (fraud patterns, unusual usage)
 * - Market benchmarking (competitive intelligence)
 * - Auto-tuning (automatic campaign optimization)
 */

import { pool } from '../db';

// SIRA API configuration
const SIRA_API_URL = process.env.SIRA_API_URL || 'https://api.sira.molam.io';
const SIRA_API_KEY = process.env.SIRA_API_KEY || '';

export interface SiraAnomalyDetection {
  anomalyDetected: boolean;
  anomalyType: 'suspicious_usage' | 'sudden_spike' | 'fraud_pattern' | 'low_performance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: {
    expectedRange: [number, number];
    actualValue: number;
    deviation: number;
    contributingFactors: string[];
  };
  suggestedAction: string;
}

export interface SiraBenchmark {
  industry: string;
  country: string;
  benchmarks: {
    avgDiscountRate: number;
    mostCommonPromoType: string;
    churnBenchmarks: { low: number; avg: number; high: number };
    ltvBenchmarks: { low: number; avg: number; high: number };
  };
  competitorOffers: Array<{
    competitor: string;
    offer: string;
    engagement: 'low' | 'medium' | 'high';
  }>;
  merchantComparison: {
    discountRate: { merchant: number; market: number; position: string };
    churn: { merchant: number; market: number; position: string };
    ltv: { merchant: number; market: number; position: string };
  };
  recommendations: Array<{
    action: string;
    reason: string;
    priority: 'low' | 'medium' | 'high';
  }>;
}

export interface AutoTuneRecommendation {
  shouldTune: boolean;
  adjustmentType: 'extend_duration' | 'increase_discount' | 'decrease_discount' | 'pause' | 'resume' | 'target_adjustment';
  newConfig: Record<string, any>;
  reason: string;
  expectedImpact: {
    conversionChange: number;
    revenueChange: number;
  };
}

/**
 * Detect anomalies in promo code usage via SIRA
 */
export async function detectPromoAnomalies(
  merchantId: string,
  promoCodeId: string
): Promise<SiraAnomalyDetection | null> {
  try {
    // Fetch usage stats
    const { rows: usageStats } = await pool.query(`
      SELECT
        COUNT(*) as total_uses,
        COUNT(DISTINCT customer_id) as unique_customers,
        AVG(discount_applied) as avg_discount,
        MAX(used_at) as last_used
      FROM promo_code_usage
      WHERE promo_code_id = $1
        AND used_at > now() - interval '24 hours'
    `, [promoCodeId]);

    const stats = usageStats[0];
    const totalUses = Number(stats.total_uses) || 0;
    const uniqueCustomers = Number(stats.unique_customers) || 0;

    // Check for suspicious patterns
    const usesPerCustomer = uniqueCustomers > 0 ? totalUses / uniqueCustomers : 0;

    // Anomaly 1: Same customer using code too many times
    if (usesPerCustomer > 5) {
      const anomaly = await logAnomaly(merchantId, {
        anomalyType: 'suspicious_usage',
        severity: 'high',
        entityType: 'promo_code',
        entityId: promoCodeId,
        description: `Code promo utilisé ${usesPerCustomer.toFixed(1)} fois en moyenne par client`,
        details: {
          expectedRange: [1, 3],
          actualValue: usesPerCustomer,
          deviation: (usesPerCustomer - 2) / 2,
          contributingFactors: [
            'Utilisation répétée par les mêmes clients',
            'Possible partage non autorisé du code',
          ],
        },
        suggestedAction: 'Limiter le nombre d\'utilisations par client ou désactiver temporairement le code',
      });
      return anomaly;
    }

    // Anomaly 2: Sudden spike in usage
    const { rows: historicalUses } = await pool.query(`
      SELECT COUNT(*) as avg_daily_uses
      FROM promo_code_usage
      WHERE promo_code_id = $1
        AND used_at BETWEEN now() - interval '7 days' AND now() - interval '1 day'
    `, [promoCodeId]);

    const avgDailyUses = Number(historicalUses[0]?.avg_daily_uses) / 6 || 1;

    if (totalUses > avgDailyUses * 5) {
      const anomaly = await logAnomaly(merchantId, {
        anomalyType: 'sudden_spike',
        severity: 'medium',
        entityType: 'promo_code',
        entityId: promoCodeId,
        description: `Pic d'utilisation inhabituel: ${totalUses} utilisations vs ${avgDailyUses.toFixed(0)} normalement`,
        details: {
          expectedRange: [avgDailyUses * 0.5, avgDailyUses * 2],
          actualValue: totalUses,
          deviation: (totalUses - avgDailyUses) / avgDailyUses,
          contributingFactors: [
            'Possible viral spread',
            'Partage sur réseaux sociaux',
          ],
        },
        suggestedAction: 'Monitorer la situation, considérer limiter les utilisations',
      });
      return anomaly;
    }

    // Call SIRA API for advanced fraud detection
    const siraResponse = await callSiraAPI('/fraud/detect', {
      merchantId,
      entityType: 'promo_code',
      entityId: promoCodeId,
      usageStats: stats,
    });

    if (siraResponse.fraudDetected) {
      const anomaly = await logAnomaly(merchantId, {
        anomalyType: 'fraud_pattern',
        severity: siraResponse.severity,
        entityType: 'promo_code',
        entityId: promoCodeId,
        description: siraResponse.description,
        details: siraResponse.details,
        suggestedAction: siraResponse.suggestedAction,
      });
      return anomaly;
    }

    return null;
  } catch (error) {
    console.error('Error detecting anomalies:', error);
    return null; // Fail-open
  }
}

/**
 * Fetch market benchmarks from SIRA profiling
 */
export async function fetchMarketBenchmarks(
  merchantId: string,
  industry: string,
  country: string
): Promise<SiraBenchmark | null> {
  try {
    // Check cache first
    const { rows: cached } = await pool.query(`
      SELECT *
      FROM marketing_benchmarks
      WHERE merchant_id = $1
        AND industry = $2
        AND country = $3
        AND expires_at > now()
      ORDER BY fetched_at DESC
      LIMIT 1
    `, [merchantId, industry, country]);

    if (cached.length > 0) {
      return {
        industry: cached[0].industry,
        country: cached[0].country,
        benchmarks: cached[0].benchmark_data.benchmarks,
        competitorOffers: cached[0].benchmark_data.competitor_offers,
        merchantComparison: cached[0].merchant_comparison,
        recommendations: cached[0].recommendations,
      };
    }

    // Fetch fresh data from SIRA
    const siraData = await callSiraAPI('/benchmarks/market', {
      industry,
      country,
    });

    // Fetch merchant's own metrics for comparison
    const { rows: merchantMetrics } = await pool.query(`
      SELECT
        AVG(discount_value) FILTER (WHERE discount_type = 'percentage') as avg_discount,
        COUNT(DISTINCT customer_id) as total_customers
      FROM promo_codes pc
      LEFT JOIN promo_code_usage pcu ON pc.id = pcu.promo_code_id
      WHERE pc.merchant_id = $1
        AND pc.created_at > now() - interval '90 days'
    `, [merchantId]);

    const merchantAvgDiscount = Number(merchantMetrics[0]?.avg_discount) || 0;

    // Compare merchant to market
    const merchantComparison = {
      discountRate: {
        merchant: merchantAvgDiscount,
        market: siraData.benchmarks.avgDiscountRate,
        position: merchantAvgDiscount < siraData.benchmarks.avgDiscountRate * 0.8
          ? 'below_market'
          : merchantAvgDiscount > siraData.benchmarks.avgDiscountRate * 1.2
          ? 'above_market'
          : 'market_aligned',
      },
      churn: {
        merchant: 0, // Would need to calculate
        market: siraData.benchmarks.churnBenchmarks.avg,
        position: 'unknown',
      },
      ltv: {
        merchant: 0, // Would need to calculate
        market: siraData.benchmarks.ltvBenchmarks.avg,
        position: 'unknown',
      },
    };

    // Generate recommendations based on comparison
    const recommendations: Array<{ action: string; reason: string; priority: 'low' | 'medium' | 'high' }> = [];

    if (merchantComparison.discountRate.position === 'below_market') {
      recommendations.push({
        action: 'increase_discount',
        reason: `Vos réductions (${merchantAvgDiscount.toFixed(0)}%) sont inférieures au marché (${siraData.benchmarks.avgDiscountRate.toFixed(0)}%). Risque de perte de compétitivité.`,
        priority: 'high',
      });
    }

    if (siraData.competitorOffers.filter((o: any) => o.offer.includes('free shipping')).length > 2) {
      recommendations.push({
        action: 'add_free_shipping',
        reason: '60%+ de vos concurrents offrent la livraison gratuite. Considérer ajouter cette option.',
        priority: 'medium',
      });
    }

    // Save to cache
    await pool.query(`
      INSERT INTO marketing_benchmarks (
        merchant_id,
        industry,
        country,
        benchmark_data,
        merchant_comparison,
        recommendations,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, now() + interval '7 days')
    `, [
      merchantId,
      industry,
      country,
      JSON.stringify(siraData),
      JSON.stringify(merchantComparison),
      JSON.stringify(recommendations),
    ]);

    return {
      industry,
      country,
      benchmarks: siraData.benchmarks,
      competitorOffers: siraData.competitorOffers,
      merchantComparison,
      recommendations,
    };
  } catch (error) {
    console.error('Error fetching benchmarks:', error);
    return null; // Fail-open
  }
}

/**
 * Auto-tune a campaign based on performance
 */
export async function autoTuneCampaign(
  merchantId: string,
  campaignId: string
): Promise<AutoTuneRecommendation | null> {
  try {
    // Fetch campaign performance
    const { rows: campaigns } = await pool.query(`
      SELECT *
      FROM marketing_campaigns
      WHERE id = $1
        AND merchant_id = $2
    `, [campaignId, merchantId]);

    if (campaigns.length === 0) {
      return null;
    }

    const campaign = campaigns[0];

    // Fetch usage metrics
    const { rows: metrics } = await pool.query(`
      SELECT
        COUNT(*) as total_uses,
        SUM(discount_applied) as total_discount,
        AVG(discount_applied) as avg_discount
      FROM promo_code_usage pcu
      JOIN promo_codes pc ON pcu.promo_code_id = pc.id
      WHERE pc.campaign_id = $1
        AND pcu.used_at > now() - interval '7 days'
    `, [campaignId]);

    const totalUses = Number(metrics[0]?.total_uses) || 0;
    const avgDiscount = Number(metrics[0]?.avg_discount) || 0;

    // Rule 1: Low adoption → Increase discount or extend duration
    if (totalUses < 10 && campaign.created_at < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) {
      const tuning = await logAutoTuning(merchantId, {
        entityType: 'campaign',
        entityId: campaignId,
        adjustmentType: 'increase_discount',
        previousConfig: { discount: avgDiscount },
        newConfig: { discount: avgDiscount * 1.25 },
        reason: `Adoption faible après 7 jours (${totalUses} utilisations). Augmentation de la réduction de 25%.`,
        expectedImpact: {
          conversionChange: 20,
          revenueChange: totalUses * avgDiscount * 0.2,
        },
      });

      return {
        shouldTune: true,
        adjustmentType: 'increase_discount',
        newConfig: { discount: avgDiscount * 1.25 },
        reason: tuning.reason,
        expectedImpact: tuning.expectedImpact,
      };
    }

    // Rule 2: Very high adoption → Consider decreasing discount to protect margins
    if (totalUses > 500) {
      const tuning = await logAutoTuning(merchantId, {
        entityType: 'campaign',
        entityId: campaignId,
        adjustmentType: 'decrease_discount',
        previousConfig: { discount: avgDiscount },
        newConfig: { discount: avgDiscount * 0.85 },
        reason: `Adoption très élevée (${totalUses} utilisations). Réduction possible de 15% sans impacter conversions.`,
        expectedImpact: {
          conversionChange: -5,
          revenueChange: totalUses * avgDiscount * 0.15,
        },
      });

      return {
        shouldTune: true,
        adjustmentType: 'decrease_discount',
        newConfig: { discount: avgDiscount * 0.85 },
        reason: tuning.reason,
        expectedImpact: tuning.expectedImpact,
      };
    }

    return null; // No tuning needed
  } catch (error) {
    console.error('Error auto-tuning campaign:', error);
    return null; // Fail-open
  }
}

/**
 * Helper: Call SIRA API
 */
async function callSiraAPI(endpoint: string, data: any): Promise<any> {
  // Mock implementation - would be real HTTP call in production
  console.log(`[SIRA Mock] Calling ${endpoint} with data:`, data);

  if (endpoint === '/fraud/detect') {
    return {
      fraudDetected: false,
      severity: 'low',
      description: 'No fraud detected',
      details: {},
      suggestedAction: 'Continue monitoring',
    };
  }

  if (endpoint === '/benchmarks/market') {
    return {
      benchmarks: {
        avgDiscountRate: 15.5,
        mostCommonPromoType: 'percentage',
        churnBenchmarks: { low: 5, avg: 12, high: 25 },
        ltvBenchmarks: { low: 150, avg: 450, high: 1200 },
      },
      competitorOffers: [
        { competitor: 'anonymous_1', offer: '20% off annual subscription', engagement: 'high' },
        { competitor: 'anonymous_2', offer: '15% + free shipping', engagement: 'medium' },
        { competitor: 'anonymous_3', offer: 'Buy 2 get 1 free', engagement: 'high' },
      ],
    };
  }

  return {};
}

/**
 * Helper: Log anomaly to database
 */
async function logAnomaly(
  merchantId: string,
  anomaly: {
    anomalyType: string;
    severity: string;
    entityType: string;
    entityId: string;
    description: string;
    details: any;
    suggestedAction: string;
  }
): Promise<SiraAnomalyDetection> {
  await pool.query(`
    INSERT INTO marketing_anomalies (
      merchant_id,
      anomaly_type,
      severity,
      entity_type,
      entity_id,
      description,
      details,
      suggested_action
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [
    merchantId,
    anomaly.anomalyType,
    anomaly.severity,
    anomaly.entityType,
    anomaly.entityId,
    anomaly.description,
    JSON.stringify(anomaly.details),
    anomaly.suggestedAction,
  ]);

  return {
    anomalyDetected: true,
    anomalyType: anomaly.anomalyType as any,
    severity: anomaly.severity as any,
    details: anomaly.details,
    suggestedAction: anomaly.suggestedAction,
  };
}

/**
 * Helper: Log auto-tuning action
 */
async function logAutoTuning(
  merchantId: string,
  tuning: {
    entityType: string;
    entityId: string;
    adjustmentType: string;
    previousConfig: any;
    newConfig: any;
    reason: string;
    expectedImpact: { conversionChange: number; revenueChange: number };
  }
): Promise<any> {
  const { rows } = await pool.query(`
    INSERT INTO marketing_auto_tuning (
      merchant_id,
      entity_type,
      entity_id,
      adjustment_type,
      previous_config,
      new_config,
      reason,
      impact
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [
    merchantId,
    tuning.entityType,
    tuning.entityId,
    tuning.adjustmentType,
    JSON.stringify(tuning.previousConfig),
    JSON.stringify(tuning.newConfig),
    tuning.reason,
    JSON.stringify(tuning.expectedImpact),
  ]);

  return {
    id: rows[0].id,
    reason: tuning.reason,
    expectedImpact: tuning.expectedImpact,
  };
}

/**
 * Get anomalies for a merchant
 */
export async function getAnomalies(
  merchantId: string,
  status?: string
): Promise<any[]> {
  const query = status
    ? `SELECT * FROM marketing_anomalies WHERE merchant_id = $1 AND status = $2 ORDER BY detected_at DESC LIMIT 50`
    : `SELECT * FROM marketing_anomalies WHERE merchant_id = $1 ORDER BY detected_at DESC LIMIT 50`;

  const params = status ? [merchantId, status] : [merchantId];
  const { rows } = await pool.query(query, params);

  return rows;
}

/**
 * Get auto-tuning history for a merchant
 */
export async function getAutoTuningHistory(
  merchantId: string,
  limit: number = 20
): Promise<any[]> {
  const { rows } = await pool.query(`
    SELECT *
    FROM marketing_auto_tuning
    WHERE merchant_id = $1
    ORDER BY applied_at DESC
    LIMIT $2
  `, [merchantId, limit]);

  return rows;
}
