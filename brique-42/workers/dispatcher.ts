/**
 * Brique 42 - Connect Payments
 * Events Dispatcher Worker
 *
 * Orchestrates event routing from outbox to both webhooks and SSE
 * Creates webhook delivery jobs for subscribed endpoints
 *
 * Run as: npm run worker:dispatcher
 */

import dotenv from "dotenv";
import { pool } from "../src/db";
import { logger } from "../src/observability";

dotenv.config();

// ============================================================================
// Constants
// ============================================================================

const BATCH_SIZE = 100;
const POLL_INTERVAL_MS = 2000; // Poll every 2 seconds

// ============================================================================
// Event Dispatching
// ============================================================================

interface OutboxEvent {
  id: string;
  connect_account_id: string | null;
  type: string;
  data: any;
  created_at: Date;
}

interface WebhookEndpoint {
  id: string;
  url: string;
  secret: string;
  events: string[];
}

/**
 * Get webhook endpoints that should receive this event
 */
async function getSubscribedWebhooks(
  connectAccountId: string | null,
  eventType: string
): Promise<WebhookEndpoint[]> {
  if (!connectAccountId) {
    return [];
  }

  const { rows } = await pool.query(
    `SELECT id, url, secret, events
     FROM connect_webhooks
     WHERE connect_account_id = $1
     AND enabled = true
     AND $2 = ANY(events)`,
    [connectAccountId, eventType]
  );

  return rows;
}

/**
 * Create webhook delivery job
 */
async function createWebhookDelivery(
  eventId: string,
  endpointId: string
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO connect_webhook_deliveries (event_id, endpoint_id, status, attempt)
       VALUES ($1, $2, 'pending', 0)
       ON CONFLICT (event_id, endpoint_id) DO NOTHING`,
      [eventId, endpointId]
    );

    logger.debug({
      event_id: eventId,
      endpoint_id: endpointId,
    }, "Webhook delivery job created");
  } catch (error: any) {
    logger.error({
      error: error.message,
      event_id: eventId,
      endpoint_id: endpointId,
    }, "Failed to create webhook delivery job");
  }
}

/**
 * Mark event as dispatched
 */
async function markEventDispatched(eventId: string): Promise<void> {
  await pool.query(
    `UPDATE connect_events_outbox SET dispatched_at = now() WHERE id = $1`,
    [eventId]
  );
}

/**
 * Dispatch a single event
 */
async function dispatchEvent(event: OutboxEvent): Promise<void> {
  try {
    logger.debug({
      event_id: event.id,
      event_type: event.type,
      account_id: event.connect_account_id,
    }, "Dispatching event");

    // Get subscribed webhooks
    const webhooks = await getSubscribedWebhooks(
      event.connect_account_id,
      event.type
    );

    if (webhooks.length === 0) {
      logger.debug({
        event_id: event.id,
        event_type: event.type,
      }, "No webhooks subscribed to this event");
    } else {
      logger.info({
        event_id: event.id,
        event_type: event.type,
        webhook_count: webhooks.length,
      }, "Creating webhook delivery jobs");

      // Create delivery jobs for each webhook
      for (const webhook of webhooks) {
        await createWebhookDelivery(event.id, webhook.id);
      }
    }

    // Mark event as dispatched
    await markEventDispatched(event.id);

    logger.info({
      event_id: event.id,
      event_type: event.type,
      webhooks_dispatched: webhooks.length,
    }, "Event dispatched successfully");
  } catch (error: any) {
    logger.error({
      error: error.message,
      event_id: event.id,
    }, "Failed to dispatch event");
    throw error;
  }
}

// ============================================================================
// Main Worker Loop
// ============================================================================

async function processEvents(): Promise<void> {
  try {
    // Get undispatched events from outbox
    const { rows } = await pool.query(
      `SELECT id, connect_account_id, type, data, created_at
       FROM connect_events_outbox
       WHERE dispatched_at IS NULL
       ORDER BY created_at ASC
       LIMIT $1`,
      [BATCH_SIZE]
    );

    if (rows.length === 0) {
      return;
    }

    logger.info({
      count: rows.length,
    }, "Processing events for dispatch");

    let dispatched = 0;
    let failed = 0;

    for (const event of rows) {
      try {
        await dispatchEvent(event);
        dispatched++;
      } catch (error: any) {
        logger.error({
          error: error.message,
          event_id: event.id,
          event_type: event.type,
        }, "Failed to process event");
        failed++;

        // Mark as dispatched anyway to avoid infinite retries
        // (individual webhook deliveries will retry)
        await markEventDispatched(event.id);
      }
    }

    logger.info({
      dispatched,
      failed,
      total: rows.length,
    }, "Batch processing complete");
  } catch (error: any) {
    logger.error({
      error: error.message,
    }, "Error in processEvents");
  }
}

// ============================================================================
// Worker Lifecycle
// ============================================================================

let running = true;
let loopTimer: NodeJS.Timeout | null = null;

async function runLoop(): Promise<void> {
  if (!running) return;

  try {
    await processEvents();
  } catch (error: any) {
    logger.error({
      error: error.message,
    }, "Error in worker loop");
  }

  // Schedule next iteration
  loopTimer = setTimeout(runLoop, POLL_INTERVAL_MS);
}

async function shutdown(): Promise<void> {
  logger.info("Shutting down dispatcher worker...");
  running = false;

  if (loopTimer) {
    clearTimeout(loopTimer);
  }

  await pool.end();

  logger.info("Dispatcher worker stopped");
  process.exit(0);
}

// Handle signals
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// ============================================================================
// Start Worker
// ============================================================================

async function start(): Promise<void> {
  logger.info({
    poll_interval_ms: POLL_INTERVAL_MS,
    batch_size: BATCH_SIZE,
  }, "Starting dispatcher worker");

  // Ensure database columns exist
  await pool.query(`ALTER TABLE connect_events_outbox ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ`);

  // Start the loop
  await runLoop();
}

// Run the worker
start().catch((error) => {
  logger.error({
    error: error.message,
  }, "Fatal error in dispatcher worker");
  process.exit(1);
});
