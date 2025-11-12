/**
 * Brique 42 - Connect Payments
 * Webhook Delivery Worker
 *
 * Delivers webhooks with retries and exponential backoff
 * Run as cron job or scheduled task (every minute)
 */

import dotenv from "dotenv";
import { pool } from "../src/db";
import fetch from "node-fetch";
import crypto from "crypto";

dotenv.config();

async function tick() {
  console.log(`[Webhook Delivery] Starting at ${new Date().toISOString()}`);

  try {
    // Get pending deliveries
    const { rows } = await pool.query(
      `SELECT d.id, d.event_id, d.endpoint_id, d.attempt, w.url, w.secret, e.type, e.data
       FROM connect_webhook_deliveries d
       JOIN connect_webhooks w ON w.id = d.endpoint_id
       JOIN connect_events_outbox e ON e.id = d.event_id
       WHERE d.status IN ('pending', 'retry')
       AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= now())
       ORDER BY d.created_at
       LIMIT 100`
    );

    console.log(`[Webhook Delivery] Found ${rows.length} deliveries to process`);

    for (const delivery of rows) {
      try {
        const payload = {
          type: delivery.type,
          data: delivery.data,
          created_at: new Date().toISOString(),
        };

        const body = JSON.stringify(payload);
        const signature = crypto
          .createHmac("sha256", delivery.secret)
          .update(body)
          .digest("hex");

        const startTime = Date.now();
        let status = "ok";
        let code = 200;

        try {
          const response = await fetch(delivery.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Molam-Signature": signature,
              "X-Molam-Event": delivery.type,
            },
            body,
            timeout: 10000,
          } as any);

          code = response.status;
          status = code >= 200 && code < 300 ? "ok" : "retry";

          console.log(
            `[Webhook Delivery] ${delivery.url}: ${code} (${Date.now() - startTime}ms)`
          );
        } catch (e: any) {
          console.error(`[Webhook Delivery] Fetch error for ${delivery.url}:`, e.message);
          status = "retry";
          code = 0;
        }

        const responseMs = Date.now() - startTime;

        if (status === "retry") {
          const attempt = delivery.attempt + 1;
          const finalStatus = attempt > 10 ? "failed" : "retry";
          const nextAttempt =
            attempt > 10
              ? null
              : new Date(Date.now() + Math.min(60_000 * attempt, 3_600_000));

          await pool.query(
            `UPDATE connect_webhook_deliveries
             SET attempt = $1, status = $2, response_code = $3, response_ms = $4, next_attempt_at = $5, updated_at = now()
             WHERE id = $6`,
            [attempt, finalStatus, code, responseMs, nextAttempt, delivery.id]
          );

          console.log(
            `[Webhook Delivery] Retry ${attempt}/10 scheduled for ${delivery.url} at ${nextAttempt}`
          );
        } else {
          // Success
          await pool.query(
            `UPDATE connect_webhook_deliveries
             SET status = 'ok', response_code = $1, response_ms = $2, updated_at = now()
             WHERE id = $3`,
            [code, responseMs, delivery.id]
          );

          // Mark event as delivered
          await pool.query(
            `UPDATE connect_events_outbox
             SET delivered_at = now()
             WHERE id = $1 AND delivered_at IS NULL`,
            [delivery.event_id]
          );

          console.log(`[Webhook Delivery] Success: ${delivery.url}`);
        }
      } catch (e: any) {
        console.error(
          `[Webhook Delivery] Error processing delivery ${delivery.id}:`,
          e.message
        );
      }
    }

    console.log("[Webhook Delivery] Completed");
  } catch (e: any) {
    console.error("[Webhook Delivery] Fatal error:", e);
    throw e;
  }
}

// Run the worker
tick()
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.error("[Webhook Delivery] Unhandled error:", e);
    process.exit(1);
  });
