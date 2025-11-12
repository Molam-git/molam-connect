/**
 * Brique 41 - Molam Connect
 * Events Dispatcher Worker
 *
 * Dispatches webhook events based on audit log entries
 * Run as cron job or scheduled task
 */

import dotenv from "dotenv";
import crypto from "crypto";
import fetch from "node-fetch";
import { pool } from "../src/db";

dotenv.config();

interface WebhookEvent {
  type: string;
  account_id: string;
  data: any;
  created_at: string;
}

/**
 * Generate HMAC signature for webhook
 */
function generateSignature(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Send webhook to endpoint
 */
async function sendWebhook(
  url: string,
  secret: string,
  event: WebhookEvent
): Promise<boolean> {
  try {
    const body = JSON.stringify(event);
    const signature = generateSignature(secret, body);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Molam-Signature": signature,
        "X-Molam-Event": event.type,
      },
      body,
      timeout: 10000,
    } as any);

    if (!response.ok) {
      console.warn(
        `[Events] Webhook failed: ${url} - ${response.status} ${response.statusText}`
      );
      return false;
    }

    console.log(`[Events] Webhook sent successfully: ${url}`);
    return true;
  } catch (e: any) {
    console.error(`[Events] Webhook error for ${url}:`, e.message);
    return false;
  }
}

/**
 * Map audit actions to webhook event types
 */
function mapAuditToWebhookEvent(action: string): string | null {
  const mapping: Record<string, string> = {
    "connect_account.created": "account.created",
    "connect_account.updated": "account.updated",
    "connect_account.approved": "account.approved",
    "connect_account.rejected": "account.rejected",
    "connect_account.blocked": "account.blocked",
    "connect_account.verification_refreshed": "account.verified",
    "connect_account.capabilities_updated": "capability.updated",
  };

  return mapping[action] || null;
}

async function run() {
  console.log(`[Events Dispatcher] Starting at ${new Date().toISOString()}`);

  try {
    // Get recent audit events that should trigger webhooks
    const { rows: events } = await pool.query(
      `SELECT id, connect_account_id, actor, action, details, created_at
       FROM connect_audit_logs
       WHERE created_at > NOW() - INTERVAL '10 minutes'
       AND connect_account_id IS NOT NULL
       ORDER BY created_at ASC
       LIMIT 1000`
    );

    console.log(`[Events Dispatcher] Found ${events.length} audit events`);

    let dispatchedCount = 0;
    let skippedCount = 0;

    for (const event of events) {
      const webhookEventType = mapAuditToWebhookEvent(event.action);

      if (!webhookEventType) {
        skippedCount++;
        continue;
      }

      // Get active webhooks for this account that listen to this event
      const { rows: webhooks } = await pool.query(
        `SELECT id, url, secret, events
         FROM connect_webhooks
         WHERE connect_account_id = $1
         AND enabled = true
         AND $2 = ANY(events)`,
        [event.connect_account_id, webhookEventType]
      );

      if (webhooks.length === 0) {
        skippedCount++;
        continue;
      }

      const webhookPayload: WebhookEvent = {
        type: webhookEventType,
        account_id: event.connect_account_id,
        data: event.details || {},
        created_at: event.created_at,
      };

      // Send to each webhook endpoint
      for (const webhook of webhooks) {
        const success = await sendWebhook(webhook.url, webhook.secret, webhookPayload);

        if (success) {
          dispatchedCount++;
        }

        // Small delay to avoid overwhelming external servers
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    console.log(
      `[Events Dispatcher] Completed: ${dispatchedCount} dispatched, ${skippedCount} skipped`
    );

    // Close database connection
    await pool.end();
    process.exit(0);
  } catch (e: any) {
    console.error("[Events Dispatcher] Fatal error:", e);
    await pool.end();
    process.exit(1);
  }
}

// Run the worker
run().catch((e) => {
  console.error("[Events Dispatcher] Unhandled error:", e);
  process.exit(1);
});
