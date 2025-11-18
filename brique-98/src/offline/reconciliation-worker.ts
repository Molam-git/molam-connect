/**
 * Brique 98 — Offline Reconciliation Worker
 *
 * Processes offline transaction bundles from the sync queue and creates
 * ledger entries in the main wallet system.
 *
 * Flow:
 * 1. Poll offline_sync_queue for pending bundles
 * 2. Decrypt and validate bundle
 * 3. Check for duplicate/conflicting transactions
 * 4. Create ledger entries via Brique 91 (Wallet Core)
 * 5. Update bundle and transaction statuses
 * 6. Call SIRA for additional fraud checks
 * 7. Handle conflicts and errors
 * 8. Audit log all actions
 *
 * Usage:
 * - Run as cron job: npm run worker:reconciliation
 * - Run continuously: npm run worker:reconciliation:continuous
 */

import { Pool, PoolClient } from 'pg';
import { decryptBundle, BundlePayload, OfflineTransaction } from './security';

// =====================================================================
// Configuration
// =====================================================================

interface WorkerConfig {
  pool: Pool;
  batchSize?: number; // Number of bundles to process per iteration
  pollIntervalMs?: number; // Polling interval in continuous mode
  enableSiraScoring?: boolean;
  enableLedgerCreation?: boolean; // For testing, can disable ledger creation
  maxRetries?: number; // Max retries for failed bundles
}

interface ReconciliationResult {
  success: boolean;
  bundleId: string;
  transactionsProcessed: number;
  transactionsFailed: number;
  errors: string[];
}

// =====================================================================
// Ledger Integration (Brique 91 Wallet Core)
// =====================================================================

/**
 * Create ledger entry for offline transaction
 *
 * In production, this would call Brique 91 (Wallet Core) API
 */
async function createLedgerEntry(
  client: PoolClient,
  tx: OfflineTransaction,
  bundleId: string,
  deviceId: string
): Promise<{ success: boolean; ledgerId?: string; error?: string }> {
  try {
    // TODO: Call Brique 91 (Wallet Core) API to create transaction
    // For now, we'll create a placeholder in wallet_transactions table

    // Check if ledger entry already exists (idempotency)
    const existing = await client.query(
      `SELECT id FROM wallet_transactions
       WHERE metadata->>'offline_bundle_id' = $1
       AND metadata->>'offline_local_id' = $2`,
      [bundleId, tx.local_id]
    );

    if (existing.rows.length > 0) {
      return {
        success: true,
        ledgerId: existing.rows[0].id,
      };
    }

    // Create ledger entry
    const result = await client.query(
      `INSERT INTO wallet_transactions
       (type, amount, currency, sender, receiver, merchant_id, status,
        initiated_at, completed_at, metadata, offline_flag)
       VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, now(), $8, true)
       RETURNING id`,
      [
        tx.type,
        tx.amount,
        tx.currency,
        tx.sender,
        tx.receiver,
        tx.merchant_id || null,
        tx.initiated_at,
        JSON.stringify({
          offline_bundle_id: bundleId,
          offline_local_id: tx.local_id,
          offline_device_id: deviceId,
          reconciled_at: new Date().toISOString(),
          ...tx.meta,
        }),
      ]
    );

    return {
      success: true,
      ledgerId: result.rows[0].id,
    };
  } catch (error: any) {
    console.error('Ledger creation error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// =====================================================================
// SIRA Integration
// =====================================================================

/**
 * Score transaction with SIRA (Brique 94)
 *
 * In production, this would call SIRA API for fraud detection
 */
async function scoreSiraTransaction(
  tx: OfflineTransaction,
  bundlePayload: BundlePayload
): Promise<{ score: number; action: 'accept' | 'review' | 'block' }> {
  // TODO: Call SIRA (Brique 94) API
  // For now, return mock score
  const mockScore = Math.random() * 0.4;

  let action: 'accept' | 'review' | 'block';
  if (mockScore < 0.15) {
    action = 'accept';
  } else if (mockScore < 0.3) {
    action = 'review';
  } else {
    action = 'block';
  }

  return { score: mockScore, action };
}

// =====================================================================
// Audit Logging
// =====================================================================

async function auditLog(
  client: PoolClient,
  bundleId: string,
  actor: string,
  action: string,
  details: Record<string, any>
): Promise<void> {
  try {
    await client.query(
      `INSERT INTO offline_audit_logs (bundle_id, actor, action, details)
       VALUES ($1, $2, $3, $4)`,
      [bundleId, actor, action, JSON.stringify(details)]
    );
  } catch (error) {
    console.error('Audit log failed:', error);
  }
}

// =====================================================================
// Reconciliation Logic
// =====================================================================

/**
 * Reconcile a single offline bundle
 */
async function reconcileBundle(
  client: PoolClient,
  bundleId: string,
  config: WorkerConfig
): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    success: false,
    bundleId,
    transactionsProcessed: 0,
    transactionsFailed: 0,
    errors: [],
  };

  try {
    // 1. Retrieve bundle
    const bundleResult = await client.query(
      `SELECT id, bundle_id, device_id, encrypted_payload, signature, status
       FROM offline_tx_bundles
       WHERE bundle_id = $1
       FOR UPDATE`, // Lock row for processing
      [bundleId]
    );

    if (bundleResult.rows.length === 0) {
      result.errors.push('Bundle not found');
      return result;
    }

    const bundle = bundleResult.rows[0];
    const deviceId = bundle.device_id;

    // 2. Decrypt bundle
    let bundlePayload: BundlePayload;
    try {
      bundlePayload = await decryptBundle(bundle.encrypted_payload);
    } catch (error: any) {
      result.errors.push(`Decryption failed: ${error.message}`);
      await client.query(
        `UPDATE offline_tx_bundles
         SET status = 'rejected', rejected_reason = $1
         WHERE bundle_id = $2`,
        ['decryption_failed', bundleId]
      );
      return result;
    }

    // 3. Get all transactions for this bundle
    const txResult = await client.query(
      `SELECT id, local_id, amount, currency, type, sender, receiver,
              merchant_id, initiated_at, meta, status, upstream_tx_id
       FROM offline_transactions
       WHERE bundle_id = $1
       ORDER BY initiated_at ASC`,
      [bundleId]
    );

    const transactions = txResult.rows;

    if (transactions.length === 0) {
      result.errors.push('No transactions found in bundle');
      return result;
    }

    // 4. Process each transaction
    for (const tx of transactions) {
      try {
        // Skip if already reconciled
        if (tx.upstream_tx_id) {
          result.transactionsProcessed++;
          continue;
        }

        // SIRA fraud check (if enabled)
        if (config.enableSiraScoring) {
          const siraResult = await scoreSiraTransaction(tx, bundlePayload);

          // Update SIRA score
          await client.query(
            'UPDATE offline_transactions SET sira_score = $1 WHERE id = $2',
            [siraResult.score, tx.id]
          );

          // Block if SIRA says so
          if (siraResult.action === 'block') {
            await client.query(
              `UPDATE offline_transactions
               SET status = 'blocked', meta = meta || $1
               WHERE id = $2`,
              [JSON.stringify({ sira_action: 'block', sira_score: siraResult.score }), tx.id]
            );

            await auditLog(client, bundleId, 'reconciliation_worker', 'transaction_blocked', {
              local_id: tx.local_id,
              sira_score: siraResult.score,
            });

            result.transactionsFailed++;
            continue;
          }

          // Mark for review if needed
          if (siraResult.action === 'review') {
            await client.query(
              `UPDATE offline_transactions
               SET status = 'pending_review', meta = meta || $1
               WHERE id = $2`,
              [JSON.stringify({ sira_action: 'review', sira_score: siraResult.score }), tx.id]
            );

            await auditLog(client, bundleId, 'reconciliation_worker', 'transaction_review', {
              local_id: tx.local_id,
              sira_score: siraResult.score,
            });

            result.transactionsFailed++;
            continue;
          }
        }

        // Create ledger entry (if enabled)
        if (config.enableLedgerCreation !== false) {
          const ledgerResult = await createLedgerEntry(
            client,
            {
              local_id: tx.local_id,
              type: tx.type,
              amount: parseFloat(tx.amount),
              currency: tx.currency,
              sender: tx.sender,
              receiver: tx.receiver,
              merchant_id: tx.merchant_id,
              initiated_at: tx.initiated_at,
              meta: tx.meta,
            },
            bundleId,
            deviceId
          );

          if (ledgerResult.success) {
            // Update offline transaction with upstream ID
            await client.query(
              `UPDATE offline_transactions
               SET upstream_tx_id = $1, status = 'reconciled'
               WHERE id = $2`,
              [ledgerResult.ledgerId, tx.id]
            );

            await auditLog(client, bundleId, 'reconciliation_worker', 'transaction_reconciled', {
              local_id: tx.local_id,
              upstream_tx_id: ledgerResult.ledgerId,
            });

            result.transactionsProcessed++;
          } else {
            // Mark as failed
            await client.query(
              `UPDATE offline_transactions
               SET status = 'failed', meta = meta || $1
               WHERE id = $2`,
              [JSON.stringify({ error: ledgerResult.error }), tx.id]
            );

            result.transactionsFailed++;
            result.errors.push(`Transaction ${tx.local_id} failed: ${ledgerResult.error}`);
          }
        } else {
          // Ledger creation disabled (testing mode)
          await client.query(
            `UPDATE offline_transactions SET status = 'reconciled' WHERE id = $1`,
            [tx.id]
          );
          result.transactionsProcessed++;
        }
      } catch (error: any) {
        console.error(`Transaction ${tx.local_id} processing error:`, error);
        result.transactionsFailed++;
        result.errors.push(`Transaction ${tx.local_id}: ${error.message}`);

        // Mark transaction as failed
        await client.query(
          `UPDATE offline_transactions
           SET status = 'failed', meta = meta || $1
           WHERE id = $2`,
          [JSON.stringify({ error: error.message }), tx.id]
        );
      }
    }

    // 5. Update bundle status
    let finalBundleStatus: string;

    if (result.transactionsFailed === 0) {
      finalBundleStatus = 'reconciled';
    } else if (result.transactionsProcessed === 0) {
      finalBundleStatus = 'failed';
    } else {
      finalBundleStatus = 'partially_reconciled';
    }

    await client.query(
      `UPDATE offline_tx_bundles
       SET status = $1, accepted_at = now()
       WHERE bundle_id = $2`,
      [finalBundleStatus, bundleId]
    );

    // 6. Remove from sync queue
    await client.query(
      'DELETE FROM offline_sync_queue WHERE bundle_id = $1',
      [bundleId]
    );

    // 7. Audit log
    await auditLog(client, bundleId, 'reconciliation_worker', 'bundle_reconciled', {
      status: finalBundleStatus,
      transactions_processed: result.transactionsProcessed,
      transactions_failed: result.transactionsFailed,
    });

    result.success = result.transactionsProcessed > 0;

    return result;
  } catch (error: any) {
    console.error(`Bundle ${bundleId} reconciliation error:`, error);
    result.errors.push(error.message);

    // Update bundle status to failed
    await client.query(
      `UPDATE offline_tx_bundles
       SET status = 'failed', rejected_reason = $1
       WHERE bundle_id = $2`,
      [error.message, bundleId]
    );

    return result;
  }
}

// =====================================================================
// Worker Main Loop
// =====================================================================

/**
 * Process a batch of bundles from the sync queue
 */
export async function processBatch(config: WorkerConfig): Promise<ReconciliationResult[]> {
  const { pool, batchSize = 10 } = config;
  const results: ReconciliationResult[] = [];

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get pending bundles from queue
    const queueResult = await client.query(
      `SELECT bundle_id, priority
       FROM offline_sync_queue
       WHERE status = 'pending'
       ORDER BY priority ASC, created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [batchSize]
    );

    const bundles = queueResult.rows;

    if (bundles.length === 0) {
      await client.query('COMMIT');
      return results;
    }

    console.log(`Processing ${bundles.length} bundles...`);

    // Process each bundle
    for (const bundle of bundles) {
      const result = await reconcileBundle(client, bundle.bundle_id, config);
      results.push(result);

      if (result.success) {
        console.log(`✓ Bundle ${bundle.bundle_id}: ${result.transactionsProcessed} transactions reconciled`);
      } else {
        console.error(`✗ Bundle ${bundle.bundle_id}: ${result.errors.join(', ')}`);
      }
    }

    await client.query('COMMIT');

    return results;
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Batch processing error:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run worker in continuous mode
 */
export async function runContinuous(config: WorkerConfig): Promise<void> {
  const { pollIntervalMs = 5000 } = config;

  console.log('🚀 Reconciliation worker started (continuous mode)');
  console.log(`Polling interval: ${pollIntervalMs}ms`);

  while (true) {
    try {
      const results = await processBatch(config);

      if (results.length > 0) {
        const successful = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;
        console.log(`Batch complete: ${successful} successful, ${failed} failed`);
      }

      // Wait before next iteration
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    } catch (error) {
      console.error('Worker iteration error:', error);
      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs * 2));
    }
  }
}

/**
 * Run worker once (cron mode)
 */
export async function runOnce(config: WorkerConfig): Promise<void> {
  console.log('🚀 Reconciliation worker started (cron mode)');

  try {
    const results = await processBatch(config);

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(`✓ Reconciliation complete: ${successful} successful, ${failed} failed`);

    process.exit(0);
  } catch (error) {
    console.error('Worker error:', error);
    process.exit(1);
  }
}

// =====================================================================
// CLI Entry Point
// =====================================================================

/**
 * Main entry point when run as script
 */
export async function main(): Promise<void> {
  // Parse environment variables
  const mode = process.env.WORKER_MODE || 'once'; // 'once' or 'continuous'
  const batchSize = parseInt(process.env.BATCH_SIZE || '10', 10);
  const pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);
  const enableSiraScoring = process.env.ENABLE_SIRA_SCORING !== 'false';
  const enableLedgerCreation = process.env.ENABLE_LEDGER_CREATION !== 'false';

  // Create database pool
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'molam_offline',
    user: process.env.POSTGRES_USER || 'molam',
    password: process.env.POSTGRES_PASSWORD,
    max: 20,
  });

  const config: WorkerConfig = {
    pool,
    batchSize,
    pollIntervalMs,
    enableSiraScoring,
    enableLedgerCreation,
  };

  // Run worker
  if (mode === 'continuous') {
    await runContinuous(config);
  } else {
    await runOnce(config);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// =====================================================================
// Exports
// =====================================================================

export default {
  processBatch,
  runContinuous,
  runOnce,
  main,
};
