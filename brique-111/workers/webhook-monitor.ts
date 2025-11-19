/**
 * Brique 111 - Merchant Config UI
 * Webhook Monitor Worker: Monitors webhook health and triggers alerts
 */

import { pool } from "../src/db";
import { webhookService } from "../src/services/webhookService";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    target: "pino-pretty",
    options: { colorize: true }
  }
});

/**
 * Monitor webhook health
 */
async function monitorWebhooks() {
  logger.info("📡 Monitoring webhook health...");

  try {
    // Get webhooks with recent failures
    const { rows } = await pool.query(
      `SELECT * FROM merchant_webhooks 
       WHERE status = 'active' 
         AND (last_failure_at > last_success_at OR last_success_at IS NULL)
         AND failure_count > 0
       ORDER BY failure_count DESC`
    );

    for (const webhook of rows) {
      logger.warn({
        webhook_id: webhook.id,
        event_type: webhook.event_type,
        failure_count: webhook.failure_count
      }, "Webhook health issue detected");

      // Test webhook
      const result = await webhookService.testWebhook(webhook.id, webhook.merchant_id);

      if (!result.success) {
        logger.error({
          webhook_id: webhook.id,
          error: result.error
        }, "Webhook test failed");
      }
    }

    logger.info(`✅ Monitored ${rows.length} webhooks`);
  } catch (error: any) {
    logger.error({ error }, "❌ Webhook monitoring failed");
  }
}

// Run every 5 minutes
setInterval(monitorWebhooks, 5 * 60 * 1000);

// Run immediately
monitorWebhooks();

logger.info("🔄 Webhook monitor worker started (runs every 5 minutes)");


