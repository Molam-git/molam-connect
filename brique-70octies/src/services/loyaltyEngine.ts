/**
 * Brique 70octies - AI Loyalty Engine (Sira)
 * Main engine for dynamic points calculation, cashback, tiers, and AI recommendations
 */

import pool from '../db';

export interface Transaction {
  id?: string;
  merchant_id: string;
  user_id: string;
  amount: number;
  currency?: string;
  module?: string; // shop, eats, talk, free
  product_category?: string;
  product_id?: string;
}

export interface PointsCalculation {
  basePoints: number;
  tierMultiplier: number;
  aiBonus: number;
  totalPoints: number;
  aiReason?: string;
}

/**
 * SIRA AI: Calculate points for a transaction
 */
export async function calculatePoints(
  programId: string,
  userId: string,
  transaction: Transaction
): Promise<PointsCalculation> {
  const program = await getProgram(programId);
  const balance = await getOrCreateBalance(programId, userId);

  // Base points
  let basePoints = transaction.amount * program.earn_rate;

  // Tier multiplier
  const tierMultiplier = program.tier_multipliers[balance.current_tier] || 1.0;

  // AI bonus calculation
  const aiBonus = await siraCalculateBonus(transaction, balance, program);

  // Apply rules
  const rulesBonus = await applyRules(programId, transaction);

  const totalPoints = (basePoints * tierMultiplier) + aiBonus + rulesBonus;

  return {
    basePoints,
    tierMultiplier,
    aiBonus,
    totalPoints,
    aiReason: aiBonus > 0 ? await getAIBonusReason(transaction, balance) : undefined
  };
}

/**
 * SIRA AI: Calculate bonus points based on user behavior and business logic
 */
async function siraCalculateBonus(
  txn: Transaction,
  balance: any,
  program: any
): Promise<number> {
  if (!program.ai_enabled) return 0;

  let bonus = 0;
  const level = program.ai_optimization_level || 'medium';

  // Rule 1: High-value transaction bonus
  if (txn.amount > 500) {
    bonus += txn.amount * 0.01; // Extra 1%
  }

  // Rule 2: Churn risk prevention
  if (balance.churn_risk_score && balance.churn_risk_score > 0.7) {
    bonus += txn.amount * 0.02; // Extra 2% to retain customer
  }

  // Rule 3: Encourage frequent purchases
  const daysSinceLastPurchase = balance.last_earned_at
    ? (Date.now() - new Date(balance.last_earned_at).getTime()) / (1000 * 60 * 60 * 24)
    : 999;

  if (daysSinceLastPurchase < 7) {
    bonus += txn.amount * 0.005; // 0.5% for frequent shoppers
  }

  // Rule 4: First purchase of the day bonus
  const today = new Date().toISOString().split('T')[0];
  const lastPurchaseDate = balance.last_earned_at
    ? new Date(balance.last_earned_at).toISOString().split('T')[0]
    : null;

  if (lastPurchaseDate !== today) {
    bonus += 10; // Fixed 10 points for first daily purchase
  }

  // Rule 5: Category-specific bonuses (cross-module promotion)
  if (txn.module === 'eats' && level !== 'low') {
    bonus += txn.amount * 0.015; // 1.5% extra for food orders
  }

  // Rule 6: Random surprise bonus (engagement booster)
  if (level === 'high' || level === 'max') {
    if (Math.random() < 0.1) { // 10% chance
      bonus += txn.amount * 0.05; // 5% surprise bonus
    }
  }

  return Math.round(bonus);
}

/**
 * Get AI bonus reason (for transparency)
 */
async function getAIBonusReason(txn: Transaction, balance: any): Promise<string> {
  const reasons: string[] = [];

  if (txn.amount > 500) reasons.push('High-value purchase bonus');
  if (balance.churn_risk_score > 0.7) reasons.push('Loyalty retention bonus');
  if (txn.module === 'eats') reasons.push('Cross-module promotion (Eats)');

  return reasons.join(', ') || 'AI-optimized reward';
}

/**
 * Award points to user
 */
export async function awardPoints(
  programId: string,
  userId: string,
  transaction: Transaction
): Promise<any> {
  const calc = await calculatePoints(programId, userId, transaction);
  const balance = await getOrCreateBalance(programId, userId);

  // Create transaction record
  const txnResult = await pool.query(
    `INSERT INTO loyalty_transactions
     (balance_id, txn_type, amount, description, origin_module, origin_txn_id,
      origin_amount, base_amount, multiplier, ai_bonus, ai_reason, created_at)
     VALUES ($1, 'earn', $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     RETURNING *`,
    [
      balance.id,
      calc.totalPoints,
      `Points earned from ${transaction.module || 'purchase'}`,
      transaction.module || 'shop',
      transaction.id,
      transaction.amount,
      calc.basePoints,
      calc.tierMultiplier,
      calc.aiBonus,
      calc.aiReason
    ]
  );

  // Update balance
  await pool.query(
    `UPDATE loyalty_balances
     SET points_balance = points_balance + $1,
         lifetime_points_earned = lifetime_points_earned + $1,
         lifetime_spend = lifetime_spend + $2,
         total_transactions = total_transactions + 1,
         last_earned_at = NOW(),
         updated_at = NOW()
     WHERE id = $3`,
    [calc.totalPoints, transaction.amount, balance.id]
  );

  return {
    transaction: txnResult.rows[0],
    pointsAwarded: calc.totalPoints,
    newBalance: balance.points_balance + calc.totalPoints
  };
}

/**
 * Redeem points
 */
export async function redeemPoints(
  balanceId: string,
  pointsToRedeem: number,
  rewardId?: string
): Promise<any> {
  const balance = await pool.query(
    'SELECT * FROM loyalty_balances WHERE id = $1',
    [balanceId]
  );

  if (balance.rows.length === 0) {
    throw new Error('Balance not found');
  }

  if (balance.rows[0].points_balance < pointsToRedeem) {
    throw new Error('Insufficient points');
  }

  // Create redemption transaction
  const txn = await pool.query(
    `INSERT INTO loyalty_transactions
     (balance_id, txn_type, amount, description, created_at)
     VALUES ($1, 'redeem', $2, 'Points redeemed', NOW())
     RETURNING *`,
    [balanceId, pointsToRedeem]
  );

  // Update balance
  await pool.query(
    `UPDATE loyalty_balances
     SET points_balance = points_balance - $1,
         lifetime_points_redeemed = lifetime_points_redeemed + $1,
         last_redeemed_at = NOW(),
         updated_at = NOW()
     WHERE id = $2`,
    [pointsToRedeem, balanceId]
  );

  // If reward specified, create redemption record
  if (rewardId) {
    await pool.query(
      `INSERT INTO loyalty_redemptions
       (balance_id, reward_id, points_spent, reward_name, reward_type, created_at)
       SELECT $1, $2, $3, name, reward_type, NOW()
       FROM loyalty_rewards
       WHERE id = $2`,
      [balanceId, rewardId, pointsToRedeem]
    );
  }

  return {
    transaction: txn.rows[0],
    newBalance: balance.rows[0].points_balance - pointsToRedeem
  };
}

/**
 * Calculate cashback
 */
export async function calculateCashback(
  programId: string,
  userId: string,
  amount: number
): Promise<number> {
  const program = await getProgram(programId);
  if (!program.enable_cashback) return 0;

  const balance = await getOrCreateBalance(programId, userId);

  let cashbackRate = program.cashback_rate;

  // AI boost for high-value customers
  if (balance.lifetime_spend > 5000) {
    cashbackRate *= 1.2;
  }

  // Tier bonus
  const tierBonus = program.tier_multipliers[balance.current_tier] - 1;
  cashbackRate += tierBonus * 0.005;

  return amount * cashbackRate;
}

/**
 * Get or create user balance
 */
async function getOrCreateBalance(programId: string, userId: string): Promise<any> {
  let result = await pool.query(
    'SELECT * FROM loyalty_balances WHERE program_id = $1 AND user_id = $2',
    [programId, userId]
  );

  if (result.rows.length === 0) {
    result = await pool.query(
      `INSERT INTO loyalty_balances (program_id, user_id, points_balance, current_tier, created_at, updated_at)
       VALUES ($1, $2, 0, 'basic', NOW(), NOW())
       RETURNING *`,
      [programId, userId]
    );
  }

  return result.rows[0];
}

/**
 * Get program
 */
async function getProgram(programId: string): Promise<any> {
  const result = await pool.query(
    'SELECT * FROM loyalty_programs WHERE id = $1',
    [programId]
  );

  if (result.rows.length === 0) {
    throw new Error('Program not found');
  }

  return result.rows[0];
}

/**
 * Apply custom rules
 */
async function applyRules(programId: string, transaction: Transaction): Promise<number> {
  const rules = await pool.query(
    `SELECT * FROM loyalty_rules
     WHERE program_id = $1 AND enabled = TRUE AND rule_type = 'earning'
     ORDER BY priority DESC`,
    [programId]
  );

  let bonus = 0;

  for (const rule of rules.rows) {
    const conditions = rule.conditions;
    const actions = rule.actions;

    // Simple condition checking (can be enhanced)
    if (conditions.product_category && conditions.product_category === transaction.product_category) {
      if (actions.multiply_points) {
        bonus += transaction.amount * actions.multiply_points;
      }
      if (actions.add_bonus) {
        bonus += actions.add_bonus;
      }
    }

    if (conditions.min_amount && transaction.amount >= conditions.min_amount) {
      if (actions.multiply_points) {
        bonus += transaction.amount * actions.multiply_points;
      }
    }
  }

  return bonus;
}

/**
 * Generate AI recommendations for campaigns
 */
export async function generateCampaignRecommendations(merchantId: string): Promise<any[]> {
  // Analyze merchant data
  const stats = await pool.query(
    `SELECT
       COUNT(DISTINCT user_id) as total_users,
       AVG(churn_risk_score) as avg_churn_risk,
       COUNT(*) FILTER (WHERE current_tier = 'basic') as basic_count,
       COUNT(*) FILTER (WHERE current_tier = 'silver') as silver_count,
       COUNT(*) FILTER (WHERE last_earned_at < NOW() - INTERVAL '30 days') as inactive_count
     FROM loyalty_balances lb
     JOIN loyalty_programs lp ON lb.program_id = lp.id
     WHERE lp.merchant_id = $1`,
    [merchantId]
  );

  const data = stats.rows[0];
  const recommendations: any[] = [];

  // Recommendation 1: Reactivate inactive users
  if (data.inactive_count > data.total_users * 0.2) {
    recommendations.push({
      type: 'bonus_points',
      title: 'Reactivate Inactive Users',
      description: `${data.inactive_count} users haven't earned points in 30 days. Offer 2x points for 7 days.`,
      target_segment: 'inactive',
      bonus_multiplier: 2.0,
      expected_participation_rate: 25,
      expected_revenue_impact: data.inactive_count * 50 * 0.25,
      ai_confidence_score: 0.75
    });
  }

  // Recommendation 2: Tier upgrade campaign
  if (data.basic_count > data.total_users * 0.7) {
    recommendations.push({
      type: 'tier_upgrade',
      title: 'Encourage Tier Upgrades',
      description: `70% of users are in Basic tier. Offer 500 bonus points to help reach Silver.`,
      target_tier: ['basic'],
      fixed_bonus: 500,
      expected_participation_rate: 40,
      expected_revenue_impact: data.basic_count * 0.4 * 100,
      ai_confidence_score: 0.82
    });
  }

  // Recommendation 3: High churn risk prevention
  if (data.avg_churn_risk > 0.5) {
    recommendations.push({
      type: 'cashback_boost',
      title: 'Prevent Churn with Cashback',
      description: 'Average churn risk is high. Offer 5% cashback for high-risk customers.',
      target_segment: 'at_risk',
      cashback_boost: 0.05,
      expected_participation_rate: 60,
      expected_revenue_impact: data.total_users * 0.3 * 100 * 0.6,
      ai_confidence_score: 0.88
    });
  }

  return recommendations;
}

/**
 * Update churn risk scores (AI prediction)
 */
export async function updateChurnRiskScores(programId: string): Promise<void> {
  const balances = await pool.query(
    'SELECT * FROM loyalty_balances WHERE program_id = $1',
    [programId]
  );

  for (const balance of balances.rows) {
    const daysSinceLastEarn = balance.last_earned_at
      ? (Date.now() - new Date(balance.last_earned_at).getTime()) / (1000 * 60 * 60 * 24)
      : 999;

    let churnRisk = 0;

    // Factor 1: Days since last purchase
    if (daysSinceLastEarn > 60) churnRisk += 0.4;
    else if (daysSinceLastEarn > 30) churnRisk += 0.2;

    // Factor 2: Low engagement
    if (balance.total_transactions < 3) churnRisk += 0.2;

    // Factor 3: Low balance (not redeeming)
    if (balance.points_balance > 1000 && !balance.last_redeemed_at) churnRisk += 0.1;

    // Factor 4: Tier stagnation
    if (balance.current_tier === 'basic' && balance.lifetime_spend > 500) churnRisk += 0.15;

    churnRisk = Math.min(churnRisk, 1.0);

    await pool.query(
      'UPDATE loyalty_balances SET churn_risk_score = $1, updated_at = NOW() WHERE id = $2',
      [churnRisk, balance.id]
    );
  }
}
