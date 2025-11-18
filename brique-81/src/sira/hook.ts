// =====================================================================
// SIRA Integration for Overage Billing
// =====================================================================
// Analyze overage trends and provide plan upgrade recommendations
// Hooks into SIRA's recommendation engine
// Date: 2025-11-12
// =====================================================================

import { Pool } from 'pg';

// =====================================================================
// Types
// =====================================================================

export interface TrendAnalysisResult {
  tenant_id: string;
  metric: string;
  trend_direction: 'up' | 'down' | 'stable';
  growth_rate_percent: number;
  avg_monthly_amount: number;
  currency: string;
  recommendation: string;
  confidence_score: number;
  analyzed_at: Date;
}

export interface AggregatedOverageData {
  tenant_id: string;
  metric: string;
  monthly_totals: { month: string; amount: number; units: number }[];
  currency: string;
}

export interface SIRARecommendation {
  tenant_id: string;
  current_plan_id: string;
  recommended_plan_id: string;
  reason: string;
  estimated_savings: number;
  currency: string;
  confidence: number;
}

// =====================================================================
// SIRA Trend Analyzer
// =====================================================================

export class SIRATrendAnalyzer {
  constructor(private pool: Pool) {}

  /**
   * Analyze overage trends for a specific tenant
   * Called by SIRA's cron job or on-demand by Ops
   */
  async analyzeTenantTrends(tenantId: string): Promise<TrendAnalysisResult[]> {
    // Get aggregated overage data for the last 6 months
    const aggregatedData = await this.getAggregatedData(tenantId);

    const results: TrendAnalysisResult[] = [];

    for (const data of aggregatedData) {
      const analysis = this.performTrendAnalysis(data);
      if (analysis) {
        results.push(analysis);

        // Store in database for historical tracking
        await this.storeTrendAnalysis(analysis);
      }
    }

    return results;
  }

  /**
   * Analyze all tenants (batch job)
   */
  async analyzeAllTenants(): Promise<Map<string, TrendAnalysisResult[]>> {
    const tenants = await this.getTenantsWithOverages();
    const results = new Map<string, TrendAnalysisResult[]>();

    for (const tenantId of tenants) {
      try {
        const analysis = await this.analyzeTenantTrends(tenantId);
        if (analysis.length > 0) {
          results.set(tenantId, analysis);
        }
      } catch (error) {
        console.error(`Failed to analyze tenant ${tenantId}:`, error);
      }
    }

    return results;
  }

  /**
   * Get aggregated overage data for trend analysis
   */
  private async getAggregatedData(tenantId: string): Promise<AggregatedOverageData[]> {
    const result = await this.pool.query(
      `
      SELECT
        tenant_id::text,
        metric,
        currency,
        json_agg(
          json_build_object(
            'month', month,
            'amount', total_amount,
            'units', total_units
          ) ORDER BY month DESC
        ) as monthly_totals
      FROM (
        SELECT
          tenant_id,
          metric,
          currency,
          DATE_TRUNC('month', overage_timestamp)::text as month,
          SUM(amount) as total_amount,
          SUM(units) as total_units
        FROM billing_overages
        WHERE tenant_id = $1
          AND overage_timestamp >= NOW() - INTERVAL '6 months'
          AND billing_status != 'voided'
        GROUP BY tenant_id, metric, currency, DATE_TRUNC('month', overage_timestamp)
      ) monthly
      GROUP BY tenant_id, metric, currency
      HAVING COUNT(*) >= 3
      `,
      [tenantId]
    );

    return result.rows;
  }

  /**
   * Perform trend analysis using linear regression
   */
  private performTrendAnalysis(data: AggregatedOverageData): TrendAnalysisResult | null {
    const { tenant_id, metric, monthly_totals, currency } = data;

    if (monthly_totals.length < 3) {
      return null; // Need at least 3 months of data
    }

    // Calculate average monthly amount
    const amounts = monthly_totals.map((m) => m.amount);
    const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;

    // Calculate growth rate (simple linear regression)
    const n = amounts.length;
    const xValues = Array.from({ length: n }, (_, i) => i);
    const yValues = amounts.reverse(); // Oldest to newest

    const { slope, confidence } = this.linearRegression(xValues, yValues);

    // Calculate growth rate as percentage
    const growthRate = avgAmount > 0 ? (slope / avgAmount) * 100 : 0;

    // Determine trend direction
    let trendDirection: 'up' | 'down' | 'stable';
    if (Math.abs(growthRate) < 5) {
      trendDirection = 'stable';
    } else if (growthRate > 0) {
      trendDirection = 'up';
    } else {
      trendDirection = 'down';
    }

    // Generate recommendation
    const recommendation = this.generateRecommendation(
      metric,
      trendDirection,
      growthRate,
      avgAmount
    );

    return {
      tenant_id,
      metric,
      trend_direction: trendDirection,
      growth_rate_percent: Math.round(growthRate * 100) / 100,
      avg_monthly_amount: Math.round(avgAmount * 100) / 100,
      currency,
      recommendation,
      confidence_score: confidence,
      analyzed_at: new Date(),
    };
  }

  /**
   * Simple linear regression
   * Returns slope and confidence (R²)
   */
  private linearRegression(
    xValues: number[],
    yValues: number[]
  ): { slope: number; intercept: number; confidence: number } {
    const n = xValues.length;
    const sumX = xValues.reduce((sum, x) => sum + x, 0);
    const sumY = yValues.reduce((sum, y) => sum + y, 0);
    const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
    const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0);
    const sumY2 = yValues.reduce((sum, y) => sum + y * y, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R² (coefficient of determination)
    const yMean = sumY / n;
    const ssTotal = yValues.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
    const ssResidual = yValues.reduce(
      (sum, y, i) => sum + Math.pow(y - (slope * xValues[i] + intercept), 2),
      0
    );
    const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

    return {
      slope,
      intercept,
      confidence: Math.max(0, Math.min(1, rSquared)),
    };
  }

  /**
   * Generate recommendation based on trend analysis
   */
  private generateRecommendation(
    metric: string,
    direction: 'up' | 'down' | 'stable',
    growthRate: number,
    avgAmount: number
  ): string {
    const metricName = this.formatMetric(metric);

    if (direction === 'up' && growthRate > 10) {
      if (avgAmount > 100) {
        return `⚠️ High and rising ${metricName} overages (${Math.abs(Math.round(growthRate))}% growth). Consider upgrading to a higher plan to reduce costs.`;
      } else {
        return `📈 ${metricName} overages are trending up (${Math.abs(Math.round(growthRate))}% growth). Monitor usage and consider upgrading if this continues.`;
      }
    } else if (direction === 'up' && growthRate > 5) {
      return `📊 ${metricName} overages are increasing slightly (${Math.abs(Math.round(growthRate))}% growth). Usage is growing steadily.`;
    } else if (direction === 'down' && growthRate < -10) {
      return `📉 ${metricName} overages are decreasing (${Math.abs(Math.round(growthRate))}% decline). Current plan may be suitable or you could consider downgrading.`;
    } else if (direction === 'stable') {
      return `✅ ${metricName} overages are stable. Current usage pattern is consistent.`;
    } else {
      return `ℹ️ ${metricName} overages show minor fluctuations. Continue monitoring.`;
    }
  }

  /**
   * Store trend analysis in database
   */
  private async storeTrendAnalysis(analysis: TrendAnalysisResult): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO overage_trends (
        tenant_id,
        metric,
        trend_direction,
        growth_rate_percent,
        avg_monthly_amount,
        currency,
        recommendation,
        confidence_score,
        analyzed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        analysis.tenant_id,
        analysis.metric,
        analysis.trend_direction,
        analysis.growth_rate_percent,
        analysis.avg_monthly_amount,
        analysis.currency,
        analysis.recommendation,
        analysis.confidence_score,
        analysis.analyzed_at,
      ]
    );
  }

  /**
   * Get tenants with overages in the last 3 months
   */
  private async getTenantsWithOverages(): Promise<string[]> {
    const result = await this.pool.query(
      `
      SELECT DISTINCT tenant_id::text
      FROM billing_overages
      WHERE overage_timestamp >= NOW() - INTERVAL '3 months'
        AND billing_status != 'voided'
      `
    );

    return result.rows.map((row) => row.tenant_id);
  }

  /**
   * Generate SIRA recommendation for plan upgrade
   */
  async generatePlanRecommendation(tenantId: string): Promise<SIRARecommendation | null> {
    // Get current plan
    const tenantResult = await this.pool.query(
      `SELECT plan_id FROM tenants WHERE id = $1`,
      [tenantId]
    );

    if (tenantResult.rows.length === 0) {
      return null;
    }

    const currentPlanId = tenantResult.rows[0].plan_id;

    // Get total overages for the last 3 months
    const overageResult = await this.pool.query(
      `
      SELECT
        SUM(amount) as total_overage_amount,
        currency
      FROM billing_overages
      WHERE tenant_id = $1
        AND overage_timestamp >= NOW() - INTERVAL '3 months'
        AND billing_status != 'voided'
      GROUP BY currency
      ORDER BY SUM(amount) DESC
      LIMIT 1
      `,
      [tenantId]
    );

    if (overageResult.rows.length === 0) {
      return null; // No overages
    }

    const { total_overage_amount, currency } = overageResult.rows[0];

    // Get plan pricing
    const planPricing = this.getPlanPricing(currentPlanId);
    const nextPlanId = this.getNextPlanTier(currentPlanId);
    const nextPlanPricing = this.getPlanPricing(nextPlanId);

    // Calculate potential savings
    // If overage costs > (next plan cost - current plan cost), recommend upgrade
    const monthlyOverageCost = total_overage_amount / 3; // Average per month
    const upgradeCost = nextPlanPricing - planPricing;

    if (monthlyOverageCost > upgradeCost * 1.2) {
      // 20% margin
      const estimatedSavings = monthlyOverageCost - upgradeCost;

      return {
        tenant_id: tenantId,
        current_plan_id: currentPlanId,
        recommended_plan_id: nextPlanId,
        reason: `Upgrading to ${nextPlanId} would save approximately ${this.formatCurrency(estimatedSavings, currency)}/month compared to current overage costs.`,
        estimated_savings: Math.round(estimatedSavings * 100) / 100,
        currency,
        confidence: 0.85, // High confidence
      };
    }

    return null; // No recommendation
  }

  /**
   * Get plan pricing (simplified - should integrate with Brique 80)
   */
  private getPlanPricing(planId: string): number {
    const pricing: Record<string, number> = {
      free: 0,
      starter: 49,
      business: 249,
      enterprise: 999,
    };

    return pricing[planId] || 0;
  }

  /**
   * Get next plan tier
   */
  private getNextPlanTier(currentPlanId: string): string {
    const tiers: Record<string, string> = {
      free: 'starter',
      starter: 'business',
      business: 'enterprise',
      enterprise: 'enterprise', // Already at top
    };

    return tiers[currentPlanId] || 'starter';
  }

  /**
   * Format metric for display
   */
  private formatMetric(metric: string): string {
    return metric
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Format currency
   */
  private formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }
}

// =====================================================================
// Cron Job Entry Point
// =====================================================================

/**
 * Run trend analysis for all tenants (scheduled job)
 * Should be run daily or weekly
 */
export async function runTrendAnalysisCronJob(pool: Pool): Promise<void> {
  console.log('Starting overage trend analysis cron job...');

  const analyzer = new SIRATrendAnalyzer(pool);

  try {
    const results = await analyzer.analyzeAllTenants();

    console.log(`Analyzed ${results.size} tenants`);

    // Log summary
    for (const [tenantId, trends] of results) {
      console.log(`Tenant ${tenantId}:`);
      for (const trend of trends) {
        console.log(
          `  - ${trend.metric}: ${trend.trend_direction} (${trend.growth_rate_percent}%)`
        );
      }
    }

    console.log('Trend analysis completed successfully');
  } catch (error) {
    console.error('Trend analysis cron job failed:', error);
    throw error;
  }
}

/**
 * Generate plan recommendations for all tenants
 */
export async function generatePlanRecommendations(pool: Pool): Promise<SIRARecommendation[]> {
  console.log('Generating plan recommendations...');

  const analyzer = new SIRATrendAnalyzer(pool);

  // Get all tenants with significant overages
  const tenants = await pool.query(
    `
    SELECT DISTINCT tenant_id::text
    FROM billing_overages
    WHERE overage_timestamp >= NOW() - INTERVAL '3 months'
      AND billing_status != 'voided'
      AND amount > 0
    `
  );

  const recommendations: SIRARecommendation[] = [];

  for (const { tenant_id } of tenants.rows) {
    try {
      const recommendation = await analyzer.generatePlanRecommendation(tenant_id);
      if (recommendation) {
        recommendations.push(recommendation);
      }
    } catch (error) {
      console.error(`Failed to generate recommendation for tenant ${tenant_id}:`, error);
    }
  }

  console.log(`Generated ${recommendations.length} plan recommendations`);
  return recommendations;
}

// =====================================================================
// CLI Entry Point (for testing)
// =====================================================================

if (require.main === module) {
  const { Pool } = require('pg');

  const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE || 'molam_connect',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
  });

  const command = process.argv[2] || 'trends';

  if (command === 'trends') {
    runTrendAnalysisCronJob(pool)
      .then(() => {
        console.log('Done');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Failed:', error);
        process.exit(1);
      });
  } else if (command === 'recommendations') {
    generatePlanRecommendations(pool)
      .then((recommendations) => {
        console.log(JSON.stringify(recommendations, null, 2));
        process.exit(0);
      })
      .catch((error) => {
        console.error('Failed:', error);
        process.exit(1);
      });
  } else {
    console.error('Usage: node hook.js [trends|recommendations]');
    process.exit(1);
  }
}
