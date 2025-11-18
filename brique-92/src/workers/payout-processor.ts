// Payout Processor Worker
// Processes queued payouts with retry logic, connector integration, and ledger finalization

import { pool } from '../utils/db';
import { finalizeLedgerHold, releaseLedgerHold } from '../ledger/client';
import publishEvent from '../utils/events';

const POLL_INTERVAL_MS = parseInt(process.env.PAYOUT_POLL_MS || '5000');
const BATCH_SIZE = parseInt(process.env.PAYOUT_BATCH_SIZE || '50');
const MAX_ATTEMPTS = parseInt(process.env.PAYOUT_MAX_ATTEMPTS || '5');
const WORKER_ID = `worker-${process.pid}-${Date.now()}`;

// Backoff schedule in seconds
const BACKOFF_SECONDS = [60, 300, 900, 3600, 21600]; // 1m, 5m, 15m, 1h, 6h

interface QueueItem {
  id: string;
  payout_id: string;
  next_attempt_at: Date;
  attempts: number;
  status: string;
  priority: number;
}

interface Payout {
  id: string;
  external_id: string;
  origin_module: string;
  origin_entity_id: string;
  currency: string;
  amount: number;
  beneficiary: any;
  bank_profile_id: string | null;
  treasury_account_id: string | null;
  routing: any;
  molam_fee: number;
  bank_fee: number;
  total_deducted: number;
  reserved_ledger_ref: string;
  status: string;
  priority: number;
  reference_code: string;
  attempts: number;
  provider_ref: string | null;
}

/**
 * Payout Processor Worker
 */
export class PayoutProcessor {
  private isRunning: boolean = false;

  constructor() {}

  /**
   * Start the worker
   */
  async start() {
    this.isRunning = true;
    console.log(`[PayoutProcessor] Starting worker ${WORKER_ID}...`);
    console.log(`[PayoutProcessor] Poll interval: ${POLL_INTERVAL_MS}ms, Batch size: ${BATCH_SIZE}`);

    while (this.isRunning) {
      try {
        await this.processBatch();
      } catch (error) {
        console.error('[PayoutProcessor] Error in processing cycle:', error);
      }

      await this.sleep(POLL_INTERVAL_MS);
    }

    console.log('[PayoutProcessor] Stopped');
  }

  /**
   * Stop the worker
   */
  stop() {
    this.isRunning = false;
    console.log('[PayoutProcessor] Stopping...');
  }

  /**
   * Process a batch of queued payouts
   */
  private async processBatch(): Promise<void> {
    const client = await pool.connect();

    try {
      // Lock and fetch ready queue items
      const { rows: queueItems } = await client.query<QueueItem>(
        `UPDATE payout_queue
         SET status = 'processing',
             locked_until = now() + interval '30 seconds',
             locked_by = $1
         WHERE id IN (
           SELECT id FROM payout_queue
           WHERE status = 'ready'
             AND next_attempt_at <= now()
             AND (locked_until IS NULL OR locked_until < now())
           ORDER BY priority ASC, next_attempt_at ASC
           LIMIT $2
           FOR UPDATE SKIP LOCKED
         )
         RETURNING *`,
        [WORKER_ID, BATCH_SIZE]
      );

      if (queueItems.length === 0) {
        return; // No items to process
      }

      console.log(`[PayoutProcessor] Processing ${queueItems.length} payouts`);

      // Process each payout
      for (const queueItem of queueItems) {
        try {
          await this.processPayoutItem(queueItem);
        } catch (error) {
          console.error(`[PayoutProcessor] Error processing payout ${queueItem.payout_id}:`, error);
          // Continue with next item
        }
      }

    } finally {
      client.release();
    }
  }

  /**
   * Process a single payout
   */
  private async processPayoutItem(queueItem: QueueItem): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Fetch payout
      const { rows: payouts } = await client.query<Payout>(
        'SELECT * FROM payouts WHERE id = $1 FOR UPDATE',
        [queueItem.payout_id]
      );

      if (payouts.length === 0) {
        console.warn(`[PayoutProcessor] Payout ${queueItem.payout_id} not found, removing from queue`);
        await client.query('DELETE FROM payout_queue WHERE id = $1', [queueItem.id]);
        await client.query('COMMIT');
        return;
      }

      const payout = payouts[0];

      // Skip if already sent/settled/cancelled
      if (['sent', 'settled', 'cancelled', 'failed'].includes(payout.status)) {
        console.log(`[PayoutProcessor] Payout ${payout.reference_code} already ${payout.status}, removing from queue`);
        await client.query('DELETE FROM payout_queue WHERE id = $1', [queueItem.id]);
        await client.query('COMMIT');
        return;
      }

      // Get routing (mock for now - would call SIRA in production)
      const routing = await this.getRouting(payout);

      // Update payout with routing
      await client.query(
        `UPDATE payouts
         SET routing = $2,
             status = 'processing',
             updated_at = now()
         WHERE id = $1`,
        [payout.id, JSON.stringify(routing)]
      );

      await client.query('COMMIT');

      // Send payout via connector (outside transaction)
      const sendResult = await this.sendPayout(payout, routing);

      // Record attempt
      await this.recordAttempt(payout, routing.connector, sendResult);

      // Handle result
      if (sendResult.status === 'sent' || sendResult.status === 'settled') {
        await this.handleSuccess(payout, sendResult, queueItem);
      } else {
        await this.handleFailure(payout, sendResult, queueItem);
      }

    } catch (error: any) {
      await client.query('ROLLBACK');

      console.error(`[PayoutProcessor] Error processing ${queueItem.payout_id}:`, error);

      // Requeue with delay
      await pool.query(
        `UPDATE payout_queue
         SET status = 'delayed',
             attempts = attempts + 1,
             next_attempt_at = now() + interval '5 minutes',
             locked_until = NULL,
             locked_by = NULL
         WHERE id = $1`,
        [queueItem.id]
      );

    } finally {
      client.release();
    }
  }

  /**
   * Get routing for payout (mock - would call SIRA in production)
   */
  private async getRouting(payout: Payout): Promise<any> {
    // TODO: Call SIRA routing service
    // For now, return sandbox connector

    return {
      connector: 'sandbox',
      bank_profile_id: payout.bank_profile_id || 'default',
      treasury_account_id: payout.treasury_account_id || 'default',
      priority: payout.priority,
      estimated_cost: payout.bank_fee,
      estimated_time_seconds: 30,
      selected_at: new Date().toISOString()
    };
  }

  /**
   * Send payout via connector
   */
  private async sendPayout(payout: Payout, routing: any): Promise<any> {
    console.log(`[PayoutProcessor] Sending payout ${payout.reference_code} via ${routing.connector}`);

    const startTime = Date.now();

    try {
      // TODO: Load actual connector from registry
      // For now, simulate sending
      const mockResult = await this.simulateSend(payout);

      const latency_ms = Date.now() - startTime;

      return {
        ...mockResult,
        latency_ms
      };

    } catch (error: any) {
      return {
        status: 'failed',
        error: error.message,
        latency_ms: Date.now() - startTime
      };
    }
  }

  /**
   * Simulate sending (mock connector)
   */
  private async simulateSend(payout: Payout): Promise<any> {
    // Simulate network latency
    await this.sleep(100 + Math.random() * 400);

    // 95% success rate
    const success = Math.random() < 0.95;

    if (success) {
      const provider_ref = `MOCK-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;

      // 80% immediate settlement, 20% delayed
      const immediate_settlement = Math.random() < 0.8;

      return {
        status: immediate_settlement ? 'settled' : 'sent',
        provider_ref,
        bank_fee: payout.bank_fee,
        details: {
          settlement_method: immediate_settlement ? 'instant' : 'standard',
          processed_at: new Date().toISOString()
        }
      };
    } else {
      return {
        status: 'failed',
        error: 'Temporary network error',
        http_code: 503
      };
    }
  }

  /**
   * Record attempt in database
   */
  private async recordAttempt(payout: Payout, connector: string, result: any): Promise<void> {
    await pool.query(
      `INSERT INTO payout_attempts (
        payout_id,
        attempt_number,
        connector,
        provider_ref,
        status,
        http_code,
        response,
        latency_ms,
        error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        payout.id,
        payout.attempts + 1,
        connector,
        result.provider_ref || null,
        result.status,
        result.http_code || null,
        JSON.stringify(result.details || {}),
        result.latency_ms || null,
        result.error || null
      ]
    );
  }

  /**
   * Handle successful send
   */
  private async handleSuccess(payout: Payout, sendResult: any, queueItem: QueueItem): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Update payout status
      await client.query(
        `UPDATE payouts
         SET status = $2,
             provider_ref = $3,
             bank_fee = $4,
             sent_at = now(),
             updated_at = now()
         WHERE id = $1`,
        [payout.id, sendResult.status, sendResult.provider_ref, sendResult.bank_fee || payout.bank_fee]
      );

      // If immediately settled, finalize ledger
      if (sendResult.status === 'settled') {
        const finalizeResult = await finalizeLedgerHold({
          hold_ref: payout.reserved_ledger_ref,
          payout_id: payout.id,
          provider_ref: sendResult.provider_ref,
          bank_fee: sendResult.bank_fee || payout.bank_fee,
          molam_fee: payout.molam_fee
        });

        if (finalizeResult.status === 'finalized') {
          await client.query(
            `UPDATE payouts
             SET ledger_entry_ref = $2,
                 settled_at = now()
             WHERE id = $1`,
            [payout.id, finalizeResult.entry_ref]
          );

          // Publish settled event
          await publishEvent('payouts', payout.origin_entity_id, 'payout.settled', {
            payout_id: payout.id,
            reference_code: payout.reference_code,
            provider_ref: sendResult.provider_ref
          });
        }
      } else {
        // Publish sent event (will be reconciled later)
        await publishEvent('payouts', payout.origin_entity_id, 'payout.sent', {
          payout_id: payout.id,
          reference_code: payout.reference_code,
          provider_ref: sendResult.provider_ref
        });
      }

      // Remove from queue
      await client.query('DELETE FROM payout_queue WHERE id = $1', [queueItem.id]);

      // Audit log
      await client.query(
        `INSERT INTO payout_audit (payout_id, actor_type, actor_id, action, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [payout.id, 'system', WORKER_ID, sendResult.status, JSON.stringify({ provider_ref: sendResult.provider_ref })]
      );

      await client.query('COMMIT');

      console.log(`[PayoutProcessor] ✓ Payout ${payout.reference_code} ${sendResult.status}`);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle failed send
   */
  private async handleFailure(payout: Payout, sendResult: any, queueItem: QueueItem): Promise<void> {
    const attempts = queueItem.attempts + 1;

    if (attempts >= MAX_ATTEMPTS) {
      // Quarantine
      console.log(`[PayoutProcessor] ✗ Payout ${payout.reference_code} failed after ${attempts} attempts, quarantining`);

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // Update payout to failed
        await client.query(
          `UPDATE payouts
           SET status = 'failed',
               last_error = $2,
               attempts = $3,
               updated_at = now()
           WHERE id = $1`,
          [payout.id, sendResult.error || 'max_retries_exceeded', attempts]
        );

        // Release ledger hold
        await releaseLedgerHold({
          hold_ref: payout.reserved_ledger_ref,
          payout_id: payout.id,
          reason: 'max_retries_exceeded',
          metadata: { attempts, last_error: sendResult.error }
        });

        // Quarantine queue item
        await client.query(
          `UPDATE payout_queue
           SET status = 'quarantined',
               attempts = $2,
               locked_until = NULL,
               locked_by = NULL
           WHERE id = $1`,
          [queueItem.id, attempts]
        );

        // Audit log
        await client.query(
          `INSERT INTO payout_audit (payout_id, actor_type, actor_id, action, details)
           VALUES ($1, $2, $3, $4, $5)`,
          [payout.id, 'system', WORKER_ID, 'failed', JSON.stringify({ attempts, error: sendResult.error })]
        );

        await client.query('COMMIT');

        // Publish failed event
        await publishEvent('payouts', payout.origin_entity_id, 'payout.failed', {
          payout_id: payout.id,
          reference_code: payout.reference_code,
          error: sendResult.error,
          attempts
        });

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

    } else {
      // Retry with backoff
      const wait_seconds = BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)];

      console.log(`[PayoutProcessor] ⚠ Payout ${payout.reference_code} failed, retrying in ${wait_seconds}s (attempt ${attempts}/${MAX_ATTEMPTS})`);

      await pool.query(
        `UPDATE payout_queue
         SET status = 'ready',
             attempts = $2,
             next_attempt_at = now() + make_interval(secs => $3),
             locked_until = NULL,
             locked_by = NULL
         WHERE id = $1`,
        [queueItem.id, attempts, wait_seconds]
      );

      await pool.query(
        `UPDATE payouts
         SET attempts = $2,
             last_error = $3,
             last_attempt_at = now(),
             updated_at = now()
         WHERE id = $1`,
        [payout.id, attempts, sendResult.error || 'temporary_failure']
      );
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Main entry point
 */
if (require.main === module) {
  const processor = new PayoutProcessor();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, stopping processor...');
    processor.stop();
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, stopping processor...');
    processor.stop();
  });

  // Start processor
  processor.start().catch(error => {
    console.error('Fatal error in processor:', error);
    process.exit(1);
  });
}

export default PayoutProcessor;
