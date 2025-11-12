/**
 * Brique 70octies - SIRA ML Integration
 * Machine learning integration for loyalty optimization, churn prediction, and personalization
 */

import pool from '../db';

export interface SiraUserProfile {
  userId: string;
  programId: string;
  lifetimeSpend: number;
  lifetimePoints: number;
  totalTransactions: number;
  daysSinceLastPurchase: number;
  avgTransactionValue: number;
  currentTier: string;
  churnRiskScore: number;
  engagementScore: number;
}

export interface SiraScoreResult {
  multiplier: number;
  bonusPoints: number;
  reasoning: string[];
  confidence: number;
  modelVersion: string;
}

export interface SiraEvaluationResult {
  churnRisk: number;
  optimalCashbackRate: number;
  recommendedTier: string;
  nextBestAction: string;
  lifetimeValuePrediction: number;
}

/**
 * Get SIRA loyalty multiplier for a user transaction
 * This is the core ML-driven scoring function
 */
export async function siraScoreForUser(
  userId: string,
  programId: string,
  transactionAmount: number,
  context: {
    module?: string;
    category?: string;
    isFirstDailyPurchase?: boolean;
  }
): Promise<SiraScoreResult> {
  const profile = await getUserProfile(userId, programId);

  let multiplier = 1.0;
  let bonusPoints = 0;
  const reasoning: string[] = [];

  // ML Rule 1: High-value transaction boost
  if (transactionAmount > 500) {
    multiplier += 0.01; // +1%
    bonusPoints += transactionAmount * 0.01;
    reasoning.push('High-value purchase detected');
  }

  // ML Rule 2: Churn prevention (most critical)
  if (profile.churnRiskScore > 0.7) {
    multiplier += 0.02; // +2%
    bonusPoints += transactionAmount * 0.02;
    reasoning.push(`Churn risk high (${(profile.churnRiskScore * 100).toFixed(0)}%) - retention bonus applied`);
  } else if (profile.churnRiskScore > 0.5) {
    multiplier += 0.01;
    bonusPoints += transactionAmount * 0.01;
    reasoning.push('Moderate churn risk - engagement bonus');
  }

  // ML Rule 3: Frequency-based reward
  if (profile.daysSinceLastPurchase < 7) {
    multiplier += 0.005; // +0.5%
    bonusPoints += transactionAmount * 0.005;
    reasoning.push('Frequent shopper bonus');
  }

  // ML Rule 4: First daily purchase bonus (gamification)
  if (context.isFirstDailyPurchase) {
    bonusPoints += 10;
    reasoning.push('First purchase of the day bonus');
  }

  // ML Rule 5: Cross-module promotion
  if (context.module === 'eats') {
    multiplier += 0.015; // +1.5%
    bonusPoints += transactionAmount * 0.015;
    reasoning.push('Cross-module promotion (Eats)');
  }

  // ML Rule 6: Customer lifetime value boost
  if (profile.lifetimeSpend > 10000) {
    multiplier += 0.01;
    bonusPoints += transactionAmount * 0.01;
    reasoning.push('VIP customer recognized');
  }

  // ML Rule 7: Engagement score multiplier
  if (profile.engagementScore > 0.8) {
    multiplier += 0.005;
    reasoning.push('High engagement bonus');
  }

  // ML Rule 8: Tier stagnation incentive
  if (profile.currentTier === 'basic' && profile.lifetimeSpend > 300) {
    bonusPoints += 15;
    reasoning.push('Tier upgrade incentive');
  }

  return {
    multiplier,
    bonusPoints: Math.round(bonusPoints),
    reasoning,
    confidence: calculateConfidence(profile),
    modelVersion: 'sira-v2.1-industrial'
  };
}

/**
 * Comprehensive user evaluation for strategic decision-making
 */
export async function siraEvaluateUser(
  userId: string,
  programId: string
): Promise<SiraEvaluationResult> {
  const profile = await getUserProfile(userId, programId);

  // Churn risk calculation (4 factors)
  let churnRisk = 0;

  // Factor 1: Recency
  if (profile.daysSinceLastPurchase > 60) churnRisk += 0.4;
  else if (profile.daysSinceLastPurchase > 30) churnRisk += 0.2;
  else if (profile.daysSinceLastPurchase > 14) churnRisk += 0.1;

  // Factor 2: Frequency
  if (profile.totalTransactions < 3) churnRisk += 0.2;
  else if (profile.totalTransactions < 5) churnRisk += 0.1;

  // Factor 3: Monetary - unredeemed balance
  if (profile.lifetimePoints > 1000) churnRisk += 0.1;

  // Factor 4: Tier stagnation
  if (profile.currentTier === 'basic' && profile.lifetimeSpend > 500) churnRisk += 0.15;

  churnRisk = Math.min(churnRisk, 1.0);

  // Optimal cashback rate (dynamic pricing)
  let optimalCashbackRate = 0.02; // Base 2%
  if (profile.lifetimeSpend > 5000) optimalCashbackRate = 0.03;
  if (profile.lifetimeSpend > 10000) optimalCashbackRate = 0.04;
  if (churnRisk > 0.7) optimalCashbackRate += 0.01; // Boost for at-risk

  // Recommended tier
  let recommendedTier = profile.currentTier;
  if (profile.lifetimePoints >= 20000 || profile.lifetimeSpend >= 10000) {
    recommendedTier = 'platinum';
  } else if (profile.lifetimePoints >= 5000 || profile.lifetimeSpend >= 2500) {
    recommendedTier = 'gold';
  } else if (profile.lifetimePoints >= 1000 || profile.lifetimeSpend >= 500) {
    recommendedTier = 'silver';
  }

  // Next best action
  let nextBestAction = 'continue_engagement';
  if (churnRisk > 0.7) nextBestAction = 'urgent_reactivation_needed';
  else if (churnRisk > 0.5) nextBestAction = 'send_winback_campaign';
  else if (profile.currentTier !== recommendedTier) nextBestAction = 'promote_tier_upgrade';
  else if (profile.lifetimePoints > 500) nextBestAction = 'encourage_redemption';

  // Lifetime value prediction (simple linear model)
  const avgMonthlySpend = profile.lifetimeSpend / Math.max(profile.totalTransactions / 4, 1);
  const lifetimeValuePrediction = avgMonthlySpend * 12 * (1 - churnRisk) * 2;

  return {
    churnRisk,
    optimalCashbackRate,
    recommendedTier,
    nextBestAction,
    lifetimeValuePrediction
  };
}

/**
 * Record feedback for SIRA ML model training
 */
export async function siraRecordFeedback(
  userId: string,
  programId: string,
  eventType: 'churn' | 'redeem' | 'tier_upgrade' | 'high_value_purchase',
  features: any,
  label: boolean,
  modelVersion: string = 'sira-v2.1-industrial'
): Promise<void> {
  await pool.query(
    `INSERT INTO loyalty_sira_feedback
     (user_id, program_id, event_type, features, label, model_version, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [userId, programId, eventType, JSON.stringify(features), label, modelVersion]
  );
}

/**
 * Get user profile for ML scoring
 */
async function getUserProfile(userId: string, programId: string): Promise<SiraUserProfile> {
  const result = await pool.query(
    `SELECT
      user_id,
      program_id,
      lifetime_spend,
      lifetime_points_earned as lifetime_points,
      total_transactions,
      COALESCE(EXTRACT(EPOCH FROM (NOW() - last_earned_at)) / 86400, 999) as days_since_last_purchase,
      CASE WHEN total_transactions > 0 THEN lifetime_spend / total_transactions ELSE 0 END as avg_transaction_value,
      current_tier,
      COALESCE(churn_risk_score, 0) as churn_risk_score,
      COALESCE(engagement_score, 0.5) as engagement_score
    FROM loyalty_balances
    WHERE user_id = $1 AND program_id = $2`,
    [userId, programId]
  );

  if (result.rows.length === 0) {
    // New user - return default profile
    return {
      userId,
      programId,
      lifetimeSpend: 0,
      lifetimePoints: 0,
      totalTransactions: 0,
      daysSinceLastPurchase: 999,
      avgTransactionValue: 0,
      currentTier: 'basic',
      churnRiskScore: 0,
      engagementScore: 0.5
    };
  }

  const row = result.rows[0];
  return {
    userId: row.user_id,
    programId: row.program_id,
    lifetimeSpend: parseFloat(row.lifetime_spend || 0),
    lifetimePoints: parseFloat(row.lifetime_points || 0),
    totalTransactions: parseInt(row.total_transactions || 0),
    daysSinceLastPurchase: parseFloat(row.days_since_last_purchase || 999),
    avgTransactionValue: parseFloat(row.avg_transaction_value || 0),
    currentTier: row.current_tier,
    churnRiskScore: parseFloat(row.churn_risk_score || 0),
    engagementScore: parseFloat(row.engagement_score || 0.5)
  };
}

/**
 * Calculate confidence score for ML predictions
 */
function calculateConfidence(profile: SiraUserProfile): number {
  let confidence = 0.5; // Base confidence

  // More transactions = higher confidence
  if (profile.totalTransactions > 20) confidence += 0.3;
  else if (profile.totalTransactions > 10) confidence += 0.2;
  else if (profile.totalTransactions > 5) confidence += 0.1;

  // Recent activity = higher confidence
  if (profile.daysSinceLastPurchase < 7) confidence += 0.1;
  else if (profile.daysSinceLastPurchase < 30) confidence += 0.05;

  // Higher spend = more data = higher confidence
  if (profile.lifetimeSpend > 1000) confidence += 0.1;

  return Math.min(confidence, 1.0);
}

/**
 * Batch update churn risk scores for all users in a program
 * Called by CRON worker
 */
export async function siraBatchUpdateChurnRisk(programId: string): Promise<number> {
  const balances = await pool.query(
    'SELECT id, user_id FROM loyalty_balances WHERE program_id = $1',
    [programId]
  );

  let updatedCount = 0;

  for (const balance of balances.rows) {
    try {
      const evaluation = await siraEvaluateUser(balance.user_id, programId);

      await pool.query(
        `UPDATE loyalty_balances
         SET churn_risk_score = $1, updated_at = NOW()
         WHERE id = $2`,
        [evaluation.churnRisk, balance.id]
      );

      updatedCount++;
    } catch (error) {
      console.error(`Failed to update churn risk for user ${balance.user_id}:`, error);
    }
  }

  return updatedCount;
}
