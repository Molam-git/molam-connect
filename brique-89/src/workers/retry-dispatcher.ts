// Retry Dispatcher & Dead Letter Queue (DLQ)
// Handles retry logic and DLQ for failed payouts

import { pool } from '../utils/db';

const POLL_INTERVAL_MS = parseInt(process.env.RETRY_POLL_INTERVAL_MS || '60000'); // 1 min

/**
 * Main retry dispatcher loop
 */
export async function runRetryDispatcher(): Promise<void> {
  console.log('🔄 Starting Retry Dispatcher');

  while (true) {
    try {
      await processRetries();
      await processDLQ();
    } catch (error: any) {
      console.error('Retry dispatcher error:', error);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Process payouts ready for retry
 */
async function processRetries(): Promise<void> {
  const { rows: payouts } = await pool.query(
    `SELECT * FROM payouts
     WHERE status = 'failed'
       AND next_retry_at IS NOT NULL
       AND next_retry_at <= now()
       AND attempt_count < max_attempts
     FOR UPDATE SKIP LOCKED
     LIMIT 100`
  );

  for (const payout of payouts) {
    await retryPayout(payout);
  }
}

/**
 * Retry a failed payout
 */
async function retryPayout(payout: any): Promise<void> {
  console.log(`🔄 Retrying payout ${payout.id} (attempt ${payout.attempt_count + 1}/${payout.max_attempts})`);

  // Reset status to queued for sender worker to pick up
  await pool.query(
    `UPDATE payouts
     SET status = 'queued', next_retry_at = NULL, updated_at = now()
     WHERE id = $1`,
    [payout.id]
  );
}

/**
 * Process payouts that exceeded max attempts -> DLQ
 */
async function processDLQ(): Promise<void> {
  const { rows: failedPayouts } = await pool.query(
    `SELECT * FROM payouts
     WHERE status = 'failed'
       AND attempt_count >= max_attempts
       AND id NOT IN (SELECT payout_id FROM payout_dlq)
     LIMIT 50`
  );

  for (const payout of failedPayouts) {
    await moveToDLQ(payout);
  }
}

/**
 * Move payout to Dead Letter Queue
 */
async function moveToDLQ(payout: any): Promise<void> {
  try {
    // Get last error from attempts
    const { rows: attemptRows } = await pool.query(
      `SELECT error_message FROM payout_attempts
       WHERE payout_id = $1 AND success = FALSE
       ORDER BY attempted_at DESC
       LIMIT 1`,
      [payout.id]
    );

    const lastError = attemptRows[0]?.error_message || 'Unknown error';

    // Insert into DLQ
    await pool.query(
      `INSERT INTO payout_dlq (
        payout_id, reason, error_summary, last_error,
        attempts_made, status, added_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'pending', now(), now())
      ON CONFLICT (payout_id) DO NOTHING`,
      [
        payout.id,
        'max_retries_exceeded',
        `Failed after ${payout.attempt_count} attempts`,
        lastError,
        payout.attempt_count,
      ]
    );

    console.log(`❌ Moved payout ${payout.id} to DLQ after ${payout.attempt_count} failed attempts`);

    // Notify ops (placeholder - integrate with notification service)
    await notifyOpsDLQ(payout);
  } catch (error: any) {
    console.error(`Error moving payout ${payout.id} to DLQ:`, error);
  }
}

/**
 * Notify Ops team about DLQ entry
 */
async function notifyOpsDLQ(payout: any): Promise<void> {
  // TODO: Integrate with notification service (Slack, email, PagerDuty, etc.)
  console.log(`📢 [NOTIFICATION] Payout ${payout.id} requires manual intervention (DLQ)`);

  // Log to system notifications table
  await pool.query(
    `INSERT INTO system_notifications (channel, severity, title, message, payload, created_at)
     VALUES ('treasury', 'high', 'Payout Failed - DLQ', $1, $2, now())`,
    [
      `Payout ${payout.id} (${payout.external_id}) failed after ${payout.attempt_count} attempts and moved to DLQ`,
      JSON.stringify({
        payout_id: payout.id,
        external_id: payout.external_id,
        amount: payout.amount,
        currency: payout.currency,
        attempts: payout.attempt_count,
      }),
    ]
  );
}

/**
 * Helper: sleep function
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run worker if executed directly
if (require.main === module) {
  // Ensure system_notifications table exists
  pool.query(`
    CREATE TABLE IF NOT EXISTS system_notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      channel TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      payload JSONB DEFAULT '{}'::jsonb,
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `).then(() => {
    console.log('✅ System notifications table ready');
    runRetryDispatcher().catch((err) => {
      console.error('Fatal retry dispatcher error:', err);
      process.exit(1);
    });
  });
}
