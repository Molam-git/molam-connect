/**
 * Sous-Brique 75bis - Sira Zone Analysis Service
 *
 * AI-powered zone optimization service that:
 * - Analyzes merchant performance per zone (country/region/city)
 * - Detects fraud patterns and high-risk zones
 * - Identifies growth opportunities
 * - Generates automatic recommendations
 * - Applies approved recommendations
 *
 * @module siraZoneAnalysis
 */

import { Pool, PoolClient } from 'pg';

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface SalesZone {
  id: string;
  merchant_id: string;
  allowed_countries: string[];
  excluded_countries: string[];
  allowed_regions: string[];
  excluded_regions: string[];
  allowed_cities: string[];
  excluded_cities: string[];
  auto_recommend: boolean;
  last_sira_analysis?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface ZonePerformance {
  id: string;
  merchant_id: string;
  zone_type: 'country' | 'region' | 'city';
  zone_identifier: string;
  period_start: Date;
  period_end: Date;
  total_transactions: number;
  successful_transactions: number;
  failed_transactions: number;
  fraud_transactions: number;
  chargeback_transactions: number;
  total_volume: number;
  successful_volume: number;
  success_rate: number;
  fraud_rate: number;
  chargeback_rate: number;
  unique_customers: number;
  repeat_customers: number;
}

export interface SiraRecommendation {
  id: string;
  merchant_id: string;
  recommendation_type: 'suspend' | 'expand' | 'restrict' | 'monitor';
  zone_type: 'country' | 'region' | 'city';
  zone_identifier: string;
  reason: string;
  confidence_score: number;
  fraud_rate?: number;
  chargeback_rate?: number;
  conversion_rate?: number;
  approval_rate?: number;
  avg_transaction_amount?: number;
  transaction_volume_30d?: number;
  estimated_revenue_impact?: number;
  market_growth_rate?: number;
  status: 'pending' | 'applied' | 'ignored' | 'expired';
  priority: 'low' | 'medium' | 'high' | 'critical';
  applied_at?: Date;
  applied_by?: string;
  ignored_at?: Date;
  ignored_by?: string;
  ignore_reason?: string;
  expires_at: Date;
  full_analysis: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface ZoneRestrictionLog {
  id: string;
  merchant_id: string;
  action: 'suspend' | 'activate' | 'restrict' | 'unrestrict';
  zone_type: 'country' | 'region' | 'city';
  zone_identifier: string;
  triggered_by: 'manual' | 'sira_auto' | 'fraud_threshold' | 'admin';
  recommendation_id?: string;
  reason: string;
  metadata: Record<string, any>;
  actor_id?: string;
  actor_type?: 'merchant_user' | 'ops_admin' | 'system';
  previous_state?: Record<string, any>;
  new_state?: Record<string, any>;
  created_at: Date;
}

// Analysis results
export interface ZoneAnalysisResult {
  zone_identifier: string;
  total_transactions: number;
  fraud_rate: number;
  chargeback_rate: number;
  success_rate: number;
  avg_amount: number;
  unique_customers: number;
  recommendation?: 'suspend' | 'expand' | 'monitor' | 'none';
  confidence: number;
  impact: number;
}

// ============================================================================
// ZONE MANAGEMENT
// ============================================================================

/**
 * Get merchant sales zones configuration
 */
export async function getMerchantZones(merchantId: string): Promise<SalesZone | null> {
  const result = await pool.query<SalesZone>(
    `SELECT * FROM merchant_sales_zones WHERE merchant_id = $1`,
    [merchantId]
  );
  return result.rows[0] || null;
}

/**
 * Update merchant sales zones
 */
export async function updateMerchantZones(
  merchantId: string,
  updates: {
    allowed_countries?: string[];
    excluded_countries?: string[];
    allowed_regions?: string[];
    excluded_regions?: string[];
    allowed_cities?: string[];
    excluded_cities?: string[];
    auto_recommend?: boolean;
  },
  actorId?: string
): Promise<SalesZone> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert zones
    const result = await client.query<SalesZone>(
      `INSERT INTO merchant_sales_zones (
        merchant_id, allowed_countries, excluded_countries, allowed_regions,
        excluded_regions, allowed_cities, excluded_cities, auto_recommend
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (merchant_id) DO UPDATE SET
        allowed_countries = COALESCE($2, merchant_sales_zones.allowed_countries),
        excluded_countries = COALESCE($3, merchant_sales_zones.excluded_countries),
        allowed_regions = COALESCE($4, merchant_sales_zones.allowed_regions),
        excluded_regions = COALESCE($5, merchant_sales_zones.excluded_regions),
        allowed_cities = COALESCE($6, merchant_sales_zones.allowed_cities),
        excluded_cities = COALESCE($7, merchant_sales_zones.excluded_cities),
        auto_recommend = COALESCE($8, merchant_sales_zones.auto_recommend),
        updated_at = now()
      RETURNING *`,
      [
        merchantId,
        updates.allowed_countries,
        updates.excluded_countries,
        updates.allowed_regions,
        updates.excluded_regions,
        updates.allowed_cities,
        updates.excluded_cities,
        updates.auto_recommend,
      ]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// ZONE PERFORMANCE TRACKING
// ============================================================================

/**
 * Record zone performance for a period
 */
export async function recordZonePerformance(
  merchantId: string,
  zoneType: 'country' | 'region' | 'city',
  zoneIdentifier: string,
  metrics: {
    total_transactions: number;
    successful_transactions: number;
    failed_transactions: number;
    fraud_transactions: number;
    chargeback_transactions: number;
    total_volume: number;
    successful_volume: number;
    unique_customers: number;
    repeat_customers: number;
  },
  periodStart: Date,
  periodEnd: Date
): Promise<ZonePerformance> {
  const result = await pool.query<ZonePerformance>(
    `INSERT INTO merchant_zone_performance (
      merchant_id, zone_type, zone_identifier, period_start, period_end,
      total_transactions, successful_transactions, failed_transactions,
      fraud_transactions, chargeback_transactions, total_volume,
      successful_volume, unique_customers, repeat_customers
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (merchant_id, zone_type, zone_identifier, period_start) DO UPDATE SET
      total_transactions = $6,
      successful_transactions = $7,
      failed_transactions = $8,
      fraud_transactions = $9,
      chargeback_transactions = $10,
      total_volume = $11,
      successful_volume = $12,
      unique_customers = $13,
      repeat_customers = $14,
      period_end = $5
    RETURNING *`,
    [
      merchantId,
      zoneType,
      zoneIdentifier,
      periodStart,
      periodEnd,
      metrics.total_transactions,
      metrics.successful_transactions,
      metrics.failed_transactions,
      metrics.fraud_transactions,
      metrics.chargeback_transactions,
      metrics.total_volume,
      metrics.successful_volume,
      metrics.unique_customers,
      metrics.repeat_customers,
    ]
  );

  return result.rows[0];
}

/**
 * Get zone performance summary
 */
export async function getZonePerformance(
  merchantId: string,
  zoneIdentifier?: string,
  days: number = 30
): Promise<ZoneAnalysisResult[]> {
  const query = zoneIdentifier
    ? `SELECT * FROM get_zone_performance_summary($1, $2, $3)`
    : `SELECT
        zone_identifier,
        SUM(total_transactions)::BIGINT as total_transactions,
        AVG(fraud_rate) as fraud_rate,
        AVG(chargeback_rate) as chargeback_rate,
        AVG(success_rate) as success_rate,
        AVG(total_volume / NULLIF(total_transactions, 0)) as avg_amount,
        SUM(unique_customers)::BIGINT as unique_customers
      FROM merchant_zone_performance
      WHERE merchant_id = $1
        AND period_start >= (now() - ($2 || ' days')::INTERVAL)
      GROUP BY zone_identifier`;

  const params = zoneIdentifier ? [merchantId, zoneIdentifier, days] : [merchantId, days];

  const result = await pool.query<ZoneAnalysisResult>(query, params);
  return result.rows;
}

// ============================================================================
// SIRA RECOMMENDATIONS
// ============================================================================

/**
 * Analyze all zones for a merchant and generate recommendations
 */
export async function analyzeMerchantZones(merchantId: string): Promise<{
  analyzed: number;
  recommendations_generated: number;
  recommendations: SiraRecommendation[];
}> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if auto-recommend is enabled
    const zonesResult = await client.query<SalesZone>(
      `SELECT * FROM merchant_sales_zones WHERE merchant_id = $1`,
      [merchantId]
    );

    if (zonesResult.rows.length === 0 || !zonesResult.rows[0].auto_recommend) {
      await client.query('ROLLBACK');
      return { analyzed: 0, recommendations_generated: 0, recommendations: [] };
    }

    const zones = zonesResult.rows[0];

    // Get performance for all allowed countries
    const performanceData = await getZonePerformance(merchantId, undefined, 30);

    const recommendations: SiraRecommendation[] = [];

    // Analyze each zone
    for (const perf of performanceData) {
      // Check for high fraud - recommend suspension
      if (perf.fraud_rate > 0.10 && perf.total_transactions >= 20) {
        const recId = await generateFraudSuspensionRecommendation(
          client,
          merchantId,
          perf.zone_identifier,
          perf.fraud_rate,
          perf.total_transactions
        );

        const rec = await getRecommendation(client, recId);
        if (rec) recommendations.push(rec);
      }

      // Check for high conversion - recommend expansion
      else if (perf.success_rate > 0.85 && perf.total_transactions >= 50) {
        const growthRate = await estimateMarketGrowth(perf.zone_identifier);

        const recId = await generateExpansionRecommendation(
          client,
          merchantId,
          perf.zone_identifier,
          perf.success_rate,
          growthRate,
          perf.total_transactions
        );

        const rec = await getRecommendation(client, recId);
        if (rec) recommendations.push(rec);
      }

      // Monitor zones with moderate issues
      else if (perf.fraud_rate > 0.05 && perf.fraud_rate <= 0.10) {
        const recId = await generateMonitorRecommendation(
          client,
          merchantId,
          perf.zone_identifier,
          perf.fraud_rate,
          perf.total_transactions
        );

        const rec = await getRecommendation(client, recId);
        if (rec) recommendations.push(rec);
      }
    }

    // Update last analysis timestamp
    await client.query(
      `UPDATE merchant_sales_zones SET last_sira_analysis = now() WHERE merchant_id = $1`,
      [merchantId]
    );

    await client.query('COMMIT');

    return {
      analyzed: performanceData.length,
      recommendations_generated: recommendations.length,
      recommendations,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Generate fraud suspension recommendation
 */
async function generateFraudSuspensionRecommendation(
  client: PoolClient,
  merchantId: string,
  zoneIdentifier: string,
  fraudRate: number,
  transactionCount: number
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `SELECT generate_fraud_suspension_recommendation($1, $2, $3, $4) as id`,
    [merchantId, zoneIdentifier, fraudRate, transactionCount]
  );
  return result.rows[0].id;
}

/**
 * Generate expansion recommendation
 */
async function generateExpansionRecommendation(
  client: PoolClient,
  merchantId: string,
  zoneIdentifier: string,
  conversionRate: number,
  growthRate: number,
  transactionCount: number
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `SELECT generate_expansion_recommendation($1, $2, $3, $4, $5) as id`,
    [merchantId, zoneIdentifier, conversionRate, growthRate, transactionCount]
  );
  return result.rows[0].id;
}

/**
 * Generate monitor recommendation
 */
async function generateMonitorRecommendation(
  client: PoolClient,
  merchantId: string,
  zoneIdentifier: string,
  fraudRate: number,
  transactionCount: number
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO sira_zone_recommendations (
      merchant_id, recommendation_type, zone_type, zone_identifier,
      reason, confidence_score, fraud_rate, transaction_volume_30d, priority
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      merchantId,
      'monitor',
      'country',
      zoneIdentifier,
      `Elevated fraud rate (${(fraudRate * 100).toFixed(2)}%) - monitoring recommended`,
      0.65,
      fraudRate,
      transactionCount,
      'medium',
    ]
  );
  return result.rows[0].id;
}

/**
 * Estimate market growth rate (placeholder - integrate with real market data)
 */
async function estimateMarketGrowth(zoneIdentifier: string): Promise<number> {
  // Placeholder - in production, integrate with market intelligence APIs
  const marketGrowthData: Record<string, number> = {
    SN: 0.12, // Senegal growing at 12%
    CI: 0.15, // Côte d'Ivoire
    NG: 0.18, // Nigeria
    KE: 0.14, // Kenya
    FR: 0.05, // France
    US: 0.07, // USA
  };

  return marketGrowthData[zoneIdentifier] || 0.08;
}

/**
 * Get recommendation by ID
 */
async function getRecommendation(
  client: PoolClient,
  recommendationId: string
): Promise<SiraRecommendation | null> {
  const result = await client.query<SiraRecommendation>(
    `SELECT * FROM sira_zone_recommendations WHERE id = $1`,
    [recommendationId]
  );
  return result.rows[0] || null;
}

/**
 * Get all recommendations for a merchant
 */
export async function getMerchantRecommendations(
  merchantId: string,
  status?: 'pending' | 'applied' | 'ignored' | 'expired',
  limit: number = 20
): Promise<SiraRecommendation[]> {
  const query = status
    ? `SELECT * FROM sira_zone_recommendations
       WHERE merchant_id = $1 AND status = $2
       ORDER BY created_at DESC LIMIT $3`
    : `SELECT * FROM sira_zone_recommendations
       WHERE merchant_id = $1
       ORDER BY created_at DESC LIMIT $2`;

  const params = status ? [merchantId, status, limit] : [merchantId, limit];

  const result = await pool.query<SiraRecommendation>(query, params);
  return result.rows;
}

/**
 * Apply a recommendation
 */
export async function applyRecommendation(
  recommendationId: string,
  appliedBy: string
): Promise<{ recommendation: SiraRecommendation; changes_applied: string[] }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get recommendation
    const recResult = await client.query<SiraRecommendation>(
      `SELECT * FROM sira_zone_recommendations WHERE id = $1 AND status = 'pending'`,
      [recommendationId]
    );

    if (recResult.rows.length === 0) {
      throw new Error('Recommendation not found or already applied');
    }

    const rec = recResult.rows[0];
    const changes: string[] = [];

    // Get current zones
    const zonesResult = await client.query<SalesZone>(
      `SELECT * FROM merchant_sales_zones WHERE merchant_id = $1`,
      [rec.merchant_id]
    );

    if (zonesResult.rows.length === 0) {
      throw new Error('Merchant zones not found');
    }

    const zones = zonesResult.rows[0];

    // Apply based on recommendation type
    if (rec.recommendation_type === 'suspend') {
      // Add to excluded countries
      const newExcluded = [...(zones.excluded_countries || []), rec.zone_identifier];
      await client.query(
        `UPDATE merchant_sales_zones SET excluded_countries = $1, updated_at = now() WHERE merchant_id = $2`,
        [newExcluded, rec.merchant_id]
      );

      changes.push(`Suspended zone: ${rec.zone_identifier}`);

      // Log restriction
      await client.query(
        `INSERT INTO merchant_zone_restriction_logs
        (merchant_id, action, zone_type, zone_identifier, triggered_by, recommendation_id, reason, actor_id, actor_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          rec.merchant_id,
          'suspend',
          rec.zone_type,
          rec.zone_identifier,
          'sira_auto',
          recommendationId,
          rec.reason,
          appliedBy,
          'merchant_user',
        ]
      );
    } else if (rec.recommendation_type === 'expand') {
      // Add to allowed countries if not already
      const newAllowed = [...new Set([...(zones.allowed_countries || []), rec.zone_identifier])];
      await client.query(
        `UPDATE merchant_sales_zones SET allowed_countries = $1, updated_at = now() WHERE merchant_id = $2`,
        [newAllowed, rec.merchant_id]
      );

      changes.push(`Expanded to zone: ${rec.zone_identifier}`);

      // Log restriction
      await client.query(
        `INSERT INTO merchant_zone_restriction_logs
        (merchant_id, action, zone_type, zone_identifier, triggered_by, recommendation_id, reason, actor_id, actor_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          rec.merchant_id,
          'activate',
          rec.zone_type,
          rec.zone_identifier,
          'sira_auto',
          recommendationId,
          rec.reason,
          appliedBy,
          'merchant_user',
        ]
      );
    }

    // Mark recommendation as applied
    await client.query(
      `UPDATE sira_zone_recommendations SET status = 'applied', applied_at = now(), applied_by = $1 WHERE id = $2`,
      [appliedBy, recommendationId]
    );

    await client.query('COMMIT');

    const updatedRec = { ...rec, status: 'applied' as const, applied_at: new Date(), applied_by: appliedBy };

    return {
      recommendation: updatedRec,
      changes_applied: changes,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Ignore a recommendation
 */
export async function ignoreRecommendation(
  recommendationId: string,
  ignoredBy: string,
  reason: string
): Promise<SiraRecommendation> {
  const result = await pool.query<SiraRecommendation>(
    `UPDATE sira_zone_recommendations
     SET status = 'ignored', ignored_at = now(), ignored_by = $1, ignore_reason = $2
     WHERE id = $3 AND status = 'pending'
     RETURNING *`,
    [ignoredBy, reason, recommendationId]
  );

  if (result.rows.length === 0) {
    throw new Error('Recommendation not found or already processed');
  }

  return result.rows[0];
}

// ============================================================================
// ZONE RESTRICTION LOGS
// ============================================================================

/**
 * Get zone restriction logs
 */
export async function getZoneRestrictionLogs(
  merchantId: string,
  limit: number = 50
): Promise<ZoneRestrictionLog[]> {
  const result = await pool.query<ZoneRestrictionLog>(
    `SELECT * FROM merchant_zone_restriction_logs
     WHERE merchant_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [merchantId, limit]
  );
  return result.rows;
}

// ============================================================================
// CRON JOB / SCHEDULED ANALYSIS
// ============================================================================

/**
 * Run Sira analysis for all merchants with auto_recommend enabled
 * Should be called by cron job (e.g., daily at 2 AM)
 */
export async function runScheduledZoneAnalysis(): Promise<{
  merchants_analyzed: number;
  total_recommendations: number;
}> {
  const client = await pool.connect();
  try {
    // Get all merchants with auto_recommend enabled
    const merchantsResult = await client.query<{ merchant_id: string }>(
      `SELECT DISTINCT merchant_id FROM merchant_sales_zones WHERE auto_recommend = true`
    );

    let totalRecommendations = 0;

    for (const { merchant_id } of merchantsResult.rows) {
      try {
        const result = await analyzeMerchantZones(merchant_id);
        totalRecommendations += result.recommendations_generated;

        console.log(
          `[Sira] Analyzed merchant ${merchant_id}: ${result.analyzed} zones, ${result.recommendations_generated} recommendations`
        );
      } catch (error) {
        console.error(`[Sira] Failed to analyze merchant ${merchant_id}:`, error);
      }
    }

    return {
      merchants_analyzed: merchantsResult.rows.length,
      total_recommendations: totalRecommendations,
    };
  } finally {
    client.release();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Zone management
  getMerchantZones,
  updateMerchantZones,

  // Performance tracking
  recordZonePerformance,
  getZonePerformance,

  // Sira recommendations
  analyzeMerchantZones,
  getMerchantRecommendations,
  applyRecommendation,
  ignoreRecommendation,

  // Logs
  getZoneRestrictionLogs,

  // Scheduled jobs
  runScheduledZoneAnalysis,
};
