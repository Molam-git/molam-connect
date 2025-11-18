/**
 * Brique 84 — Payouts Engine
 * Worker Executor for Processing Payouts
 *
 * Features:
 * ✅ Poll for pending/scheduled payouts
 * ✅ Process payouts via bank connectors
 * ✅ Handle retries with exponential backoff
 * ✅ SLA monitoring and alerting
 * ✅ Graceful shutdown
 * ✅ Concurrent processing with priority queues
 */

import { Pool } from 'pg';
import { PayoutService, Payout } from '../services/payoutService';
import { BankConnectorFactory } from '../connectors/bankConnectorFactory';
import Redis from 'ioredis';

// =====================================================================
// TYPES
// =====================================================================

export interface WorkerConfig {
  pollIntervalMs: number;
  batchSize: number;
  concurrency: number;
  enablePriorityProcessing: boolean;
  enableSLAMonitoring: boolean;
}

export interface ProcessingResult {
  payoutId: string;
  success: boolean;
  bankReference?: string;
  error?: string;
  errorCode?: string;
}

// =====================================================================
// PAYOUT WORKER
// =====================================================================

export class PayoutWorker {
  private isRunning: boolean = false;
  private processingCount: number = 0;
  private readonly maxConcurrency: number;

  constructor(
    private pool: Pool,
    private redis: Redis,
    private payoutService: PayoutService,
    private connectorFactory: BankConnectorFactory,
    private config: WorkerConfig
  ) {
    this.maxConcurrency = config.concurrency || 5;
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('Worker is already running');
      return;
    }

    this.isRunning = true;
    console.log('[PayoutWorker] Starting worker...');
    console.log(`[PayoutWorker] Config: ${JSON.stringify(this.config)}`);

    // Start main processing loop
    this.processingLoop();

    // Start retry loop
    this.retryLoop();

    // Start SLA monitoring (if enabled)
    if (this.config.enableSLAMonitoring) {
      this.slaMonitoringLoop();
    }

    // Handle graceful shutdown
    process.on('SIGTERM', () => this.stop());
    process.on('SIGINT', () => this.stop());
  }

  /**
   * Stop the worker gracefully
   */
  async stop(): Promise<void> {
    console.log('[PayoutWorker] Stopping worker...');
    this.isRunning = false;

    // Wait for in-flight processing to complete
    const maxWaitMs = 30000; // 30 seconds
    const startTime = Date.now();

    while (this.processingCount > 0 && Date.now() - startTime < maxWaitMs) {
      console.log(`[PayoutWorker] Waiting for ${this.processingCount} in-flight payouts...`);
      await this.sleep(1000);
    }

    console.log('[PayoutWorker] Worker stopped');
  }

  /**
   * Main processing loop
   */
  private async processingLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // Check if we can process more
        if (this.processingCount >= this.maxConcurrency) {
          await this.sleep(100);
          continue;
        }

        // Fetch batch of pending payouts
        const payouts = await this.fetchPendingPayouts(this.config.batchSize);

        if (payouts.length === 0) {
          // No payouts to process, wait before next poll
          await this.sleep(this.config.pollIntervalMs);
          continue;
        }

        console.log(`[PayoutWorker] Found ${payouts.length} pending payouts`);

        // Process payouts concurrently (up to maxConcurrency)
        const promises = payouts.map(payout => this.processPayout(payout));
        await Promise.all(promises);

      } catch (error) {
        console.error('[PayoutWorker] Error in processing loop:', error);
        await this.sleep(5000); // Wait 5s on error
      }
    }
  }

  /**
   * Retry loop for failed payouts
   */
  private async retryLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.sleep(60000); // Check every minute

        // Fetch payouts ready for retry
        const payouts = await this.fetchRetryPayouts(this.config.batchSize);

        if (payouts.length > 0) {
          console.log(`[PayoutWorker] Found ${payouts.length} payouts ready for retry`);

          const promises = payouts.map(payout => this.processPayout(payout));
          await Promise.all(promises);
        }

      } catch (error) {
        console.error('[PayoutWorker] Error in retry loop:', error);
      }
    }
  }

  /**
   * SLA monitoring loop
   */
  private async slaMonitoringLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.sleep(300000); // Check every 5 minutes

        // Check for SLA violations
        const violations = await this.checkSLAViolations();

        for (const violation of violations) {
          await this.handleSLAViolation(violation);
        }

      } catch (error) {
        console.error('[PayoutWorker] Error in SLA monitoring loop:', error);
      }
    }
  }

  /**
   * Fetch pending payouts from database
   */
  private async fetchPendingPayouts(limit: number): Promise<Payout[]> {
    const query = this.config.enablePriorityProcessing
      ? // Priority-based query
        `SELECT * FROM v_payouts_ready_for_processing
         ORDER BY priority DESC, created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`
      : // FIFO query
        `SELECT * FROM v_payouts_ready_for_processing
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`;

    const result = await this.pool.query<Payout>(query, [limit]);
    return result.rows;
  }

  /**
   * Fetch payouts ready for retry
   */
  private async fetchRetryPayouts(limit: number): Promise<Payout[]> {
    const result = await this.pool.query<Payout>(
      `SELECT * FROM v_payouts_retry_queue
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit]
    );
    return result.rows;
  }

  /**
   * Process a single payout
   */
  private async processPayout(payout: Payout): Promise<void> {
    this.processingCount++;

    try {
      console.log(`[PayoutWorker] Processing payout ${payout.id} (${payout.priority})`);

      // 1. Update status to processing
      await this.payoutService.updateStatus(payout.id, 'processing');

      // 2. Get bank connector
      const connector = this.connectorFactory.getConnector(
        payout.bank_connector_id || 'default',
        payout.rail || 'ach'
      );

      if (!connector) {
        throw new Error(`No connector found for ${payout.bank_connector_id} / ${payout.rail}`);
      }

      // 3. Submit payout to bank
      const result = await connector.submitPayout({
        payoutId: payout.id,
        amount: payout.amount,
        currency: payout.currency,
        beneficiaryAccountId: payout.beneficiary_account_id || '',
        beneficiaryId: payout.beneficiary_id,
        description: payout.description || '',
        metadata: payout.metadata
      });

      // 4. Update status based on result
      if (result.success) {
        await this.payoutService.updateStatus(payout.id, 'sent', {
          bankReference: result.bankReference
        });

        console.log(`[PayoutWorker] ✅ Payout ${payout.id} sent successfully (ref: ${result.bankReference})`);

        // Check if instant settlement
        if (result.instantSettlement) {
          await this.payoutService.updateStatus(payout.id, 'settled');
        }
      } else {
        // Failed - schedule retry
        await this.payoutService.updateStatus(payout.id, 'failed', {
          errorMessage: result.error,
          errorCode: result.errorCode
        });

        await this.payoutService.scheduleRetry(payout.id);

        console.error(`[PayoutWorker] ❌ Payout ${payout.id} failed: ${result.error}`);
      }

    } catch (error: any) {
      console.error(`[PayoutWorker] ❌ Error processing payout ${payout.id}:`, error);

      // Update payout with error
      await this.payoutService.updateStatus(payout.id, 'failed', {
        errorMessage: error.message,
        errorCode: 'PROCESSING_ERROR'
      });

      // Schedule retry
      await this.payoutService.scheduleRetry(payout.id);

    } finally {
      this.processingCount--;
    }
  }

  /**
   * Check for SLA violations
   */
  private async checkSLAViolations(): Promise<Payout[]> {
    const result = await this.pool.query<Payout>(
      `SELECT p.*
       FROM payouts p
       WHERE p.status NOT IN ('settled', 'reversed', 'cancelled', 'dlq')
         AND p.sla_target_settlement_date < CURRENT_DATE
         AND p.sla_violated = false`
    );

    return result.rows;
  }

  /**
   * Handle SLA violation
   */
  private async handleSLAViolation(payout: Payout): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Mark payout as SLA violated
      await client.query(
        `UPDATE payouts
         SET sla_violated = true,
             sla_violation_reason = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [`Target date ${payout.sla_target_settlement_date} missed`, payout.id]
      );

      // Create alert
      await client.query(
        `INSERT INTO payout_alerts (
          payout_id, alert_type, severity, message, details
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          payout.id,
          'sla_violation',
          'high',
          `SLA violated for payout ${payout.id}`,
          {
            target_date: payout.sla_target_settlement_date,
            current_date: new Date().toISOString().split('T')[0],
            status: payout.status
          }
        ]
      );

      await client.query('COMMIT');

      console.warn(`[PayoutWorker] ⚠️ SLA violation for payout ${payout.id}`);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`[PayoutWorker] Error handling SLA violation:`, error);
    } finally {
      client.release();
    }
  }

  /**
   * Helper: Sleep for ms
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get worker statistics
   */
  getStats(): {
    isRunning: boolean;
    processingCount: number;
    maxConcurrency: number;
  } {
    return {
      isRunning: this.isRunning,
      processingCount: this.processingCount,
      maxConcurrency: this.maxConcurrency
    };
  }
}

// =====================================================================
// BATCH PROCESSOR (For Scheduled Batches)
// =====================================================================

export class BatchProcessor {
  constructor(
    private pool: Pool,
    private payoutService: PayoutService,
    private connectorFactory: BankConnectorFactory
  ) {}

  /**
   * Process a scheduled batch
   */
  async processBatch(batchId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Get batch
      const batchResult = await client.query(
        'SELECT * FROM payout_batches WHERE id = $1 FOR UPDATE',
        [batchId]
      );

      const batch = batchResult.rows[0];

      if (!batch) {
        throw new Error(`Batch not found: ${batchId}`);
      }

      if (batch.status !== 'locked') {
        throw new Error(`Batch ${batchId} is not locked (status: ${batch.status})`);
      }

      // 2. Update batch status to processing
      await client.query(
        `UPDATE payout_batches
         SET status = 'processing', started_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [batchId]
      );

      await client.query('COMMIT');

      console.log(`[BatchProcessor] Processing batch ${batchId} (${batch.total_payouts} payouts)`);

      // 3. Get all payouts in batch
      const payoutsResult = await this.pool.query<Payout>(
        `SELECT p.*
         FROM payouts p
         INNER JOIN payout_batch_items pbi ON p.id = pbi.payout_id
         WHERE pbi.batch_id = $1
         ORDER BY pbi.sequence_number`,
        [batchId]
      );

      const payouts = payoutsResult.rows;

      // 4. Process each payout
      let successCount = 0;
      let failureCount = 0;

      for (const payout of payouts) {
        try {
          // Update batch item status
          await this.pool.query(
            `UPDATE payout_batch_items
             SET batch_item_status = 'processing', processed_at = NOW()
             WHERE batch_id = $1 AND payout_id = $2`,
            [batchId, payout.id]
          );

          // Process payout
          await this.payoutService.updateStatus(payout.id, 'processing');

          const connector = this.connectorFactory.getConnector(
            payout.bank_connector_id || 'default',
            payout.rail || 'ach'
          );

          const result = await connector.submitPayout({
            payoutId: payout.id,
            amount: payout.amount,
            currency: payout.currency,
            beneficiaryAccountId: payout.beneficiary_account_id || '',
            beneficiaryId: payout.beneficiary_id,
            description: payout.description || '',
            metadata: payout.metadata
          });

          if (result.success) {
            await this.payoutService.updateStatus(payout.id, 'sent', {
              bankReference: result.bankReference
            });

            await this.pool.query(
              `UPDATE payout_batch_items
               SET batch_item_status = 'completed', completed_at = NOW()
               WHERE batch_id = $1 AND payout_id = $2`,
              [batchId, payout.id]
            );

            successCount++;
          } else {
            throw new Error(result.error);
          }

        } catch (error: any) {
          console.error(`[BatchProcessor] Error processing payout ${payout.id}:`, error);

          await this.payoutService.updateStatus(payout.id, 'failed', {
            errorMessage: error.message,
            errorCode: 'BATCH_PROCESSING_ERROR'
          });

          await this.pool.query(
            `UPDATE payout_batch_items
             SET batch_item_status = 'failed',
                 failed_at = NOW(),
                 error_message = $1
             WHERE batch_id = $2 AND payout_id = $3`,
            [error.message, batchId, payout.id]
          );

          failureCount++;
        }
      }

      // 5. Update batch final status
      await this.pool.query(
        `UPDATE payout_batches
         SET status = 'completed',
             completed_at = NOW(),
             successful_payouts = $1,
             failed_payouts = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [successCount, failureCount, batchId]
      );

      console.log(`[BatchProcessor] ✅ Batch ${batchId} completed: ${successCount} succeeded, ${failureCount} failed`);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`[BatchProcessor] ❌ Error processing batch ${batchId}:`, error);

      // Mark batch as failed
      await this.pool.query(
        `UPDATE payout_batches
         SET status = 'failed', failed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [batchId]
      );

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check for scheduled batches ready to process
   */
  async processScheduledBatches(): Promise<void> {
    const result = await this.pool.query(
      `SELECT id FROM payout_batches
       WHERE status = 'locked'
         AND scheduled_at <= NOW()
       ORDER BY scheduled_at ASC`
    );

    for (const row of result.rows) {
      try {
        await this.processBatch(row.id);
      } catch (error) {
        console.error(`[BatchProcessor] Error processing batch ${row.id}:`, error);
      }
    }
  }
}

// =====================================================================
// MAIN WORKER ENTRY POINT
// =====================================================================

export async function startPayoutWorker(
  pool: Pool,
  redis: Redis,
  config: Partial<WorkerConfig> = {}
): Promise<PayoutWorker> {
  const defaultConfig: WorkerConfig = {
    pollIntervalMs: 5000, // 5 seconds
    batchSize: 10,
    concurrency: 5,
    enablePriorityProcessing: true,
    enableSLAMonitoring: true
  };

  const finalConfig = { ...defaultConfig, ...config };

  const payoutService = new PayoutService(pool, redis);
  const connectorFactory = new BankConnectorFactory();

  const worker = new PayoutWorker(pool, redis, payoutService, connectorFactory, finalConfig);

  await worker.start();

  return worker;
}
