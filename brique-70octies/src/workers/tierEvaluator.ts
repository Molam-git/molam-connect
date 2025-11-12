/**
 * Brique 70octies - Tier Evaluation Worker
 * CRON job to evaluate and upgrade user tiers based on points and spend thresholds
 */

import cron from 'node-cron';
import pool from '../db';
import { createAuditLog } from '../services/audit';
import { publishTierUpgradedEvent } from '../services/webhooks';

/**
 * Evaluate and upgrade user tiers
 * Runs daily at 2 AM
 */
export function startTierEvaluator() {
  // Run daily at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('[TIER_EVALUATOR] Starting tier evaluation job...');

    try {
      const startTime = Date.now();
      const upgradedCount = await evaluateAllTiers();
      const duration = Date.now() - startTime;

      console.log(`[TIER_EVALUATOR] Completed. Upgraded ${upgradedCount} users in ${duration}ms`);
    } catch (error) {
      console.error('[TIER_EVALUATOR] Error:', error);
    }
  });

  console.log('[TIER_EVALUATOR] Scheduled to run daily at 2:00 AM');
}

/**
 * Evaluate tiers for all active programs
 */
export async function evaluateAllTiers(): Promise<number> {
  const programs = await pool.query(
    `SELECT id, tier_thresholds FROM loyalty_programs WHERE status = 'active' AND enable_tiers = TRUE`
  );

  let totalUpgraded = 0;

  for (const program of programs.rows) {
    const upgraded = await evaluateProgramTiers(program.id, program.tier_thresholds);
    totalUpgraded += upgraded;
  }

  return totalUpgraded;
}

/**
 * Evaluate tiers for a specific program
 */
export async function evaluateProgramTiers(
  programId: string,
  tierThresholds: any
): Promise<number> {
  const balances = await pool.query(
    `SELECT id, user_id, lifetime_points_earned, lifetime_spend, current_tier
     FROM loyalty_balances
     WHERE program_id = $1`,
    [programId]
  );

  let upgradedCount = 0;

  for (const balance of balances.rows) {
    const newTier = calculateTier(
      balance.lifetime_points_earned,
      balance.lifetime_spend,
      tierThresholds
    );

    if (newTier !== balance.current_tier) {
      const oldTier = balance.current_tier;

      // Check if it's an upgrade (not a downgrade)
      const tierRank = { basic: 0, silver: 1, gold: 2, platinum: 3 };
      if (tierRank[newTier] > tierRank[oldTier]) {
        await upgradeTier(balance.id, balance.user_id, programId, oldTier, newTier);
        upgradedCount++;
      }
    }
  }

  return upgradedCount;
}

/**
 * Calculate appropriate tier based on points and spend
 */
function calculateTier(
  lifetimePoints: number,
  lifetimeSpend: number,
  thresholds: any
): string {
  const points = parseFloat(lifetimePoints);
  const spend = parseFloat(lifetimeSpend);

  // Check platinum
  if (thresholds.platinum) {
    const platinumPoints = thresholds.platinum.points || Infinity;
    const platinumSpend = thresholds.platinum.spend || Infinity;
    if (points >= platinumPoints || spend >= platinumSpend) {
      return 'platinum';
    }
  }

  // Check gold
  if (thresholds.gold) {
    const goldPoints = thresholds.gold.points || Infinity;
    const goldSpend = thresholds.gold.spend || Infinity;
    if (points >= goldPoints || spend >= goldSpend) {
      return 'gold';
    }
  }

  // Check silver
  if (thresholds.silver) {
    const silverPoints = thresholds.silver.points || Infinity;
    const silverSpend = thresholds.silver.spend || Infinity;
    if (points >= silverPoints || spend >= silverSpend) {
      return 'silver';
    }
  }

  return 'basic';
}

/**
 * Upgrade user tier
 */
async function upgradeTier(
  balanceId: string,
  userId: string,
  programId: string,
  oldTier: string,
  newTier: string
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Update balance
    await client.query(
      `UPDATE loyalty_balances
       SET current_tier = $1, tier_upgraded_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [newTier, balanceId]
    );

    // Create tier snapshot
    const snapshot = {
      balanceId,
      userId,
      programId,
      oldTier,
      newTier,
      upgradedAt: new Date().toISOString(),
      upgradedBy: 'tier_evaluator_cron'
    };

    await client.query(
      `INSERT INTO loyalty_tier_snapshots (program_id, snapshot, created_by, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [programId, JSON.stringify(snapshot), 'system:tier_evaluator']
    );

    // Audit log
    await createAuditLog({
      entityType: 'balance',
      entityId: balanceId,
      action: 'update',
      actorId: 'system',
      actorRole: 'tier_evaluator',
      changes: {
        oldTier,
        newTier,
        reason: 'automatic_tier_evaluation'
      }
    });

    await client.query('COMMIT');

    // Publish event
    setImmediate(async () => {
      try {
        await publishTierUpgradedEvent(programId, userId, {
          oldTier,
          newTier,
          triggeredBy: 'tier_evaluator_cron'
        });
      } catch (error) {
        console.error('Failed to publish tier upgrade event:', error);
      }
    });

    console.log(`[TIER_EVALUATOR] Upgraded user ${userId} from ${oldTier} to ${newTier}`);

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Manual tier evaluation (for testing or admin trigger)
 */
export async function manualTierEvaluation(programId?: string): Promise<number> {
  if (programId) {
    const program = await pool.query(
      'SELECT tier_thresholds FROM loyalty_programs WHERE id = $1',
      [programId]
    );

    if (program.rows.length === 0) {
      throw new Error('Program not found');
    }

    return await evaluateProgramTiers(programId, program.rows[0].tier_thresholds);
  } else {
    return await evaluateAllTiers();
  }
}
