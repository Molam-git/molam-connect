// Payout Sender Worker
// Sends instant payouts and batches to bank connectors

import { pool } from '../utils/db';
import { getBankConnector } from '../connectors/connector-registry';
import { v4 as uuidv4 } from 'uuid';

const POLL_INTERVAL_MS = parseInt(process.env.SENDER_POLL_INTERVAL_MS || '10000'); // 10s
const INSTANT_BATCH_SIZE = parseInt(process.env.INSTANT_BATCH_SIZE || '50');

/**
 * Main sender loop
 */
export async function runSenderWorker(): Promise<void> {
  console.log('🚀 Starting Payout Sender Worker');
  console.log(`   Poll interval: ${POLL_INTERVAL_MS}ms`);

  while (true) {
    try {
      // Process instant payouts
      await processInstantPayouts();

      // Process batches
      await processBatches();
    } catch (error: any) {
      console.error('Sender worker error:', error);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Process instant payouts
 */
async function processInstantPayouts(): Promise<void> {
  const { rows: payouts } = await pool.query(
    `SELECT * FROM payouts
     WHERE status = 'queued'
       AND priority = 'instant'
       AND bank_profile_id IS NOT NULL
     ORDER BY created_at ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [INSTANT_BATCH_SIZE]
  );

  for (const payout of payouts) {
    await sendInstantPayout(payout);
  }
}

/**
 * Send single instant payout
 */
async function sendInstantPayout(payout: any): Promise<void> {
  try {
    // Update status to processing
    await pool.query(
      `UPDATE payouts
       SET status = 'processing', attempt_count = attempt_count + 1,
           last_attempt_at = now(), updated_at = now()
       WHERE id = $1`,
      [payout.id]
    );

    // Get connector
    const connector = getBankConnector(payout.bank_profile_id);

    // Send payment
    const start = Date.now();
    const response = await connector.sendPayment({
      payout_id: payout.id,
      external_id: payout.external_id,
      amount: parseFloat(payout.amount),
      currency: payout.currency,
      beneficiary: payout.beneficiary,
      reference: payout.external_id,
      urgency: 'instant',
    });

    const latency_ms = Date.now() - start;

    // Log attempt
    await pool.query(
      `INSERT INTO payout_attempts (
        payout_id, attempt_number, attempted_at, success,
        provider_ref, latency_ms, connector_name,
        http_code, response_payload
      ) VALUES ($1, $2, now(), $3, $4, $5, $6, $7, $8)`,
      [
        payout.id,
        payout.attempt_count + 1,
        response.success,
        response.provider_ref || null,
        latency_ms,
        connector.getName(),
        response.success ? 200 : 500,
        JSON.stringify(response),
      ]
    );

    if (response.success) {
      // Update payout to sent
      await pool.query(
        `UPDATE payouts
         SET status = 'sent', provider_ref = $2,
             net_to_beneficiary = $3, updated_at = now()
         WHERE id = $1`,
        [payout.id, response.provider_ref, parseFloat(payout.amount)]
      );

      console.log(`✅ Sent instant payout ${payout.id} (${response.provider_ref})`);
    } else {
      // Handle failure - will be picked up by retry dispatcher
      await pool.query(
        `UPDATE payouts
         SET status = 'failed', next_retry_at = $2, updated_at = now()
         WHERE id = $1`,
        [payout.id, calculateNextRetry(payout.attempt_count + 1)]
      );

      console.error(`❌ Failed to send payout ${payout.id}: ${response.error_message}`);
    }
  } catch (error: any) {
    console.error(`Error sending payout ${payout.id}:`, error);

    await pool.query(
      `UPDATE payouts
       SET status = 'failed', next_retry_at = $2, updated_at = now()
       WHERE id = $1`,
      [payout.id, calculateNextRetry(payout.attempt_count + 1)]
    );
  }
}

/**
 * Process batches ready for submission
 */
async function processBatches(): Promise<void> {
  const { rows: batches } = await pool.query(
    `SELECT * FROM payout_batches
     WHERE status = 'open'
       AND item_count > 0
     ORDER BY created_at ASC
     LIMIT 10
     FOR UPDATE SKIP LOCKED`
  );

  for (const batch of batches) {
    await sendBatch(batch);
  }
}

/**
 * Send batch to bank connector
 */
async function sendBatch(batch: any): Promise<void> {
  try {
    // Get batch payouts
    const { rows: payouts } = await pool.query(
      `SELECT * FROM payouts WHERE batch_id = $1 AND status = 'queued'`,
      [batch.id]
    );

    if (payouts.length === 0) {
      console.log(`No payouts in batch ${batch.id}, marking as cancelled`);
      await pool.query(
        `UPDATE payout_batches SET status = 'cancelled' WHERE id = $1`,
        [batch.id]
      );
      return;
    }

    // Get connector
    const connector = getBankConnector(batch.bank_profile_id);

    // Prepare batch request
    const batchRequest = {
      batch_id: batch.id,
      batch_ref: batch.batch_ref,
      currency: batch.currency,
      total_amount: parseFloat(batch.total_amount),
      payouts: payouts.map((p: any) => ({
        payout_id: p.id,
        external_id: p.external_id,
        amount: parseFloat(p.amount),
        currency: p.currency,
        beneficiary: p.beneficiary,
        reference: p.external_id,
      })),
    };

    // Update batch status
    await pool.query(
      `UPDATE payout_batches
       SET status = 'prepared', prepared_at = now(), updated_at = now()
       WHERE id = $1`,
      [batch.id]
    );

    // Send batch
    const response = await connector.sendBatch(batchRequest);

    if (response.success) {
      // Update batch
      await pool.query(
        `UPDATE payout_batches
         SET status = 'submitted', provider_batch_ref = $2,
             submitted_at = now(), successful_count = $3,
             rejected_count = $4, updated_at = now()
         WHERE id = $1`,
        [
          batch.id,
          response.provider_batch_ref,
          response.accepted_count,
          response.rejected_count,
        ]
      );

      // Update payouts to processing
      await pool.query(
        `UPDATE payouts
         SET status = 'processing', updated_at = now()
         WHERE batch_id = $1 AND status = 'queued'`,
        [batch.id]
      );

      console.log(
        `✅ Sent batch ${batch.batch_ref} (${response.provider_batch_ref}): ${response.accepted_count} accepted, ${response.rejected_count} rejected`
      );
    } else {
      await pool.query(
        `UPDATE payout_batches SET status = 'failed', updated_at = now() WHERE id = $1`,
        [batch.id]
      );

      console.error(`❌ Failed to send batch ${batch.batch_ref}`);
    }
  } catch (error: any) {
    console.error(`Error sending batch ${batch.id}:`, error);

    await pool.query(
      `UPDATE payout_batches SET status = 'failed', updated_at = now() WHERE id = $1`,
      [batch.id]
    );
  }
}

/**
 * Calculate next retry time with exponential backoff
 */
function calculateNextRetry(attempt_count: number): Date {
  const backoffMinutes = [1, 5, 15, 60, 360, 1440]; // 1m, 5m, 15m, 1h, 6h, 24h
  const delayMinutes =
    backoffMinutes[Math.min(attempt_count - 1, backoffMinutes.length - 1)];

  const nextRetry = new Date();
  nextRetry.setMinutes(nextRetry.getMinutes() + delayMinutes);

  return nextRetry;
}

/**
 * Helper: sleep function
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run worker if executed directly
if (require.main === module) {
  runSenderWorker().catch((err) => {
    console.error('Fatal sender worker error:', err);
    process.exit(1);
  });
}
