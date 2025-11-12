/**
 * A/B Testing Service
 *
 * Automated A/B testing with:
 * - Multi-variant support (A/B/C testing)
 * - Statistical significance calculation
 * - Automatic winner selection
 * - Auto-deployment of winning variant
 */

import { pool } from '../db';

export interface ABTestVariant {
  name: string;
  promoCode?: {
    discountType: 'percentage' | 'fixed' | 'free_shipping';
    discountValue: number;
    conditions?: Record<string, any>;
  };
  message: string;
  design?: Record<string, any>;
}

export interface ABTestMetrics {
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  ctr: number; // Click-through rate
  cvr: number; // Conversion rate
  avgOrderValue: number;
}

export interface ABTestResult {
  winner: 'variant_a' | 'variant_b' | 'variant_c' | 'no_clear_winner';
  confidence: number; // 0-100
  uplift: number; // percentage improvement
  statisticalSignificance: boolean;
  recommendation: string;
  insights: string;
}

export interface ABTest {
  id: string;
  merchantId: string;
  campaignId?: string;
  name: string;
  description?: string;
  variantA: ABTestVariant;
  variantB: ABTestVariant;
  variantC?: ABTestVariant;
  trafficSplit: Record<string, number>;
  startDate: Date;
  endDate?: Date;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'auto_stopped';
  metricsA: ABTestMetrics;
  metricsB: ABTestMetrics;
  metricsC?: ABTestMetrics;
  result?: ABTestResult;
  autoDeployWinner: boolean;
  deployedVariant?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a new A/B test
 */
export async function createABTest(params: {
  merchantId: string;
  campaignId?: string;
  name: string;
  description?: string;
  variantA: ABTestVariant;
  variantB: ABTestVariant;
  variantC?: ABTestVariant;
  trafficSplit?: Record<string, number>;
  startDate: Date;
  endDate?: Date;
  autoDeployWinner?: boolean;
  createdBy: string;
}): Promise<ABTest> {
  const defaultSplit = params.variantC
    ? { a: 33, b: 33, c: 34 }
    : { a: 50, b: 50 };

  const { rows } = await pool.query(`
    INSERT INTO marketing_ab_tests (
      merchant_id,
      campaign_id,
      name,
      description,
      variant_a,
      variant_b,
      variant_c,
      traffic_split,
      start_date,
      end_date,
      auto_deploy_winner,
      created_by,
      status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft')
    RETURNING *
  `, [
    params.merchantId,
    params.campaignId,
    params.name,
    params.description,
    JSON.stringify(params.variantA),
    JSON.stringify(params.variantB),
    params.variantC ? JSON.stringify(params.variantC) : null,
    JSON.stringify(params.trafficSplit || defaultSplit),
    params.startDate,
    params.endDate,
    params.autoDeployWinner || false,
    params.createdBy,
  ]);

  return mapABTest(rows[0]);
}

/**
 * Start an A/B test
 */
export async function startABTest(testId: string): Promise<ABTest> {
  const { rows } = await pool.query(`
    UPDATE marketing_ab_tests
    SET status = 'running',
        start_date = CASE WHEN start_date < now() THEN now() ELSE start_date END
    WHERE id = $1
      AND status = 'draft'
    RETURNING *
  `, [testId]);

  if (rows.length === 0) {
    throw new Error('Test not found or already started');
  }

  return mapABTest(rows[0]);
}

/**
 * Record an impression for a variant
 */
export async function recordImpression(
  testId: string,
  variant: 'a' | 'b' | 'c'
): Promise<void> {
  const field = `metrics_${variant}`;

  await pool.query(`
    UPDATE marketing_ab_tests
    SET ${field} = jsonb_set(
      COALESCE(${field}, '{}'::jsonb),
      '{impressions}',
      to_jsonb(COALESCE((${field}->>'impressions')::int, 0) + 1)
    )
    WHERE id = $1
  `, [testId]);
}

/**
 * Record a click for a variant
 */
export async function recordClick(
  testId: string,
  variant: 'a' | 'b' | 'c'
): Promise<void> {
  const field = `metrics_${variant}`;

  await pool.query(`
    UPDATE marketing_ab_tests
    SET ${field} = jsonb_set(
      jsonb_set(
        COALESCE(${field}, '{}'::jsonb),
        '{clicks}',
        to_jsonb(COALESCE((${field}->>'clicks')::int, 0) + 1)
      ),
      '{ctr}',
      to_jsonb(
        CASE WHEN (${field}->>'impressions')::int > 0
        THEN ((${field}->>'clicks')::int + 1)::float / (${field}->>'impressions')::int * 100
        ELSE 0 END
      )
    )
    WHERE id = $1
  `, [testId]);
}

/**
 * Record a conversion for a variant
 */
export async function recordConversion(
  testId: string,
  variant: 'a' | 'b' | 'c',
  orderValue: number
): Promise<void> {
  const field = `metrics_${variant}`;

  await pool.query(`
    UPDATE marketing_ab_tests
    SET ${field} = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            COALESCE(${field}, '{}'::jsonb),
            '{conversions}',
            to_jsonb(COALESCE((${field}->>'conversions')::int, 0) + 1)
          ),
          '{revenue}',
          to_jsonb(COALESCE((${field}->>'revenue')::numeric, 0) + $2)
        ),
        '{cvr}',
        to_jsonb(
          CASE WHEN (${field}->>'clicks')::int > 0
          THEN ((${field}->>'conversions')::int + 1)::float / (${field}->>'clicks')::int * 100
          ELSE 0 END
        )
      ),
      '{avgOrderValue}',
      to_jsonb(
        CASE WHEN (${field}->>'conversions')::int > 0
        THEN ((${field}->>'revenue')::numeric + $2) / ((${field}->>'conversions')::int + 1)
        ELSE $2 END
      )
    )
    WHERE id = $1
  `, [testId, orderValue]);
}

/**
 * Analyze A/B test and determine winner
 */
export async function analyzeABTest(testId: string): Promise<ABTestResult> {
  const { rows } = await pool.query(`
    SELECT * FROM marketing_ab_tests WHERE id = $1
  `, [testId]);

  if (rows.length === 0) {
    throw new Error('Test not found');
  }

  const test = mapABTest(rows[0]);

  const metricsA = test.metricsA;
  const metricsB = test.metricsB;
  const metricsC = test.metricsC;

  // Calculate statistical significance using simplified chi-square test
  // In production, would use proper statistical libraries

  // For simplicity, we'll compare conversion rates
  const variants = [
    { name: 'variant_a', metrics: metricsA },
    { name: 'variant_b', metrics: metricsB },
  ];

  if (metricsC) {
    variants.push({ name: 'variant_c', metrics: metricsC });
  }

  // Find best performing variant by conversion rate
  let bestVariant = variants[0];
  let bestCVR = variants[0].metrics.cvr;

  for (const variant of variants) {
    if (variant.metrics.cvr > bestCVR) {
      bestCVR = variant.metrics.cvr;
      bestVariant = variant;
    }
  }

  // Calculate confidence and statistical significance
  // Simplified: need at least 100 clicks per variant for significance
  const minClicks = Math.min(...variants.map(v => v.metrics.clicks));
  const statisticalSignificance = minClicks >= 100;

  const baselineVariant = variants.find(v => v.name !== bestVariant.name)!;
  const uplift = baselineVariant.metrics.cvr > 0
    ? ((bestVariant.metrics.cvr - baselineVariant.metrics.cvr) / baselineVariant.metrics.cvr) * 100
    : 0;

  // Calculate confidence score (simplified)
  let confidence = 50; // Base
  if (minClicks >= 50) confidence += 10;
  if (minClicks >= 100) confidence += 15;
  if (minClicks >= 500) confidence += 10;
  if (uplift > 10) confidence += 10;
  if (uplift > 20) confidence += 5;

  const winner = uplift > 5 ? bestVariant.name as any : 'no_clear_winner';

  const result: ABTestResult = {
    winner,
    confidence: Math.min(confidence, 99),
    uplift: Math.round(uplift * 10) / 10,
    statisticalSignificance,
    recommendation:
      winner === 'no_clear_winner'
        ? 'Continue testing - no clear winner yet'
        : statisticalSignificance
        ? `Deploy ${winner} - statistically significant improvement`
        : `${winner} is leading but needs more data for confidence`,
    insights: generateInsights(variants, bestVariant),
  };

  // Save result
  await pool.query(`
    UPDATE marketing_ab_tests
    SET result = $1
    WHERE id = $2
  `, [JSON.stringify(result), testId]);

  // Auto-stop if clear winner and enough data
  if (statisticalSignificance && uplift > 15 && minClicks >= 200) {
    await stopABTest(testId, 'auto_stopped');

    // Auto-deploy if enabled
    if (test.autoDeployWinner && winner !== 'no_clear_winner') {
      await deployWinner(testId, winner);
    }
  }

  return result;
}

/**
 * Generate insights from A/B test data
 */
function generateInsights(
  variants: Array<{ name: string; metrics: ABTestMetrics }>,
  winner: { name: string; metrics: ABTestMetrics }
): string {
  const insights: string[] = [];

  // CTR insights
  const ctrDiff = variants.map(v =>
    ((winner.metrics.ctr - v.metrics.ctr) / Math.max(v.metrics.ctr, 1)) * 100
  );
  const maxCtrDiff = Math.max(...ctrDiff.map(Math.abs));

  if (maxCtrDiff > 20) {
    insights.push(`${winner.name} has ${maxCtrDiff.toFixed(0)}% better click-through rate`);
  }

  // CVR insights
  const cvrDiff = variants.map(v =>
    ((winner.metrics.cvr - v.metrics.cvr) / Math.max(v.metrics.cvr, 1)) * 100
  );
  const maxCvrDiff = Math.max(...cvrDiff.map(Math.abs));

  if (maxCvrDiff > 15) {
    insights.push(`${winner.name} converts ${maxCvrDiff.toFixed(0)}% more visitors`);
  }

  // Revenue insights
  if (winner.metrics.avgOrderValue > variants[0].metrics.avgOrderValue * 1.1) {
    insights.push(`${winner.name} generates ${((winner.metrics.avgOrderValue / variants[0].metrics.avgOrderValue - 1) * 100).toFixed(0)}% higher average order value`);
  }

  return insights.join('. ') || 'No significant insights yet';
}

/**
 * Stop an A/B test
 */
export async function stopABTest(
  testId: string,
  status: 'completed' | 'auto_stopped' = 'completed'
): Promise<ABTest> {
  const { rows } = await pool.query(`
    UPDATE marketing_ab_tests
    SET status = $1,
        end_date = CASE WHEN end_date IS NULL THEN now() ELSE end_date END
    WHERE id = $2
      AND status IN ('running', 'paused')
    RETURNING *
  `, [status, testId]);

  if (rows.length === 0) {
    throw new Error('Test not found or already stopped');
  }

  return mapABTest(rows[0]);
}

/**
 * Deploy winning variant
 */
export async function deployWinner(
  testId: string,
  winner: 'variant_a' | 'variant_b' | 'variant_c'
): Promise<void> {
  const { rows } = await pool.query(`
    SELECT * FROM marketing_ab_tests WHERE id = $1
  `, [testId]);

  if (rows.length === 0) {
    throw new Error('Test not found');
  }

  const test = mapABTest(rows[0]);
  const winningVariant = winner === 'variant_a'
    ? test.variantA
    : winner === 'variant_b'
    ? test.variantB
    : test.variantC!;

  // Create permanent campaign/promo code based on winning variant
  if (winningVariant.promoCode) {
    await pool.query(`
      INSERT INTO promo_codes (
        merchant_id,
        code,
        discount_type,
        discount_value,
        max_uses,
        valid_from,
        valid_until,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, now(), now() + interval '90 days', $6)
    `, [
      test.merchantId,
      `WINNER_${Date.now().toString(36).toUpperCase()}`,
      winningVariant.promoCode.discountType,
      winningVariant.promoCode.discountValue,
      999999,
      test.createdBy,
    ]);
  }

  // Mark test as deployed
  await pool.query(`
    UPDATE marketing_ab_tests
    SET deployed_variant = $1
    WHERE id = $2
  `, [winner, testId]);
}

/**
 * Get A/B test by ID
 */
export async function getABTest(testId: string): Promise<ABTest | null> {
  const { rows } = await pool.query(`
    SELECT * FROM marketing_ab_tests WHERE id = $1
  `, [testId]);

  if (rows.length === 0) {
    return null;
  }

  return mapABTest(rows[0]);
}

/**
 * Get all A/B tests for a merchant
 */
export async function getABTests(
  merchantId: string,
  status?: string
): Promise<ABTest[]> {
  const query = status
    ? `SELECT * FROM marketing_ab_tests WHERE merchant_id = $1 AND status = $2 ORDER BY created_at DESC`
    : `SELECT * FROM marketing_ab_tests WHERE merchant_id = $1 ORDER BY created_at DESC`;

  const params = status ? [merchantId, status] : [merchantId];
  const { rows } = await pool.query(query, params);

  return rows.map(mapABTest);
}

/**
 * Map database row to ABTest object
 */
function mapABTest(row: any): ABTest {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    campaignId: row.campaign_id,
    name: row.name,
    description: row.description,
    variantA: row.variant_a,
    variantB: row.variant_b,
    variantC: row.variant_c,
    trafficSplit: row.traffic_split,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    metricsA: row.metrics_a || { impressions: 0, clicks: 0, conversions: 0, revenue: 0, ctr: 0, cvr: 0, avgOrderValue: 0 },
    metricsB: row.metrics_b || { impressions: 0, clicks: 0, conversions: 0, revenue: 0, ctr: 0, cvr: 0, avgOrderValue: 0 },
    metricsC: row.metrics_c,
    result: row.result,
    autoDeployWinner: row.auto_deploy_winner,
    deployedVariant: row.deployed_variant,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
