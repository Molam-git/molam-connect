/**
 * Brique 41 - Molam Connect
 * Event system for webhooks and internal notifications
 */

import { pool } from "../db";
import crypto from "crypto";
import fetch from "node-fetch";

export interface WebhookEvent {
  type: string;
  account_id: string;
  data: any;
  created_at: string;
}

/**
 * Emit event to webhooks for a Connect account
 */
export async function emitEvent(
  connectAccountId: string,
  eventType: string,
  data: any
): Promise<void> {
  try {
    // Get active webhooks for this account that listen to this event
    const { rows: webhooks } = await pool.query(
      `SELECT id, url, secret, events
       FROM connect_webhooks
       WHERE connect_account_id = $1 AND enabled = true`,
      [connectAccountId]
    );

    const event: WebhookEvent = {
      type: eventType,
      account_id: connectAccountId,
      data,
      created_at: new Date().toISOString(),
    };

    // Send to each webhook endpoint
    const promises = webhooks
      .filter((wh) => wh.events.includes(eventType))
      .map((wh) => sendWebhook(wh.url, wh.secret, event));

    await Promise.allSettled(promises);

    console.log(`[Events] Emitted ${eventType} to ${promises.length} webhooks`);
  } catch (e: any) {
    console.error("[Events] Failed to emit event:", e.message);
  }
}

/**
 * Send webhook with HMAC signature
 */
async function sendWebhook(url: string, secret: string, event: WebhookEvent): Promise<void> {
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
      console.warn(`[Events] Webhook failed: ${url} - ${response.status}`);
    } else {
      console.log(`[Events] Webhook sent successfully: ${url}`);
    }
  } catch (e: any) {
    console.error(`[Events] Webhook error for ${url}:`, e.message);
  }
}

/**
 * Generate HMAC signature for webhook
 */
export function generateSignature(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Verify webhook signature
 */
export function verifySignature(secret: string, body: string, signature: string): boolean {
  const expectedSignature = generateSignature(secret, body);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

/**
 * Get event types that can be subscribed to
 */
export function getAvailableEventTypes(): string[] {
  return [
    "payment.succeeded",
    "payment.failed",
    "payment.refunded",
    "payout.sent",
    "payout.settled",
    "payout.failed",
    "account.updated",
    "account.verified",
    "account.blocked",
    "dispute.created",
    "dispute.resolved",
    "capability.enabled",
    "capability.disabled",
  ];
}

/**
 * Retry failed webhooks (called by worker)
 */
export async function retryFailedWebhooks(maxRetries: number = 3): Promise<void> {
  // This would typically fetch from a webhook_deliveries table
  // For now, this is a placeholder for the retry logic
  console.log("[Events] Retry failed webhooks (not implemented)");
}
