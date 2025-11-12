/**
 * Brique 42 - Connect Payments
 * SSE Broker Worker
 *
 * Publishes events from the outbox to Redis pub/sub for real-time dashboard
 * Clients connect via Server-Sent Events (SSE) and receive real-time updates
 *
 * Run as: npm run worker:sse-broker
 */

import dotenv from "dotenv";
import { pool } from "../src/db";
import Redis from "ioredis";
import { logger } from "../src/observability";

dotenv.config();

// ============================================================================
// Redis Setup
// ============================================================================

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || "0"),
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on("connect", () => {
  logger.info("Redis connected for SSE broker");
});

redis.on("error", (err) => {
  logger.error({ error: err }, "Redis connection error");
});

// ============================================================================
// Constants
// ============================================================================

const BATCH_SIZE = 100;
const POLL_INTERVAL_MS = 1000; // Poll every second
const REDIS_CHANNEL_PREFIX = "molam:b42:events";

// ============================================================================
// Event Publishing
// ============================================================================

/**
 * Get channel name for event publishing
 * Events can be scoped to specific accounts or global
 */
function getChannelName(connectAccountId: string | null): string {
  if (connectAccountId) {
    return `${REDIS_CHANNEL_PREFIX}:account:${connectAccountId}`;
  }
  return `${REDIS_CHANNEL_PREFIX}:global`;
}

/**
 * Publish event to Redis
 */
async function publishEvent(event: any): Promise<void> {
  try {
    // Publish to account-specific channel
    if (event.connect_account_id) {
      const accountChannel = getChannelName(event.connect_account_id);
      await redis.publish(
        accountChannel,
        JSON.stringify({
          id: event.id,
          type: event.type,
          data: event.data,
          created_at: event.created_at,
        })
      );

      logger.debug({
        event_id: event.id,
        channel: accountChannel,
        type: event.type,
      }, "Event published to account channel");
    }

    // Also publish to global channel for admin dashboards
    const globalChannel = getChannelName(null);
    await redis.publish(
      globalChannel,
      JSON.stringify({
        id: event.id,
        type: event.type,
        connect_account_id: event.connect_account_id,
        data: event.data,
        created_at: event.created_at,
      })
    );

    logger.debug({
      event_id: event.id,
      channel: globalChannel,
      type: event.type,
    }, "Event published to global channel");
  } catch (error: any) {
    logger.error({
      error: error.message,
      event_id: event.id,
    }, "Failed to publish event to Redis");
    throw error;
  }
}

/**
 * Mark event as published via SSE
 */
async function markEventPublished(eventId: string): Promise<void> {
  await pool.query(
    `UPDATE connect_events_outbox SET sse_published_at = now() WHERE id = $1`,
    [eventId]
  );
}

// ============================================================================
// Main Worker Loop
// ============================================================================

async function processEvents(): Promise<void> {
  try {
    // Get unpublished events from outbox
    const { rows } = await pool.query(
      `SELECT id, connect_account_id, type, data, created_at
       FROM connect_events_outbox
       WHERE sse_published_at IS NULL
       ORDER BY created_at ASC
       LIMIT $1`,
      [BATCH_SIZE]
    );

    if (rows.length === 0) {
      return;
    }

    logger.info({
      count: rows.length,
    }, "Processing events for SSE publication");

    let published = 0;
    let failed = 0;

    for (const event of rows) {
      try {
        await publishEvent(event);
        await markEventPublished(event.id);
        published++;
      } catch (error: any) {
        logger.error({
          error: error.message,
          event_id: event.id,
          event_type: event.type,
        }, "Failed to process event");
        failed++;
      }
    }

    logger.info({
      published,
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
  logger.info("Shutting down SSE broker worker...");
  running = false;

  if (loopTimer) {
    clearTimeout(loopTimer);
  }

  await redis.quit();
  await pool.end();

  logger.info("SSE broker worker stopped");
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
    redis_host: process.env.REDIS_HOST || "localhost",
  }, "Starting SSE broker worker");

  // Ensure database extension exists
  await pool.query(`ALTER TABLE connect_events_outbox ADD COLUMN IF NOT EXISTS sse_published_at TIMESTAMPTZ`);

  // Start the loop
  await runLoop();
}

// Run the worker
start().catch((error) => {
  logger.error({
    error: error.message,
  }, "Fatal error in SSE broker worker");
  process.exit(1);
});
