/**
 * Webhook Delivery Worker
 * Brique 73 - Processes queued webhook deliveries with retries
 *
 * This worker:
 * - Polls for pending webhook deliveries
 * - Delivers webhooks with exponential backoff
 * - Tracks delivery metrics
 * - Runs SIRA Guard health checks
 */

import { pool } from '../db';
import { deliverWebhook } from '../services/webhooks';
import { analyzeWebhookHealth } from '../services/siraGuard';

// ========================================
// Configuration
// ========================================

const WORKER_CONFIG = {
  pollIntervalMs: 5000, // Poll every 5 seconds
  batchSize: 10, // Process up to 10 deliveries per batch
  concurrency: 5, // Process up to 5 deliveries concurrently
  healthCheckIntervalMs: 60000, // Run health checks every minute
  metricsIntervalMs: 300000, // Aggregate metrics every 5 minutes
};

// ========================================
// Worker State
// ========================================

let isRunning = false;
let workerInterval: NodeJS.Timeout | null = null;
let healthCheckInterval: NodeJS.Timeout | null = null;
let metricsInterval: NodeJS.Timeout | null = null;

// ========================================
// Main Worker Loop
// ========================================

export async function startWebhookDeliveryWorker(): Promise<void> {
  if (isRunning) {
    console.warn('[Webhook Worker] Already running');
    return;
  }

  isRunning = true;
  console.log('[Webhook Worker] Starting...');

  // Main delivery loop
  workerInterval = setInterval(async () => {
    try {
      await processDeliveryBatch();
    } catch (error) {
      console.error('[Webhook Worker] Error in delivery loop', error);
    }
  }, WORKER_CONFIG.pollIntervalMs);

  // Health check loop
  healthCheckInterval = setInterval(async () => {
    try {
      await runHealthChecks();
    } catch (error) {
      console.error('[Webhook Worker] Error in health check loop', error);
    }
  }, WORKER_CONFIG.healthCheckIntervalMs);

  // Metrics aggregation loop
  metricsInterval = setInterval(async () => {
    try {
      await aggregateMetrics();
    } catch (error) {
      console.error('[Webhook Worker] Error in metrics loop', error);
    }
  }, WORKER_CONFIG.metricsIntervalMs);

  console.log('[Webhook Worker] Started successfully');
}

export function stopWebhookDeliveryWorker(): void {
  if (!isRunning) {
    console.warn('[Webhook Worker] Not running');
    return;
  }

  console.log('[Webhook Worker] Stopping...');

  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }

  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }

  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }

  isRunning = false;
  console.log('[Webhook Worker] Stopped');
}

// ========================================
// Delivery Processing
// ========================================

async function processDeliveryBatch(): Promise<void> {
  // Find pending deliveries ready to send
  const result = await pool.query(
    `SELECT id
     FROM webhook_deliveries
     WHERE status IN ('pending', 'retrying')
       AND (next_retry_at IS NULL OR next_retry_at <= NOW())
     ORDER BY created_at ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [WORKER_CONFIG.batchSize]
  );

  if (result.rows.length === 0) {
    // No deliveries to process
    return;
  }

  const deliveryIds = result.rows.map(row => row.id);
  console.log(`[Webhook Worker] Processing ${deliveryIds.length} deliveries`);

  // Process deliveries with concurrency limit
  const chunks = chunkArray(deliveryIds, WORKER_CONFIG.concurrency);

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (deliveryId) => {
        try {
          const result = await deliverWebhook(deliveryId);

          if (result.success) {
            console.log(`[Webhook Worker] Delivered ${deliveryId} successfully`);
          } else {
            console.warn(`[Webhook Worker] Delivery ${deliveryId} failed`, {
              responseCode: result.responseCode,
              error: result.error,
            });
          }
        } catch (error) {
          console.error(`[Webhook Worker] Error delivering ${deliveryId}`, error);
        }
      })
    );
  }
}

// ========================================
// Health Monitoring (SIRA Guard)
// ========================================

async function runHealthChecks(): Promise<void> {
  // Find webhooks with recent activity to analyze
  const result = await pool.query(
    `SELECT DISTINCT webhook_id
     FROM webhook_deliveries
     WHERE created_at >= NOW() - INTERVAL '1 hour'`
  );

  if (result.rows.length === 0) {
    return;
  }

  console.log(`[Webhook Worker] Running health checks for ${result.rows.length} webhooks`);

  for (const row of result.rows) {
    try {
      await checkWebhookHealth(row.webhook_id);
    } catch (error) {
      console.error(`[Webhook Worker] Health check failed for webhook ${row.webhook_id}`, error);
    }
  }
}

async function checkWebhookHealth(webhookId: string): Promise<void> {
  // Gather recent stats
  const stats = await pool.query(
    `SELECT
       COUNT(*) as total_deliveries,
       SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as successful_deliveries,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_deliveries,
       AVG(latency_ms) as avg_latency,
       MAX(latency_ms) as max_latency,
       jsonb_object_agg(COALESCE(error_type, 'none'), COUNT(*)) as error_types
     FROM webhook_deliveries
     WHERE webhook_id = $1
       AND created_at >= NOW() - INTERVAL '1 hour'`,
    [webhookId]
  );

  // Get consecutive failures
  const consecutiveResult = await pool.query(
    `SELECT COUNT(*) as consecutive_failures
     FROM webhook_deliveries
     WHERE webhook_id = $1
       AND status = 'failed'
       AND created_at >= (
         SELECT COALESCE(MAX(created_at), NOW() - INTERVAL '1 day')
         FROM webhook_deliveries
         WHERE webhook_id = $1 AND status = 'delivered'
       )`,
    [webhookId]
  );

  const row = stats.rows[0];
  const totalDeliveries = parseInt(row.total_deliveries) || 0;

  // Skip if no recent activity
  if (totalDeliveries === 0) {
    return;
  }

  // Run SIRA Guard analysis
  const analysis = await analyzeWebhookHealth({
    webhookId,
    totalDeliveries,
    successfulDeliveries: parseInt(row.successful_deliveries) || 0,
    failedDeliveries: parseInt(row.failed_deliveries) || 0,
    avgLatency: parseFloat(row.avg_latency) || 0,
    maxLatency: parseFloat(row.max_latency) || 0,
    errorTypes: row.error_types || {},
    consecutiveFailures: parseInt(consecutiveResult.rows[0].consecutive_failures) || 0,
  });

  if (analysis.suspicious) {
    console.warn(`[Webhook Worker] Health issue detected for webhook ${webhookId}`, {
      anomalyScore: analysis.anomalyScore,
      events: analysis.events.map(e => e.eventType),
      actionTaken: analysis.actionTaken,
    });
  }
}

// ========================================
// Metrics Aggregation
// ========================================

async function aggregateMetrics(): Promise<void> {
  console.log('[Webhook Worker] Aggregating metrics...');

  // Aggregate hourly metrics from individual deliveries
  // This helps with dashboard performance by pre-computing stats
  try {
    await pool.query(
      `INSERT INTO webhook_delivery_metrics (
        webhook_id, period_start, period_type,
        total_deliveries, successful_deliveries, failed_deliveries,
        avg_latency_ms, max_latency_ms,
        status_distribution, error_types,
        created_at
      )
      SELECT
        webhook_id,
        date_trunc('hour', created_at) as period_start,
        'hour' as period_type,
        COUNT(*) as total_deliveries,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as successful_deliveries,
        SUM(CASE WHEN status IN ('failed', 'retrying') THEN 1 ELSE 0 END) as failed_deliveries,
        AVG(latency_ms) as avg_latency_ms,
        MAX(latency_ms) as max_latency_ms,
        jsonb_object_agg(COALESCE(CAST(response_code AS TEXT), '0'), COUNT(*)) as status_distribution,
        jsonb_object_agg(COALESCE(error_type, 'none'), COUNT(*)) as error_types,
        NOW() as created_at
      FROM webhook_deliveries
      WHERE created_at >= NOW() - INTERVAL '2 hours'
        AND created_at < date_trunc('hour', NOW())
      GROUP BY webhook_id, date_trunc('hour', created_at)
      ON CONFLICT (webhook_id, period_start, period_type) DO NOTHING`
    );

    console.log('[Webhook Worker] Metrics aggregated successfully');
  } catch (error) {
    console.error('[Webhook Worker] Failed to aggregate metrics', error);
  }

  // Clean up old delivery records (optional - keep for audit)
  // Uncomment if you want to clean up old data
  /*
  try {
    const result = await pool.query(
      `DELETE FROM webhook_deliveries
       WHERE created_at < NOW() - INTERVAL '90 days'
         AND status IN ('delivered', 'failed')`
    );

    if (result.rowCount > 0) {
      console.log(`[Webhook Worker] Cleaned up ${result.rowCount} old delivery records`);
    }
  } catch (error) {
    console.error('[Webhook Worker] Failed to clean up old records', error);
  }
  */
}

// ========================================
// Utility Functions
// ========================================

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ========================================
// Graceful Shutdown
// ========================================

process.on('SIGTERM', () => {
  console.log('[Webhook Worker] SIGTERM received, shutting down gracefully...');
  stopWebhookDeliveryWorker();
  setTimeout(() => {
    console.log('[Webhook Worker] Forced shutdown');
    process.exit(0);
  }, 10000); // Give 10 seconds for graceful shutdown
});

process.on('SIGINT', () => {
  console.log('[Webhook Worker] SIGINT received, shutting down gracefully...');
  stopWebhookDeliveryWorker();
  setTimeout(() => {
    console.log('[Webhook Worker] Forced shutdown');
    process.exit(0);
  }, 10000);
});
