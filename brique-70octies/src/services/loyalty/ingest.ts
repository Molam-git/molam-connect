/**
 * Brique 70octies - Idempotent Event Ingestion
 * Core industrial loyalty ingestion with SIRA ML integration, atomic operations, and audit trails
 */

import pool from '../../db';
import { siraScoreForUser, siraRecordFeedback } from '../sira';
import { publishPointsEarnedEvent, publishPointsRedeemedEvent } from '../webhooks';
import { createAuditLog } from '../audit';

export interface IngestEvent {
  idempotencyKey: string;
  programId: string;
  userId: string;
  type: 'purchase' | 'refund' | 'referral' | 'campaign_bonus' | 'manual_adjust';
  amount: number; // Transaction amount in currency
  currency: string;
  originModule?: string; // shop, eats, talk, free
  originRef?: string; // External transaction ID
  metadata?: any;
  actorId?: string; // For manual adjustments
  actorRole?: string; // For RBAC
  ipAddress?: string;
  userAgent?: string;
}

export interface IngestResult {
  success: boolean;
  transactionId?: string;
  pointsAwarded?: number;
  newBalance?: number;
  wasIdempotent?: boolean; // True if duplicate detected
  error?: string;
  siraInsights?: {
    multiplier: number;
    bonusPoints: number;
    reasoning: string[];
    confidence: number;
  };
}

/**
 * Ingest loyalty event with full industrial features:
 * - Idempotency check
 * - SIRA ML scoring
 * - Atomic balance update with row locking
 * - Fraud detection
 * - Budget control
 * - Audit trail
 * - Webhook publishing
 */
export async function ingestEvent(event: IngestEvent): Promise<IngestResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Step 1: Idempotency check
    const existingTxn = await client.query(
      `SELECT id, amount, balance_id FROM loyalty_transactions
       WHERE idempotency_key = $1`,
      [event.idempotencyKey]
    );

    if (existingTxn.rows.length > 0) {
      // Duplicate detected - return existing result
      const existing = existingTxn.rows[0];
      const balance = await client.query(
        'SELECT points_balance, program_id FROM loyalty_balances WHERE id = $1',
        [existing.balance_id]
      );

      await client.query('COMMIT');

      return {
        success: true,
        transactionId: existing.id,
        pointsAwarded: existing.amount,
        newBalance: balance.rows[0]?.points_balance,
        wasIdempotent: true
      };
    }

    // Step 2: Load program configuration
    const programResult = await client.query(
      `SELECT * FROM loyalty_programs WHERE id = $1 FOR UPDATE`,
      [event.programId]
    );

    if (programResult.rows.length === 0) {
      throw new Error('Program not found');
    }

    const program = programResult.rows[0];

    // Step 3: Check if program is active
    if (program.status !== 'active') {
      throw new Error(`Program is not active (status: ${program.status})`);
    }

    // Step 4: Get or create balance with row locking (atomic)
    let balance = await client.query(
      `SELECT * FROM loyalty_balances
       WHERE program_id = $1 AND user_id = $2
       FOR UPDATE`,
      [event.programId, event.userId]
    );

    if (balance.rows.length === 0) {
      // Create new balance
      balance = await client.query(
        `INSERT INTO loyalty_balances
         (program_id, user_id, points_balance, locked, current_tier, created_at, updated_at)
         VALUES ($1, $2, 0, 0, 'basic', NOW(), NOW())
         RETURNING *`,
        [event.programId, event.userId]
      );
    }

    const userBalance = balance.rows[0];

    // Step 5: Fraud detection
    if (userBalance.is_frozen) {
      throw new Error('User account is frozen due to fraud flags');
    }

    // Step 6: Check daily earning limits (if configured)
    if (program.max_earn_per_day && event.type === 'purchase') {
      const todayEarnings = await client.query(
        `SELECT COALESCE(SUM(amount), 0) as today_total
         FROM loyalty_transactions
         WHERE balance_id = $1
           AND event_type = 'earn'
           AND created_at >= CURRENT_DATE`,
        [userBalance.id]
      );

      const todayTotal = parseFloat(todayEarnings.rows[0].today_total);
      if (todayTotal >= program.max_earn_per_day) {
        throw new Error('Daily earning limit exceeded');
      }
    }

    // Step 7: SIRA ML augmentation
    let pointsToAward = 0;
    let siraInsights = null;

    if (event.type === 'purchase' || event.type === 'campaign_bonus') {
      // Check if first daily purchase
      const lastEarnDate = userBalance.last_earned_at
        ? new Date(userBalance.last_earned_at).toISOString().split('T')[0]
        : null;
      const today = new Date().toISOString().split('T')[0];
      const isFirstDailyPurchase = lastEarnDate !== today;

      // Get SIRA score
      siraInsights = await siraScoreForUser(
        event.userId,
        event.programId,
        event.amount,
        {
          module: event.originModule,
          category: event.metadata?.category,
          isFirstDailyPurchase
        }
      );

      // Calculate base points
      const basePoints = event.amount * program.earn_rate;

      // Apply tier multiplier
      const tierMultipliers = program.tier_multipliers || {
        basic: 1.0,
        silver: 1.25,
        gold: 1.5,
        platinum: 2.0
      };
      const tierMultiplier = tierMultipliers[userBalance.current_tier] || 1.0;

      // Total points = (base * tier multiplier * SIRA multiplier) + SIRA bonus
      pointsToAward = (basePoints * tierMultiplier * siraInsights.multiplier) + siraInsights.bonusPoints;
      pointsToAward = Math.round(pointsToAward * 100) / 100; // Round to 2 decimals

    } else if (event.type === 'manual_adjust') {
      // Manual adjustment - no SIRA scoring
      pointsToAward = event.amount;
    } else if (event.type === 'refund') {
      // Refund - negative points
      pointsToAward = -Math.abs(event.amount);
    } else if (event.type === 'referral') {
      // Referral bonus - fixed amount
      pointsToAward = event.amount;
    }

    // Step 8: Budget control (only for positive awards)
    if (pointsToAward > 0 && program.budget_limit) {
      if (program.budget_spent >= program.budget_limit) {
        throw new Error('Program budget exhausted');
      }

      // Check if this transaction would exceed budget
      if (program.budget_spent + pointsToAward > program.budget_limit) {
        throw new Error('Transaction would exceed program budget');
      }
    }

    // Step 9: Create transaction record
    const txnResult = await client.query(
      `INSERT INTO loyalty_transactions
       (balance_id, event_type, amount, description, origin_module, origin_txn_id,
        origin_amount, base_amount, multiplier, ai_bonus, ai_reason, idempotency_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
       RETURNING *`,
      [
        userBalance.id,
        event.type === 'refund' ? 'refund' : 'earn',
        pointsToAward,
        getTransactionDescription(event),
        event.originModule,
        event.originRef,
        event.amount,
        event.amount * program.earn_rate,
        siraInsights?.multiplier || 1.0,
        siraInsights?.bonusPoints || 0,
        siraInsights?.reasoning.join(', ') || null,
        event.idempotencyKey
      ]
    );

    const transaction = txnResult.rows[0];

    // Step 10: Update balance atomically
    const newBalanceResult = await client.query(
      `UPDATE loyalty_balances
       SET points_balance = points_balance + $1,
           lifetime_points_earned = CASE WHEN $1 > 0 THEN lifetime_points_earned + $1 ELSE lifetime_points_earned END,
           lifetime_spend = lifetime_spend + $2,
           total_transactions = total_transactions + 1,
           last_earned_at = CASE WHEN $1 > 0 THEN NOW() ELSE last_earned_at END,
           updated_at = NOW()
       WHERE id = $3
       RETURNING points_balance`,
      [pointsToAward, event.amount, userBalance.id]
    );

    const newBalance = newBalanceResult.rows[0].points_balance;

    // Step 11: Update program budget spent (if applicable)
    if (pointsToAward > 0 && program.budget_limit) {
      await client.query(
        `UPDATE loyalty_programs
         SET budget_spent = budget_spent + $1,
             updated_at = NOW()
         WHERE id = $2`,
        [pointsToAward, event.programId]
      );
    }

    // Step 12: Create audit log
    await createAuditLog({
      entityType: 'transaction',
      entityId: transaction.id,
      action: 'create',
      actorId: event.actorId,
      actorRole: event.actorRole,
      changes: {
        type: event.type,
        pointsAwarded,
        originAmount: event.amount,
        originModule: event.originModule
      },
      ipAddress: event.ipAddress,
      userAgent: event.userAgent
    });

    // Step 13: Record SIRA feedback (for ML training)
    if (siraInsights && event.type === 'purchase') {
      await siraRecordFeedback(
        event.userId,
        event.programId,
        'high_value_purchase',
        {
          amount: event.amount,
          module: event.originModule,
          pointsAwarded,
          tierMultiplier: siraInsights.multiplier
        },
        true, // Positive outcome - user made a purchase
        siraInsights.confidence > 0.7 ? 'sira-v2.1-industrial' : 'sira-v2.0-baseline'
      );
    }

    await client.query('COMMIT');

    // Step 14: Publish webhook event (async, outside transaction)
    setImmediate(async () => {
      try {
        await publishPointsEarnedEvent(
          event.programId,
          event.userId,
          {
            transactionId: transaction.id,
            pointsAwarded,
            newBalance,
            source: event.originModule || event.type
          },
          event.idempotencyKey
        );
      } catch (error) {
        console.error('Failed to publish webhook event:', error);
      }
    });

    return {
      success: true,
      transactionId: transaction.id,
      pointsAwarded,
      newBalance,
      wasIdempotent: false,
      siraInsights: siraInsights ? {
        multiplier: siraInsights.multiplier,
        bonusPoints: siraInsights.bonusPoints,
        reasoning: siraInsights.reasoning,
        confidence: siraInsights.confidence
      } : undefined
    };

  } catch (error: any) {
    await client.query('ROLLBACK');

    console.error('Ingestion error:', error);

    return {
      success: false,
      error: error.message
    };
  } finally {
    client.release();
  }
}

/**
 * Helper: Get transaction description
 */
function getTransactionDescription(event: IngestEvent): string {
  switch (event.type) {
    case 'purchase':
      return `Points earned from ${event.originModule || 'purchase'}`;
    case 'refund':
      return 'Points refunded';
    case 'referral':
      return 'Referral bonus';
    case 'campaign_bonus':
      return event.metadata?.campaignName || 'Campaign bonus';
    case 'manual_adjust':
      return event.metadata?.reason || 'Manual adjustment';
    default:
      return 'Points transaction';
  }
}

/**
 * Redeem points (separate from ingestion)
 */
export async function redeemPoints(
  programId: string,
  userId: string,
  pointsToRedeem: number,
  rewardId?: string,
  idempotencyKey?: string,
  actorId?: string,
  actorRole?: string
): Promise<IngestResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Idempotency check
    if (idempotencyKey) {
      const existingTxn = await client.query(
        `SELECT id, amount FROM loyalty_transactions
         WHERE idempotency_key = $1`,
        [idempotencyKey]
      );

      if (existingTxn.rows.length > 0) {
        await client.query('COMMIT');
        return {
          success: true,
          transactionId: existingTxn.rows[0].id,
          pointsAwarded: existingTxn.rows[0].amount,
          wasIdempotent: true
        };
      }
    }

    // Get balance with lock
    const balanceResult = await client.query(
      `SELECT * FROM loyalty_balances
       WHERE program_id = $1 AND user_id = $2
       FOR UPDATE`,
      [programId, userId]
    );

    if (balanceResult.rows.length === 0) {
      throw new Error('Balance not found');
    }

    const balance = balanceResult.rows[0];

    // Check if frozen
    if (balance.is_frozen) {
      throw new Error('Account is frozen');
    }

    // Check sufficient balance
    const availableBalance = balance.points_balance - (balance.locked || 0);
    if (availableBalance < pointsToRedeem) {
      throw new Error(`Insufficient points. Available: ${availableBalance}, Requested: ${pointsToRedeem}`);
    }

    // Create redemption transaction
    const txnResult = await client.query(
      `INSERT INTO loyalty_transactions
       (balance_id, event_type, amount, description, idempotency_key, created_at)
       VALUES ($1, 'redeem', $2, 'Points redeemed', $3, NOW())
       RETURNING *`,
      [balance.id, -pointsToRedeem, idempotencyKey]
    );

    const transaction = txnResult.rows[0];

    // Update balance
    const newBalanceResult = await client.query(
      `UPDATE loyalty_balances
       SET points_balance = points_balance - $1,
           lifetime_points_redeemed = lifetime_points_redeemed + $1,
           last_redeemed_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING points_balance`,
      [pointsToRedeem, balance.id]
    );

    const newBalance = newBalanceResult.rows[0].points_balance;

    // Create redemption record if reward specified
    if (rewardId) {
      await client.query(
        `INSERT INTO loyalty_redemptions
         (balance_id, reward_id, points_spent, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [balance.id, rewardId, pointsToRedeem]
      );
    }

    // Audit log
    await createAuditLog({
      entityType: 'transaction',
      entityId: transaction.id,
      action: 'create',
      actorId,
      actorRole,
      changes: {
        type: 'redeem',
        pointsRedeemed: pointsToRedeem,
        rewardId
      }
    });

    // SIRA feedback
    await siraRecordFeedback(
      userId,
      programId,
      'redeem',
      {
        pointsRedeemed: pointsToRedeem,
        rewardId,
        balanceAfter: newBalance
      },
      true, // Positive - user engaged by redeeming
      'sira-v2.1-industrial'
    );

    await client.query('COMMIT');

    // Publish event
    setImmediate(async () => {
      try {
        await publishPointsRedeemedEvent(
          programId,
          userId,
          {
            transactionId: transaction.id,
            pointsRedeemed: pointsToRedeem,
            newBalance,
            rewardId
          },
          idempotencyKey
        );
      } catch (error) {
        console.error('Failed to publish redemption event:', error);
      }
    });

    return {
      success: true,
      transactionId: transaction.id,
      pointsAwarded: -pointsToRedeem,
      newBalance,
      wasIdempotent: false
    };

  } catch (error: any) {
    await client.query('ROLLBACK');

    return {
      success: false,
      error: error.message
    };
  } finally {
    client.release();
  }
}
