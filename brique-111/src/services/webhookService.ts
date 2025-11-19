/**
 * Brique 111 - Merchant Config UI
 * Webhook Service: Management, testing, monitoring, failover
 */

import { pool } from "../db";
import crypto from "crypto";
import fetch from "node-fetch";

export interface WebhookTestResult {
  success: boolean;
  status_code?: number;
  response_time_ms: number;
  error?: string;
}

export class WebhookService {
  /**
   * Test a webhook by sending a test event
   */
  async testWebhook(webhookId: string, merchantId: string): Promise<WebhookTestResult> {
    const startTime = Date.now();

    try {
      // Get webhook details
      const { rows } = await pool.query(
        `SELECT * FROM merchant_webhooks WHERE id = $1 AND merchant_id = $2`,
        [webhookId, merchantId]
      );

      if (rows.length === 0) {
        throw new Error("Webhook not found");
      }

      const webhook = rows[0];

      // Create test payload
      const testPayload = {
        id: "evt_test_" + crypto.randomBytes(16).toString("hex"),
        type: webhook.event_type,
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: "test_" + crypto.randomBytes(8).toString("hex"),
            test: true
          }
        }
      };

      // Sign payload
      const signature = this.signPayload(JSON.stringify(testPayload), webhook.secret);

      // Send test request
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Molam-Signature": signature,
          "X-Molam-Event-Type": webhook.event_type
        },
        body: JSON.stringify(testPayload),
        timeout: 10000 // 10s timeout
      });

      const responseTime = Date.now() - startTime;

      // Update webhook stats
      if (response.ok) {
        await pool.query(
          `UPDATE merchant_webhooks 
           SET last_success_at = now(),
               success_count = success_count + 1,
               avg_response_time_ms = COALESCE((avg_response_time_ms + $1) / 2, $1),
               updated_at = now()
           WHERE id = $2`,
          [responseTime, webhookId]
        );
      } else {
        await pool.query(
          `UPDATE merchant_webhooks 
           SET last_failure_at = now(),
               failure_count = failure_count + 1,
               updated_at = now()
           WHERE id = $1`,
          [webhookId]
        );
      }

      return {
        success: response.ok,
        status_code: response.status,
        response_time_ms: responseTime
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      // Update failure stats
      await pool.query(
        `UPDATE merchant_webhooks 
         SET last_failure_at = now(),
             failure_count = failure_count + 1,
             updated_at = now()
         WHERE id = $1`,
        [webhookId]
      );

      return {
        success: false,
        response_time_ms: responseTime,
        error: error.message
      };
    }
  }

  /**
   * Deliver webhook event with retry logic
   */
  async deliverWebhook(
    webhookId: string,
    eventType: string,
    payload: any,
    retryCount: number = 0,
    maxRetries: number = 3
  ): Promise<boolean> {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM merchant_webhooks WHERE id = $1 AND status = 'active'`,
        [webhookId]
      );

      if (rows.length === 0) {
        return false;
      }

      const webhook = rows[0];
      const payloadStr = JSON.stringify(payload);
      const signature = this.signPayload(payloadStr, webhook.secret);

      const startTime = Date.now();
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Molam-Signature": signature,
          "X-Molam-Event-Type": eventType
        },
        body: payloadStr,
        timeout: 10000
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        // Success
        await pool.query(
          `UPDATE merchant_webhooks 
           SET last_success_at = now(),
               success_count = success_count + 1,
               avg_response_time_ms = COALESCE((avg_response_time_ms + $1) / 2, $1),
               failure_count = 0,
               updated_at = now()
           WHERE id = $2`,
          [responseTime, webhookId]
        );
        return true;
      } else {
        // Failure - try failover if configured
        if (webhook.failover_url && retryCount === 0) {
          return await this.deliverToFailover(webhook, eventType, payload);
        }

        // Retry with exponential backoff
        if (retryCount < maxRetries) {
          const backoffMs = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          return await this.deliverWebhook(webhookId, eventType, payload, retryCount + 1, maxRetries);
        }

        // Max retries reached
        await pool.query(
          `UPDATE merchant_webhooks 
           SET last_failure_at = now(),
               failure_count = failure_count + 1,
               status = CASE WHEN failure_count >= 10 THEN 'error' ELSE status END,
               updated_at = now()
           WHERE id = $1`,
          [webhookId]
        );
        return false;
      }
    } catch (error: any) {
      console.error(`Webhook delivery failed (attempt ${retryCount + 1}):`, error);

      if (retryCount < maxRetries) {
        const backoffMs = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        return await this.deliverWebhook(webhookId, eventType, payload, retryCount + 1, maxRetries);
      }

      await pool.query(
        `UPDATE merchant_webhooks 
         SET last_failure_at = now(),
             failure_count = failure_count + 1,
             updated_at = now()
         WHERE id = $1`,
        [webhookId]
      );

      return false;
    }
  }

  /**
   * Deliver to failover URL
   */
  private async deliverToFailover(webhook: any, eventType: string, payload: any): Promise<boolean> {
    try {
      const payloadStr = JSON.stringify(payload);
      const signature = this.signPayload(payloadStr, webhook.secret);

      const response = await fetch(webhook.failover_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Molam-Signature": signature,
          "X-Molam-Event-Type": eventType,
          "X-Molam-Failover": "true"
        },
        body: payloadStr,
        timeout: 10000
      });

      if (response.ok) {
        console.log(`✅ Webhook delivered to failover: ${webhook.failover_url}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error("Failover delivery failed:", error);
      return false;
    }
  }

  /**
   * Sign webhook payload with HMAC-SHA256
   */
  private signPayload(payload: string, secret: Buffer): string {
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(payload);
    return `sha256=${hmac.digest("hex")}`;
  }

  /**
   * Auto-configure webhooks for a merchant based on their plugins
   */
  async autoConfigureWebhooks(merchantId: string, baseUrl: string): Promise<void> {
    const defaultEvents = [
      "payment.succeeded",
      "payment.failed",
      "refund.issued",
      "charge.disputed"
    ];

    for (const eventType of defaultEvents) {
      const webhookUrl = `${baseUrl}/webhooks/${eventType}`;

      try {
        await pool.query(
          `INSERT INTO merchant_webhooks (merchant_id, event_type, url, secret, auto_configured)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (merchant_id, event_type, url) DO NOTHING`,
          [merchantId, eventType, webhookUrl, crypto.randomBytes(32)]
        );
      } catch (error) {
        console.error(`Failed to auto-configure webhook ${eventType}:`, error);
      }
    }
  }
}

export const webhookService = new WebhookService();

