// ============================================================================
// Payout Dispatcher Worker - Process and send payouts with retry logic
// ============================================================================

import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Exponential backoff schedule (in seconds)
 * Attempt 0: immediate
 * Attempt 1: 60s (1 min)
 * Attempt 2: 300s (5 min)
 * Attempt 3: 900s (15 min)
 * Attempt 4: 3600s (1 hour)
 * Attempt 5: 21600s (6 hours)
 * Attempt 6+: 86400s (24 hours)
 */
export const BACKOFF_SCHEDULE = [60, 300, 900, 3600, 21600, 86400];
export const MAX_ATTEMPTS = 7;

/**
 * Bank connector factory stub
 */
const getConnectorForBank = (bankProfileId: string) => {
  // TODO: Implement connector factory based on bank_profile_id
  return {
    async sendPayment(payout: any) {
      // Simulate bank API call
      if (Math.random() > 0.9) {
        throw new Error("bank_api_error");
      }
      return {
        status: "sent",
        provider_ref: `BANK-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        http_code: 200,
        details: { simulated: true },
      };
    },
  };
};

/**
 * Webhook publisher stub
 */
const publishEvent = async (
  targetType: string,
  targetId: string,
  eventType: string,
  payload: any
) => {
  console.log(`[WEBHOOK] ${eventType}`, payload);
};

/**
 * Get next retry delay based on attempt count
 */
function getRetryDelay(attemptCount: number): number {
  if (attemptCount >= BACKOFF_SCHEDULE.length) {
    return BACKOFF_SCHEDULE[BACKOFF_SCHEDULE.length - 1];
  }
  return BACKOFF_SCHEDULE[attemptCount];
}

/**
 * Process a single payout
 */
async function processPayout(payout: any, client: any) {
  const connector = getConnectorForBank(payout.bank_profile_id);

  try {
    // Attempt to send payment
    const response = await connector.sendPayment(payout);

    // Record successful attempt
    await client.query(
      `INSERT INTO payout_attempts(
        payout_id, attempt_number, provider_ref, status, response_code, response_body
      ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        payout.id,
        payout.attempt_count + 1,
        response.provider_ref,
        "sent",
        response.http_code || 200,
        JSON.stringify(response),
      ]
    );

    // Update payout status to 'sent'
    await client.query(
      `UPDATE payouts
       SET status = 'sent',
           provider_ref = $2,
           attempt_count = attempt_count + 1,
           updated_at = now()
       WHERE id = $1`,
      [payout.id, response.provider_ref]
    );

    // Publish success event
    await publishEvent("treasury", payout.id, "payout.sent", {
      payout_id: payout.id,
      provider_ref: response.provider_ref,
      attempt_number: payout.attempt_count + 1,
    });

    return { success: true, provider_ref: response.provider_ref };
  } catch (error: any) {
    const attemptNumber = payout.attempt_count + 1;

    // Record failed attempt
    await client.query(
      `INSERT INTO payout_attempts(
        payout_id, attempt_number, status, response_body, error_message
      ) VALUES ($1,$2,$3,$4,$5)`,
      [
        payout.id,
        attemptNumber,
        attemptNumber >= MAX_ATTEMPTS ? "failed" : "retry",
        JSON.stringify({ error: error.message }),
        error.message || String(error),
      ]
    );

    // Check if max attempts reached
    if (attemptNumber >= MAX_ATTEMPTS) {
      // Mark as permanently failed
      await client.query(
        `UPDATE payouts
         SET status = 'failed',
             attempt_count = attempt_count + 1,
             updated_at = now()
         WHERE id = $1`,
        [payout.id]
      );

      // Publish failure event (DLQ trigger)
      await publishEvent("ops", "treasury", "payout.failed", {
        payout_id: payout.id,
        reason: error.message,
        attempt_count: attemptNumber,
      });

      return { success: false, failed: true };
    } else {
      // Schedule retry with exponential backoff
      const retryDelay = getRetryDelay(attemptNumber);

      await client.query(
        `UPDATE payouts
         SET status = 'pending',
             attempt_count = attempt_count + 1,
             next_attempt_at = now() + make_interval(secs => $2),
             updated_at = now()
         WHERE id = $1`,
        [payout.id, retryDelay]
      );

      return { success: false, retry: true, retry_in: retryDelay };
    }
  }
}

/**
 * Main dispatcher function - process pending payouts
 */
export async function dispatchOnce(batchSize: number = 20) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Select pending payouts with pessimistic locking
    const { rows: payouts } = await client.query(
      `SELECT * FROM payouts
       WHERE status IN ('pending','reserved')
         AND scheduled_for <= now()
         AND (next_attempt_at IS NULL OR next_attempt_at <= now())
       ORDER BY priority ASC, scheduled_for ASC, requested_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $1`,
      [batchSize]
    );

    if (payouts.length === 0) {
      await client.query("COMMIT");
      return { processed: 0, sent: 0, failed: 0, retried: 0 };
    }

    console.log(`[DISPATCHER] Processing ${payouts.length} payouts...`);

    let stats = { processed: 0, sent: 0, failed: 0, retried: 0 };

    for (const payout of payouts) {
      // Mark as processing
      await client.query(
        `UPDATE payouts SET status = 'processing', updated_at = now() WHERE id = $1`,
        [payout.id]
      );

      // Process the payout
      const result = await processPayout(payout, client);

      stats.processed++;
      if (result.success) {
        stats.sent++;
      } else if (result.failed) {
        stats.failed++;
      } else if (result.retry) {
        stats.retried++;
      }
    }

    await client.query("COMMIT");

    console.log(`[DISPATCHER] Stats:`, stats);

    return stats;
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[DISPATCHER] Error:", error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run dispatcher continuously
 */
export async function runDispatcher(intervalMs: number = 5000) {
  console.log(`[DISPATCHER] Starting with ${intervalMs}ms interval...`);

  while (true) {
    try {
      await dispatchOnce();
    } catch (error) {
      console.error("[DISPATCHER] Dispatch cycle failed:", error);
    }

    // Wait before next cycle
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Stuck payout monitor - resets payouts stuck in 'processing' for >10min
 */
export async function monitorStuckPayouts() {
  try {
    const { rows } = await pool.query(
      `UPDATE payouts
       SET status = 'pending',
           next_attempt_at = now(),
           updated_at = now()
       WHERE status = 'processing'
         AND updated_at < now() - interval '10 minutes'
       RETURNING id`
    );

    if (rows.length > 0) {
      console.log(`[MONITOR] Reset ${rows.length} stuck payouts:`, rows.map(r => r.id));
    }

    return rows.length;
  } catch (error) {
    console.error("[MONITOR] Failed to reset stuck payouts:", error);
    return 0;
  }
}

// If run directly, start dispatcher
if (require.main === module) {
  runDispatcher();
}
