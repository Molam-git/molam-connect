/**
 * BRIQUE 145 — Analytics Consumer
 * Kafka → ClickHouse high-throughput event ingestion
 */
import { Kafka } from "kafkajs";
import { createClient } from "@clickhouse/client";
import Redis from "ioredis";
import dotenv from "dotenv";
import { mapCountryToZone, normalizeCity } from "./utils";
import { metrics } from "./metrics";

dotenv.config();

const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL || "http://clickhouse:8123",
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || ""
});

const kafka = new Kafka({
  clientId: "analytics-consumer",
  brokers: (process.env.KAFKA_BROKERS || "").split(",")
});

const consumer = kafka.consumer({
  groupId: process.env.GROUP_ID || "analytics-consumer-g"
});

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "100");
let eventBuffer: any[] = [];

async function processBatch(events: any[]) {
  if (events.length === 0) return;

  const rows = events.map(evt => ({
    event_time: evt.occurred_at || new Date().toISOString(),
    event_id: evt.id || evt.transaction_id || "",
    tenant_id: evt.merchant_id || evt.user_id || "",
    tenant_type: evt.merchant_id ? "merchant" : "user",
    zone: mapCountryToZone(evt.country),
    region: evt.region || "",
    country: evt.country || "UNKNOWN",
    city: normalizeCity(evt.city),
    currency: evt.currency || "USD",
    amount: Number(evt.amount) || 0,
    fee_molam: Number(evt.fee_molam) || 0,
    status: evt.status || "unknown",
    event_type: evt.type || "payment",
    metadata: JSON.stringify(evt.metadata || {})
  }));

  try {
    await clickhouse.insert({
      table: "analytics_events_raw",
      values: rows,
      format: "JSONEachRow"
    });

    metrics.eventsProcessed.inc(rows.length);

    // Publish to Redis for WebSocket streaming
    for (const row of rows) {
      await redis.publish("analytics.delta", JSON.stringify({
        bucket_ts: row.event_time,
        zone: row.zone,
        country: row.country,
        city: row.city,
        currency: row.currency,
        amount: row.amount
      }));
    }

    console.log(`✅ Inserted ${rows.length} events into ClickHouse`);
  } catch (error: any) {
    console.error("❌ Batch insert failed:", error.message);
    metrics.errors.inc({ type: "insert_failed" });
  }
}

async function flushBuffer() {
  if (eventBuffer.length > 0) {
    const batch = [...eventBuffer];
    eventBuffer = [];
    await processBatch(batch);
  }
}

async function start() {
  await consumer.connect();
  await consumer.subscribe({
    topics: ["wallet_txn_created", "payout.settled", "invoice.paid"],
    fromBeginning: false
  });

  console.log("🚀 Analytics consumer started");

  // Flush buffer every 5 seconds
  setInterval(flushBuffer, 5000);

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (!message.value) return;

      try {
        const evt = JSON.parse(message.value.toString());

        // Only process successful transactions
        if (evt.status !== "succeeded") return;

        eventBuffer.push(evt);

        // Flush when batch is full
        if (eventBuffer.length >= BATCH_SIZE) {
          await flushBuffer();
        }

        metrics.kafkaMessagesReceived.inc({ topic });
      } catch (error: any) {
        console.error("❌ Message processing error:", error.message);
        metrics.errors.inc({ type: "parse_error" });
      }
    }
  });
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("🛑 SIGTERM received, flushing buffer and shutting down...");
  await flushBuffer();
  await consumer.disconnect();
  await redis.quit();
  process.exit(0);
});

start().catch(err => {
  console.error("💥 Fatal error:", err);
  process.exit(1);
});