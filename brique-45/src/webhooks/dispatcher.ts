// ============================================================================
// Brique 45 - Webhooks Industriels
// Dispatcher Worker: Retry Logic + DLQ
// ============================================================================

import dotenv from "dotenv";
dotenv.config();

import fetch from "node-fetch";
import crypto from "crypto";
import { pool, closeDb } from "../utils/db";
import { getActiveOrRetiringSecrets } from "./secrets";

const ENABLE_DISPATCHER_WORKER = process.env.ENABLE_DISPATCHER_WORKER !== "false";
const DISPATCHER_POLL_INTERVAL = parseInt(process.env.DISPATCHER_POLL_INTERVAL || "1500");
const DISPATCHER_BATCH_SIZE = parseInt(process.env.DISPATCHER_BATCH_SIZE || "50");
const WEBHOOK_REQUEST_TIMEOUT = parseInt(process.env.WEBHOOK_REQUEST_TIMEOUT || "10000");
const WEBHOOK_USER_AGENT = process.env.WEBHOOK_USER_AGENT || "Molam-Connect-Webhook/1.0";

// Backoff schedule: 1m, 5m, 15m, 1h, 6h, 24h (6 attempts)
const BACKOFF_MS = process.env.RETRY_BACKOFF_MS
  ? process.env.RETRY_BACKOFF_MS.split(",").map(Number)
  : [60e3, 5 * 60e3, 15 * 60e3, 60 * 60e3, 6 * 60 * 60e3, 24 * 60 * 60e3];

/**
 * Sign webhook body with HMAC SHA-256
 * Format: t=<unix_ms>,v1=<hmac_hex>,kid=<key_version>
 */
async function signBody(endpointId: string, body: Buffer): Promise<{ header: string }> {
  const secrets = await getActiveOrRetiringSecrets(endpointId);

  if (secrets.length === 0) {
    throw new Error("No active or retiring secrets found for endpoint");
  }

  // Sign with the active key (highest version)
  const kid = Math.max(...secrets.map((s) => s.kid));
  const active = secrets.find((s) => s.kid === kid)!;

  const t = Date.now().toString();
  const v1 = crypto
    .createHmac("sha256", active.secret)
    .update(`${t}.${body}`)
    .digest("hex");

  const header = `t=${t},v1=${v1},kid=${kid}`;
  return { header };
}

/**
 * Determine if HTTP status code should trigger retry
 */
function shouldRetry(code: number): boolean {
  if (code >= 200 && code < 300) return false;
  if ([408, 409, 425, 429].includes(code)) return true;
  if (code >= 500) return true;
  if (code >= 400 && code < 500) return false;
  return true;
}

/**
 * Dispatch a single delivery
 */
async function dispatchDelivery(delivery: any): Promise<void> {
  const { id: deliveryId, event_id, endpoint_id, attempts } = delivery;

  try {
    // Fetch event and endpoint details
    const { rows: [event] } = await pool.query(
      `SELECT * FROM webhook_events WHERE id=$1`,
      [event_id]
    );

    const { rows: [endpoint] } = await pool.query(
      `SELECT * FROM webhook_endpoints WHERE id=$1`,
      [endpoint_id]
    );

    // Skip if endpoint is paused or disabled
    if (!endpoint || endpoint.status !== "active") {
      await pool.query(
        `UPDATE webhook_deliveries
         SET status='failed', next_attempt_at=now() + interval '6 hours'
         WHERE id=$1`,
        [deliveryId]
      );
      console.log(`Delivery ${deliveryId}: endpoint ${endpoint_id} not active, rescheduling`);
      return;
    }

    // Build payload
    const payload = Buffer.from(
      JSON.stringify({
        id: event.id,
        type: event.type,
        created: event.created_at,
        data: event.data,
      })
    );

    // Sign payload
    const { header } = await signBody(endpoint.id, payload);

    // Send HTTP request
    const start = Date.now();
    let code = 0;
    let errMsg = "";

    try {
      // Use AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_REQUEST_TIMEOUT);

      const resp = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": WEBHOOK_USER_AGENT,
          "Molam-Signature": header,
          "Idempotency-Key": deliveryId,
        },
        body: payload,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      code = resp.status;

      if (code >= 200 && code < 300) {
        // Success
        await pool.query(
          `INSERT INTO webhook_delivery_attempts(delivery_id,http_code,latency_ms) VALUES ($1,$2,$3)`,
          [deliveryId, code, Date.now() - start]
        );

        await pool.query(
          `UPDATE webhook_deliveries SET status='succeeded', last_code=$2, updated_at=now() WHERE id=$1`,
          [deliveryId, code]
        );

        console.log(`Delivery ${deliveryId}: succeeded (${code}) in ${Date.now() - start}ms`);
        return;
      } else {
        errMsg = `http_${code}`;
      }
    } catch (e: any) {
      errMsg = e.message || "network_error";
      console.error(`Delivery ${deliveryId}: request failed - ${errMsg}`);
    }

    // Log attempt
    await pool.query(
      `INSERT INTO webhook_delivery_attempts(delivery_id,http_code,latency_ms,error) VALUES ($1,$2,$3,$4)`,
      [deliveryId, code || 0, Date.now() - start, errMsg]
    );

    const newAttempts = Number(attempts) + 1;

    // Check if we should quarantine (max retries reached)
    if (newAttempts >= BACKOFF_MS.length) {
      await pool.query(
        `UPDATE webhook_deliveries
         SET status='quarantined', attempts=$2, last_code=$3, last_error=$4
         WHERE id=$1`,
        [deliveryId, newAttempts, code || 0, errMsg]
      );

      await pool.query(
        `INSERT INTO webhook_deadletters(delivery_id,event_id,endpoint_id,reason,snapshot)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          deliveryId,
          event_id,
          endpoint_id,
          "max_retries",
          JSON.stringify({ code, errMsg, attempts: newAttempts }),
        ]
      );

      console.log(`Delivery ${deliveryId}: quarantined after ${newAttempts} attempts`);
    } else {
      // Schedule retry with backoff
      const waitMs = BACKOFF_MS[newAttempts];

      await pool.query(
        `UPDATE webhook_deliveries
         SET status='failed', attempts=$2, last_code=$3, last_error=$4,
             next_attempt_at=now() + make_interval(secs => $5/1000)
         WHERE id=$1`,
        [deliveryId, newAttempts, code || 0, errMsg, waitMs]
      );

      console.log(`Delivery ${deliveryId}: retry scheduled in ${waitMs}ms (attempt ${newAttempts})`);
    }
  } catch (error: any) {
    console.error(`Delivery ${deliveryId}: dispatch error - ${error.message}`);

    // Mark as failed and reschedule
    await pool.query(
      `UPDATE webhook_deliveries
       SET status='failed', last_error=$2, next_attempt_at=now() + interval '5 minutes'
       WHERE id=$1`,
      [deliveryId, error.message]
    );
  }
}

/**
 * Tick once: process a batch of ready deliveries
 */
export async function tickOnce(): Promise<void> {
  try {
    // Optimistic locking: grab a batch of ready deliveries
    const { rows: batch } = await pool.query(
      `UPDATE webhook_deliveries
       SET status='delivering', updated_at=now()
       WHERE id IN (
         SELECT id FROM webhook_deliveries
         WHERE status IN ('pending','failed') AND next_attempt_at <= now()
         ORDER BY next_attempt_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       RETURNING *`,
      [DISPATCHER_BATCH_SIZE]
    );

    if (batch.length > 0) {
      console.log(`Processing batch of ${batch.length} deliveries`);
    }

    // Process each delivery
    for (const delivery of batch) {
      await dispatchDelivery(delivery);
    }
  } catch (error: any) {
    console.error("tickOnce error:", error.message);
  }
}

/**
 * Main worker loop
 */
async function main() {
  if (!ENABLE_DISPATCHER_WORKER) {
    console.log("Dispatcher worker disabled via ENABLE_DISPATCHER_WORKER flag");
    process.exit(0);
  }

  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║  Brique 45 - Webhook Dispatcher Worker                   ║
  ╠═══════════════════════════════════════════════════════════╣
  ║  Poll Interval:  ${DISPATCHER_POLL_INTERVAL}ms${" ".repeat(39 - DISPATCHER_POLL_INTERVAL.toString().length)}║
  ║  Batch Size:     ${DISPATCHER_BATCH_SIZE}${" ".repeat(45 - DISPATCHER_BATCH_SIZE.toString().length)}║
  ║  Retry Schedule: ${BACKOFF_MS.length} attempts (${BACKOFF_MS.map(ms => `${ms / 1000}s`).join(", ")})${" ".repeat(Math.max(0, 21 - BACKOFF_MS.map(ms => `${ms / 1000}s`).join(", ").length))}║
  ╚═══════════════════════════════════════════════════════════╝
  `);

  // Main loop
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await tickOnce();
    await new Promise((resolve) => setTimeout(resolve, DISPATCHER_POLL_INTERVAL));
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down dispatcher worker...");
  await closeDb();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down dispatcher worker...");
  await closeDb();
  process.exit(0);
});

// Start worker
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error in dispatcher worker:", error);
    process.exit(1);
  });
}
