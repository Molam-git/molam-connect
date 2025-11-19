// ============================================================================
// KPI Worker - Real-time KPI updates via Kafka
// ============================================================================

import { Kafka, EachMessagePayload } from "kafkajs";
import { pool } from "../utils/db";
import { logger } from "../utils/logger";
import { publishEvent } from "../services/webhookPublisher";

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || "localhost:9092").split(",");
const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || "kpi-worker";
const KAFKA_GROUP_ID = process.env.KAFKA_GROUP_ID || "kpi-worker-g";

const kafka = new Kafka({
  clientId: KAFKA_CLIENT_ID,
  brokers: KAFKA_BROKERS,
});

/**
 * Start KPI worker
 */
export async function startKPIWorker(): Promise<void> {
  const consumer = kafka.consumer({ groupId: KAFKA_GROUP_ID });

  await consumer.connect();
  logger.info("KPI worker connected to Kafka");

  await consumer.subscribe({
    topics: [
      "wallet_txn_created",
      "wallet_txn_succeeded",
      "refund_created",
      "payout_created",
      "dispute_created",
    ],
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async (payload: EachMessagePayload) => {
      try {
        await handleMessage(payload);
      } catch (error: any) {
        logger.error("Failed to process message", {
          topic: payload.topic,
          partition: payload.partition,
          offset: payload.message.offset,
          error: error.message,
        });
      }
    },
  });

  logger.info("KPI worker started");
}

/**
 * Handle Kafka message
 */
async function handleMessage(payload: EachMessagePayload): Promise<void> {
  const { topic, message } = payload;

  if (!message.value) return;

  const event = JSON.parse(message.value.toString());

  logger.debug("Processing event", { topic, event_id: event.id });

  switch (topic) {
    case "wallet_txn_created":
    case "wallet_txn_succeeded":
      await handleTransactionEvent(event);
      break;

    case "refund_created":
      await handleRefundEvent(event);
      break;

    case "payout_created":
      await handlePayoutEvent(event);
      break;

    case "dispute_created":
      await handleDisputeEvent(event);
      break;

    default:
      logger.warn("Unknown topic", { topic });
  }
}

/**
 * Handle transaction event - increment sales KPI
 */
async function handleTransactionEvent(event: any): Promise<void> {
  const { merchant_id, amount, currency, type, status } = event;

  if (!merchant_id || status !== "succeeded") return;

  // Increment today's sales
  await pool.query(
    `INSERT INTO merchant_kpis_cache(merchant_id, period, kpi_key, value, currency, txn_count, computed_at)
     VALUES($1, 'today', 'sales', $2, $3, 1, now())
     ON CONFLICT (merchant_id, period, kpi_key, currency)
     DO UPDATE SET
       value = merchant_kpis_cache.value + EXCLUDED.value,
       txn_count = merchant_kpis_cache.txn_count + EXCLUDED.txn_count,
       computed_at = now()`,
    [merchant_id, amount, currency]
  );

  // Increment MTD sales
  await pool.query(
    `INSERT INTO merchant_kpis_cache(merchant_id, period, kpi_key, value, currency, txn_count, computed_at)
     VALUES($1, 'mtd', 'sales', $2, $3, 1, now())
     ON CONFLICT (merchant_id, period, kpi_key, currency)
     DO UPDATE SET
       value = merchant_kpis_cache.value + EXCLUDED.value,
       txn_count = merchant_kpis_cache.txn_count + EXCLUDED.txn_count,
       computed_at = now()`,
    [merchant_id, amount, currency]
  );

  logger.info("Sales KPI updated", { merchant_id, amount, currency });

  // Check for anomalies
  await checkAnomalies(merchant_id);
}

/**
 * Handle refund event - increment refunds KPI
 */
async function handleRefundEvent(event: any): Promise<void> {
  const { merchant_id, amount, currency } = event;

  if (!merchant_id) return;

  // Increment today's refunds
  await pool.query(
    `INSERT INTO merchant_kpis_cache(merchant_id, period, kpi_key, value, currency, txn_count, computed_at)
     VALUES($1, 'today', 'refunds', $2, $3, 1, now())
     ON CONFLICT (merchant_id, period, kpi_key, currency)
     DO UPDATE SET
       value = merchant_kpis_cache.value + EXCLUDED.value,
       txn_count = merchant_kpis_cache.txn_count + EXCLUDED.txn_count,
       computed_at = now()`,
    [merchant_id, amount, currency]
  );

  logger.info("Refunds KPI updated", { merchant_id, amount, currency });
}

/**
 * Handle payout event
 */
async function handlePayoutEvent(event: any): Promise<void> {
  const { merchant_id } = event;

  if (!merchant_id) return;

  // Publish webhook
  await publishEvent(merchant_id, "payout.created", event);

  logger.info("Payout event handled", { merchant_id });
}

/**
 * Handle dispute event - create alert
 */
async function handleDisputeEvent(event: any): Promise<void> {
  const { merchant_id, transaction_id, amount, currency, type, reason } = event;

  if (!merchant_id) return;

  // Create alert
  await pool.query(
    `INSERT INTO merchant_alerts(merchant_id, alert_type, severity, title, description, related_transactions, status)
     VALUES($1, 'dispute_created', 'warning', $2, $3, $4, 'active')`,
    [
      merchant_id,
      `New ${type}: ${reason}`,
      `A ${type} has been filed for ${amount} ${currency}`,
      [transaction_id],
    ]
  );

  // Publish webhook
  await publishEvent(merchant_id, "dispute.created", event);

  logger.info("Dispute alert created", { merchant_id, type });
}

/**
 * Check for anomalies and create alerts
 */
async function checkAnomalies(merchantId: string): Promise<void> {
  // Get today's sales vs yesterday's sales
  const { rows } = await pool.query(
    `SELECT
      SUM(value) FILTER (WHERE period = 'today') as today_sales,
      SUM(value) FILTER (WHERE period = 'yesterday') as yesterday_sales
     FROM merchant_kpis_cache
     WHERE merchant_id = $1 AND kpi_key = 'sales'`,
    [merchantId]
  );

  const todaySales = parseFloat(rows[0]?.today_sales || "0");
  const yesterdaySales = parseFloat(rows[0]?.yesterday_sales || "0");

  // If today's sales are 3x yesterday's, create alert
  if (yesterdaySales > 0 && todaySales > yesterdaySales * 3) {
    await pool.query(
      `INSERT INTO merchant_alerts(merchant_id, alert_type, severity, title, description, sira_recommendations, status)
       VALUES($1, 'unusual_sales_volume', 'warning', $2, $3, $4, 'active')
       ON CONFLICT DO NOTHING`,
      [
        merchantId,
        "Unusual Sales Volume Detected",
        `Today's sales (${todaySales}) are significantly higher than yesterday (${yesterdaySales})`,
        ["Review recent transactions", "Verify with merchant", "Check for fraud patterns"],
      ]
    );

    logger.warn("Anomaly detected", { merchant_id: merchantId, today_sales: todaySales });
  }
}

/**
 * Refresh materialized view periodically
 */
export async function refreshMaterializedView(): Promise<void> {
  try {
    await pool.query("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_merchant_tx_agg");
    logger.info("Materialized view refreshed");
  } catch (error: any) {
    logger.error("Failed to refresh materialized view", { error: error.message });
  }
}

// Run if executed directly
if (require.main === module) {
  startKPIWorker().catch((error) => {
    logger.error("KPI worker crashed", { error: error.message });
    process.exit(1);
  });

  // Refresh materialized view every 5 minutes
  setInterval(refreshMaterializedView, 5 * 60 * 1000);
}
