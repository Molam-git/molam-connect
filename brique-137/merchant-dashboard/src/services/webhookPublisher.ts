// ============================================================================
// Webhook Publisher - Send events to merchant endpoints
// ============================================================================

import axios from "axios";
import crypto from "crypto";
import { pool } from "../utils/db";
import { logger } from "../utils/logger";

const EVENT_BUS_URL = process.env.EVENT_BUS_URL || "http://event-bus:3000";
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || "";

/**
 * Publish event to merchant webhooks and event bus
 */
export async function publishEvent(
  merchantId: string,
  eventType: string,
  payload: any
): Promise<void> {
  // Get merchant webhooks subscribed to this event
  const { rows: webhooks } = await pool.query(
    `SELECT * FROM merchant_webhooks WHERE merchant_id = $1 AND active = TRUE AND $2 = ANY(events)`,
    [merchantId, eventType]
  );

  // Publish to event bus
  try {
    await axios.post(
      `${EVENT_BUS_URL}/api/events/publish`,
      {
        event_type: `merchant.${eventType}`,
        payload: {
          merchant_id: merchantId,
          ...payload,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${SERVICE_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      }
    );

    logger.info("Event published to event bus", {
      merchant_id: merchantId,
      event_type: eventType,
    });
  } catch (error: any) {
    logger.error("Failed to publish to event bus", {
      merchant_id: merchantId,
      event_type: eventType,
      error: error.message,
    });
  }

  // Send to merchant webhooks
  for (const webhook of webhooks) {
    try {
      await sendWebhook(webhook, eventType, payload);
    } catch (error: any) {
      logger.error("Failed to send webhook", {
        webhook_id: webhook.id,
        merchant_id: merchantId,
        error: error.message,
      });
    }
  }
}

/**
 * Send webhook with HMAC signature
 */
async function sendWebhook(webhook: any, eventType: string, payload: any): Promise<void> {
  const webhookPayload = {
    id: crypto.randomUUID(),
    event: eventType,
    created_at: new Date().toISOString(),
    data: payload,
  };

  const body = JSON.stringify(webhookPayload);

  // Generate HMAC signature
  const signature = crypto.createHmac("sha256", webhook.secret).update(body).digest("hex");

  try {
    const response = await axios.post(webhook.url, webhookPayload, {
      headers: {
        "Content-Type": "application/json",
        "X-Molam-Signature": signature,
        "X-Molam-Event": eventType,
      },
      timeout: 10000,
    });

    // Update delivery stats
    await pool.query(
      `UPDATE merchant_webhooks
       SET total_delivered = total_delivered + 1, last_delivered_at = now()
       WHERE id = $1`,
      [webhook.id]
    );

    logger.info("Webhook delivered", {
      webhook_id: webhook.id,
      event_type: eventType,
      status_code: response.status,
    });
  } catch (error: any) {
    // Update failure stats
    await pool.query(
      `UPDATE merchant_webhooks
       SET total_failed = total_failed + 1, last_failed_at = now()
       WHERE id = $1`,
      [webhook.id]
    );

    logger.error("Webhook delivery failed", {
      webhook_id: webhook.id,
      event_type: eventType,
      error: error.message,
    });

    throw error;
  }
}
