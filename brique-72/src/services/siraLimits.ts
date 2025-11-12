/**
 * SIRA Limit Recommendation Service
 * Brique 72 - Account Capabilities & Limits
 *
 * Uses SIRA ML to intelligently recommend limit adjustments based on:
 * - User transaction history
 * - Risk profile
 * - KYC level
 * - Account age
 * - Velocity patterns
 * - Fraud indicators
 */

import axios from 'axios';
import { pool } from '../db';
import { invalidateLimitCache } from './enforcement';

// ========================================
// Types
// ========================================

export interface SiraLimitInput {
  userId: string;
  currentKycLevel: string;
  accountAge: number;           // Days since account creation
  transactionHistory: {
    totalVolume: number;        // Lifetime transaction volume
    avgMonthlyVolume: number;
    maxTransactionAmount: number;
    transactionCount: number;
    successRate: number;        // 0-1
  };
  riskProfile: {
    fraudScore: number;         // 0-1 (0=no risk, 1=high risk)
    chargebackRate: number;     // 0-1
    disputeRate: number;        // 0-1
    suspiciousActivityCount: number;
  };
  usagePatterns: {
    dailyActiveRate: number;    // 0-1
    velocityScore: number;      // 0-1 (0=stable, 1=erratic)
    peakHourActivity: boolean;
  };
  context?: {
    country?: string;
    currency?: string;
    accountType?: string;       // 'personal', 'business', 'agent'
    [key: string]: any;
  };
}

export interface SiraLimitRecommendation {
  recommendations: Array<{
    limitKey: string;
    currentLimit: number;
    recommendedLimit: number;
    change: 'increase' | 'decrease' | 'maintain';
    changePercent: number;
    confidence: number;         // 0-1
    reasoning: string[];
  }>;
  overallRiskScore: number;     // 0-1
  action: 'auto_apply' | 'suggest_to_ops' | 'require_review';
  metadata: {
    modelVersion: string;
    evaluatedAt: Date;
    factors: Record<string, number>;
  };
}

export interface LimitAdjustmentRequest {
  userId: string;
  limitKey: string;
  newValue: number;
  currency: string;
  reason: string;
  origin: string;               // 'sira', 'ops', 'kyc'
  actorId?: string;
  expiresAt?: Date;
}

// ========================================
// SIRA Integration
// ========================================

/**
 * Call SIRA ML service for limit recommendations
 */
export async function callSiraLimitRecommendation(
  input: SiraLimitInput
): Promise<SiraLimitRecommendation> {
  try {
    const siraUrl = process.env.SIRA_API_URL || 'http://localhost:5000';
    const siraKey = process.env.SIRA_API_KEY || 'dev-key';

    // In production, call real SIRA service
    // For now, implement intelligent local logic
    return await localSiraLimitEvaluation(input);

    // Real SIRA integration (commented out):
    // const response = await axios.post(
    //   `${siraUrl}/api/sira/limits/recommend`,
    //   input,
    //   {
    //     headers: { 'Authorization': `Bearer ${siraKey}` },
    //     timeout: 5000,
    //   }
    // );
    // return response.data;
  } catch (error) {
    console.error('SIRA limit recommendation error', { userId: input.userId, error });
    throw new Error('Failed to get SIRA limit recommendation');
  }
}

/**
 * Local SIRA evaluation (fallback or dev mode)
 */
async function localSiraLimitEvaluation(
  input: SiraLimitInput
): Promise<SiraLimitRecommendation> {
  const factors: Record<string, number> = {};
  let overallRiskScore = 0;

  // Factor 1: Fraud risk (30% weight)
  const fraudFactor = input.riskProfile.fraudScore;
  factors.fraudRisk = fraudFactor;
  overallRiskScore += fraudFactor * 0.3;

  // Factor 2: Account maturity (20% weight)
  const maturityFactor = Math.min(input.accountAge / 180, 1.0); // 180 days = fully mature
  factors.accountMaturity = 1 - maturityFactor; // Inverse: new accounts are riskier
  overallRiskScore += (1 - maturityFactor) * 0.2;

  // Factor 3: Transaction success rate (15% weight)
  const successFactor = 1 - input.transactionHistory.successRate;
  factors.transactionReliability = successFactor;
  overallRiskScore += successFactor * 0.15;

  // Factor 4: Velocity patterns (15% weight)
  const velocityFactor = input.usagePatterns.velocityScore;
  factors.velocityRisk = velocityFactor;
  overallRiskScore += velocityFactor * 0.15;

  // Factor 5: Chargeback/dispute rate (10% weight)
  const chargebackFactor = (input.riskProfile.chargebackRate + input.riskProfile.disputeRate) / 2;
  factors.chargebackRisk = chargebackFactor;
  overallRiskScore += chargebackFactor * 0.1;

  // Factor 6: Suspicious activity (10% weight)
  const suspiciousFactor = Math.min(input.riskProfile.suspiciousActivityCount / 10, 1.0);
  factors.suspiciousActivity = suspiciousFactor;
  overallRiskScore += suspiciousFactor * 0.1;

  // Get current limits
  const currentLimits = await getCurrentLimits(input.userId, input.context?.currency || 'USD');

  // Build recommendations
  const recommendations = [];

  // Recommendation logic for each limit type
  for (const limit of currentLimits) {
    const recommendation = calculateLimitRecommendation(
      limit,
      input,
      overallRiskScore,
      factors
    );
    recommendations.push(recommendation);
  }

  // Determine action based on risk score
  let action: 'auto_apply' | 'suggest_to_ops' | 'require_review';
  if (overallRiskScore < 0.2) {
    action = 'auto_apply'; // Low risk: auto-apply increases
  } else if (overallRiskScore < 0.6) {
    action = 'suggest_to_ops'; // Medium risk: suggest to ops
  } else {
    action = 'require_review'; // High risk: require manual review
  }

  return {
    recommendations,
    overallRiskScore,
    action,
    metadata: {
      modelVersion: 'sira-limits-v1.0',
      evaluatedAt: new Date(),
      factors,
    },
  };
}

/**
 * Calculate recommendation for a single limit
 */
function calculateLimitRecommendation(
  currentLimit: { limitKey: string; limitValue: number },
  input: SiraLimitInput,
  overallRiskScore: number,
  factors: Record<string, number>
): any {
  const { limitKey, limitValue } = currentLimit;
  let recommendedLimit = limitValue;
  let change: 'increase' | 'decrease' | 'maintain' = 'maintain';
  const reasoning: string[] = [];

  // Base adjustment based on KYC level
  const kycMultipliers: Record<string, number> = {
    P0: 0.5,  // Very restricted
    P1: 1.0,  // Baseline
    P2: 2.5,  // Verified business
    P3: 10.0, // Bank partner
  };
  const kycMultiplier = kycMultipliers[input.currentKycLevel] || 1.0;

  // Risk-based adjustment
  const riskMultiplier = 1 - (overallRiskScore * 0.5); // Max 50% reduction for high risk

  // Account age bonus (up to +50% for accounts >180 days old)
  const ageBonus = Math.min(input.accountAge / 180, 1.0) * 0.5;

  // Transaction history bonus (up to +30% for high-volume users)
  const volumeBonus =
    input.transactionHistory.totalVolume > 100000
      ? 0.3
      : input.transactionHistory.totalVolume > 50000
      ? 0.2
      : input.transactionHistory.totalVolume > 10000
      ? 0.1
      : 0;

  // Calculate final multiplier
  const finalMultiplier = kycMultiplier * riskMultiplier * (1 + ageBonus + volumeBonus);

  // Determine new limit
  recommendedLimit = Math.round(limitValue * finalMultiplier);

  // Reasoning
  reasoning.push(`KYC level ${input.currentKycLevel}: ${kycMultiplier}x base`);
  if (overallRiskScore > 0.3) {
    reasoning.push(`Risk score ${(overallRiskScore * 100).toFixed(0)}%: reduces limit by ${((1 - riskMultiplier) * 100).toFixed(0)}%`);
  }
  if (ageBonus > 0) {
    reasoning.push(`Account age ${input.accountAge} days: +${(ageBonus * 100).toFixed(0)}% bonus`);
  }
  if (volumeBonus > 0) {
    reasoning.push(`High transaction volume: +${(volumeBonus * 100).toFixed(0)}% bonus`);
  }

  // Determine change direction
  if (recommendedLimit > limitValue * 1.1) {
    change = 'increase';
  } else if (recommendedLimit < limitValue * 0.9) {
    change = 'decrease';
  } else {
    change = 'maintain';
    recommendedLimit = limitValue; // Keep current
  }

  const changePercent = ((recommendedLimit - limitValue) / limitValue) * 100;

  // Confidence based on data quality
  const confidence =
    input.transactionHistory.transactionCount > 50
      ? 0.9
      : input.transactionHistory.transactionCount > 20
      ? 0.7
      : input.transactionHistory.transactionCount > 5
      ? 0.5
      : 0.3;

  return {
    limitKey,
    currentLimit: limitValue,
    recommendedLimit,
    change,
    changePercent: Math.round(changePercent),
    confidence,
    reasoning,
  };
}

/**
 * Get current limits for user
 */
async function getCurrentLimits(
  userId: string,
  currency: string
): Promise<Array<{ limitKey: string; limitValue: number }>> {
  const result = await pool.query(
    `SELECT
       ld.limit_key,
       get_effective_limit($1, ld.limit_key, $2) AS limit_value
     FROM limit_definitions ld
     WHERE ld.limit_key IN ('max_single_tx', 'max_daily_out', 'max_monthly_volume')`,
    [userId, currency]
  );

  return result.rows.map((row) => ({
    limitKey: row.limit_key,
    limitValue: row.limit_value || 0,
  }));
}

// ========================================
// Limit Adjustment
// ========================================

/**
 * Apply limit adjustment (with audit trail)
 */
export async function applyLimitAdjustment(
  request: LimitAdjustmentRequest
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert account limit
    await client.query(
      `INSERT INTO account_limits (user_id, limit_key, currency, limit_value, origin, effective_from)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id, limit_key, currency)
       DO UPDATE SET
         limit_value = EXCLUDED.limit_value,
         origin = EXCLUDED.origin,
         effective_from = NOW(),
         updated_at = NOW()`,
      [request.userId, request.limitKey, request.currency, request.newValue, request.origin]
    );

    // Create audit log
    await client.query(
      `INSERT INTO limit_audit (user_id, actor_id, action, entity_type, payload)
       VALUES ($1, $2, 'set_limit', 'limit', $3)`,
      [
        request.userId,
        request.actorId || null,
        JSON.stringify({
          limitKey: request.limitKey,
          currency: request.currency,
          newValue: request.newValue,
          origin: request.origin,
          reason: request.reason,
        }),
      ]
    );

    await client.query('COMMIT');

    // Invalidate cache
    await invalidateLimitCache(request.userId, request.limitKey, request.currency);

    console.log('Applied limit adjustment', request);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error applying limit adjustment', { request, error });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Apply SIRA recommendations (if auto_apply)
 */
export async function applySiraRecommendations(
  userId: string,
  recommendations: SiraLimitRecommendation
): Promise<{ applied: number; skipped: number }> {
  let applied = 0;
  let skipped = 0;

  if (recommendations.action !== 'auto_apply') {
    console.log('SIRA recommendations require manual review', {
      userId,
      action: recommendations.action,
    });
    return { applied: 0, skipped: recommendations.recommendations.length };
  }

  for (const rec of recommendations.recommendations) {
    // Only apply high-confidence recommendations
    if (rec.confidence < 0.7) {
      skipped++;
      continue;
    }

    // Only apply if change is significant (>10%)
    if (Math.abs(rec.changePercent) < 10) {
      skipped++;
      continue;
    }

    try {
      await applyLimitAdjustment({
        userId,
        limitKey: rec.limitKey,
        newValue: rec.recommendedLimit,
        currency: 'USD', // TODO: Make configurable
        reason: `SIRA auto-adjustment: ${rec.reasoning.join(', ')}`,
        origin: 'sira',
      });
      applied++;
    } catch (error) {
      console.error('Failed to apply SIRA recommendation', { userId, rec, error });
      skipped++;
    }
  }

  console.log('Applied SIRA recommendations', { userId, applied, skipped });
  return { applied, skipped };
}

// ========================================
// Batch Evaluation
// ========================================

/**
 * Evaluate limits for multiple users (used by worker)
 */
export async function batchEvaluateLimits(
  userIds: string[]
): Promise<Map<string, SiraLimitRecommendation>> {
  const results = new Map<string, SiraLimitRecommendation>();

  for (const userId of userIds) {
    try {
      // Gather user data
      const userData = await gatherUserData(userId);

      // Get SIRA recommendation
      const recommendation = await callSiraLimitRecommendation(userData);

      results.set(userId, recommendation);

      // Auto-apply if eligible
      if (recommendation.action === 'auto_apply') {
        await applySiraRecommendations(userId, recommendation);
      }
    } catch (error) {
      console.error('Failed to evaluate limits for user', { userId, error });
    }
  }

  return results;
}

/**
 * Gather user data for SIRA evaluation
 */
async function gatherUserData(userId: string): Promise<SiraLimitInput> {
  // Query user data from database
  const result = await pool.query(
    `SELECT
       u.kyc_level,
       EXTRACT(EPOCH FROM (NOW() - u.created_at)) / 86400 AS account_age_days,
       COALESCE(SUM(t.amount), 0) AS total_volume,
       COALESCE(AVG(t.amount), 0) AS avg_transaction_amount,
       COALESCE(MAX(t.amount), 0) AS max_transaction_amount,
       COUNT(t.id) AS transaction_count,
       COALESCE(AVG(CASE WHEN t.status = 'success' THEN 1 ELSE 0 END), 0) AS success_rate
     FROM users u
     LEFT JOIN transactions t ON u.id = t.user_id
     WHERE u.id = $1
     GROUP BY u.id, u.kyc_level, u.created_at`,
    [userId]
  );

  const row = result.rows[0];

  // TODO: Gather risk profile from fraud detection service
  // For now, use placeholder values
  return {
    userId,
    currentKycLevel: row?.kyc_level || 'P0',
    accountAge: row?.account_age_days || 0,
    transactionHistory: {
      totalVolume: row?.total_volume || 0,
      avgMonthlyVolume: (row?.total_volume || 0) / Math.max(row?.account_age_days / 30, 1),
      maxTransactionAmount: row?.max_transaction_amount || 0,
      transactionCount: row?.transaction_count || 0,
      successRate: row?.success_rate || 1.0,
    },
    riskProfile: {
      fraudScore: 0.1, // Placeholder
      chargebackRate: 0.01, // Placeholder
      disputeRate: 0.005, // Placeholder
      suspiciousActivityCount: 0, // Placeholder
    },
    usagePatterns: {
      dailyActiveRate: 0.5, // Placeholder
      velocityScore: 0.2, // Placeholder
      peakHourActivity: false, // Placeholder
    },
    context: {
      country: 'SN',
      currency: 'USD',
      accountType: 'personal',
    },
  };
}
