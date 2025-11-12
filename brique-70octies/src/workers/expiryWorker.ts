/**
 * Brique 70octies - Point Expiry Worker
 * CRON job to expire old points based on program rules
 */

import cron from 'node-cron';
import pool from '../db';
import { createAuditLog } from '../services/audit';

/**
 * Start point expiry worker
 * Runs daily at 3 AM (after tier evaluation)
 */
export function startExpiryWorker() {
  // Run daily at 3:00 AM
  cron.schedule('0 3 * * *', async () => {
    console.log('[EXPIRY_WORKER] Starting point expiry job...');

    try {
      const startTime = Date.now();
      const result = await expireOldPoints();
      const duration = Date.now() - startTime;

      console.log(
        `[EXPIRY_WORKER] Completed. Expired ${result.pointsExpired} points from ${result.usersAffected} users in ${duration}ms`
      );
    } catch (error) {
      console.error('[EXPIRY_WORKER] Error:', error);
    }
  });

  console.log('[EXPIRY_WORKER] Scheduled to run daily at 3:00 AM');
}

/**
 * Expire old points across all programs
 */
export async function expireOldPoints(): Promise<{
  usersAffected: number;
  pointsExpired: number;
}> {
  const programs = await pool.query(
    `SELECT id, points_expiry_days FROM loyalty_programs
     WHERE status = 'active' AND points_expiry_days IS NOT NULL`
  );

  let totalUsersAffected = 0;
  let totalPointsExpired = 0;

  for (const program of programs.rows) {
    const result = await expireProgramPoints(program.id, program.points_expiry_days);
    totalUsersAffected += result.usersAffected;
    totalPointsExpired += result.pointsExpired;
  }

  return {
    usersAffected: totalUsersAffected,
    pointsExpired: totalPointsExpired
  };
}

/**
 * Expire points for a specific program
 */
export async function expireProgramPoints(
  programId: string,
  expiryDays: number
): Promise<{
  usersAffected: number;
  pointsExpired: number;
}> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Find transactions that are old enough to expire
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - expiryDays);

    // Get transactions that should expire
    const expiredTxns = await client.query(
      `SELECT lt.id, lt.balance_id, lt.amount, lb.user_id, lb.points_balance
       FROM loyalty_transactions lt
       JOIN loyalty_balances lb ON lt.balance_id = lb.id
       WHERE lb.program_id = $1
         AND lt.event_type = 'earn'
         AND lt.created_at < $2
         AND lt.expired = FALSE
       ORDER BY lt.created_at ASC`,
      [programId, expiryDate]
    );

    if (expiredTxns.rows.length === 0) {
      await client.query('COMMIT');
      return { usersAffected: 0, pointsExpired: 0 };
    }

    let totalPointsExpired = 0;
    const affectedUsers = new Set<string>();

    // Group by balance_id for efficient updates
    const balanceMap = new Map<string, { userId: string; pointsToExpire: number; txnIds: string[] }>();

    for (const txn of expiredTxns.rows) {
      if (!balanceMap.has(txn.balance_id)) {
        balanceMap.set(txn.balance_id, {
          userId: txn.user_id,
          pointsToExpire: 0,
          txnIds: []
        });
      }

      const entry = balanceMap.get(txn.balance_id)!;
      entry.pointsToExpire += parseFloat(txn.amount);
      entry.txnIds.push(txn.id);
      affectedUsers.add(txn.user_id);
    }

    // Process each balance
    for (const [balanceId, data] of balanceMap.entries()) {
      // Mark transactions as expired
      await client.query(
        `UPDATE loyalty_transactions
         SET expired = TRUE, expired_at = NOW()
         WHERE id = ANY($1)`,
        [data.txnIds]
      );

      // Deduct expired points from balance
      await client.query(
        `UPDATE loyalty_balances
         SET points_balance = GREATEST(0, points_balance - $1),
             updated_at = NOW()
         WHERE id = $2`,
        [data.pointsToExpire, balanceId]
      );

      // Create expiry transaction record
      await client.query(
        `INSERT INTO loyalty_transactions
         (balance_id, event_type, amount, description, created_at)
         VALUES ($1, 'expiry', $2, 'Points expired after ${expiryDays} days', NOW())`,
        [balanceId, -data.pointsToExpire]
      );

      // Audit log
      await createAuditLog({
        entityType: 'balance',
        entityId: balanceId,
        action: 'adjust',
        actorId: 'system',
        actorRole: 'expiry_worker',
        changes: {
          pointsExpired: data.pointsToExpire,
          reason: `Points expired after ${expiryDays} days`,
          txnCount: data.txnIds.length
        }
      });

      totalPointsExpired += data.pointsToExpire;

      console.log(`[EXPIRY_WORKER] Expired ${data.pointsToExpire} points from user ${data.userId}`);
    }

    await client.query('COMMIT');

    return {
      usersAffected: affectedUsers.size,
      pointsExpired: totalPointsExpired
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Manual expiry trigger (for testing or admin)
 */
export async function manualExpiry(programId?: string): Promise<{
  usersAffected: number;
  pointsExpired: number;
}> {
  if (programId) {
    const program = await pool.query(
      'SELECT points_expiry_days FROM loyalty_programs WHERE id = $1',
      [programId]
    );

    if (program.rows.length === 0) {
      throw new Error('Program not found');
    }

    if (!program.rows[0].points_expiry_days) {
      throw new Error('Program does not have points expiry configured');
    }

    return await expireProgramPoints(programId, program.rows[0].points_expiry_days);
  } else {
    return await expireOldPoints();
  }
}
