/**
 * BRIQUE 140 — Kafka consumer for API usage ingestion
 * Consumes api.usage events and writes to DB + rollups
 */

import { Kafka } from 'kafkajs';
import { pool } from '../db';
import dotenv from 'dotenv';

dotenv.config();

const kafka = new Kafka({
  clientId: 'dev-usage-ingest',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});

async function run() {
  const consumer = kafka.consumer({ groupId: 'dev-usage-ingest-g' });

  await consumer.connect();
  console.log('[UsageIngest] Connected to Kafka');

  await consumer.subscribe({ topic: 'api.usage', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      try {
        const evt = JSON.parse(message.value.toString());

        // Insert raw event
        await pool.query(
          `INSERT INTO api_usage_events (key_id, endpoint, method, status_code, bytes, latency_ms, country, occurred_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            evt.key_id,
            evt.endpoint,
            evt.method,
            evt.status_code,
            evt.bytes || 0,
            evt.latency_ms || 0,
            evt.country || null,
            evt.timestamp || new Date(),
          ]
        );

        // Upsert daily rollup
        const day = new Date(evt.timestamp || Date.now())
          .toISOString()
          .slice(0, 10);
        const isError =
          evt.status_code >= 400 && evt.status_code < 600 ? 1 : 0;

        await pool.query(
          `INSERT INTO api_usage_rollups_day (key_id, day, calls, errors, bytes, avg_latency_ms)
           VALUES ($1, $2, 1, $3, $4, $5)
           ON CONFLICT (key_id, day)
           DO UPDATE SET
             calls = api_usage_rollups_day.calls + 1,
             errors = api_usage_rollups_day.errors + EXCLUDED.errors,
             bytes = api_usage_rollups_day.bytes + EXCLUDED.bytes,
             avg_latency_ms = CASE
               WHEN api_usage_rollups_day.calls = 0 THEN EXCLUDED.avg_latency_ms
               ELSE ((api_usage_rollups_day.avg_latency_ms * api_usage_rollups_day.calls) + EXCLUDED.avg_latency_ms) / (api_usage_rollups_day.calls + 1)
             END`,
          [evt.key_id, day, isError, evt.bytes || 0, evt.latency_ms || 0]
        );

        console.log(`[UsageIngest] Processed event for key: ${evt.key_id}`);
      } catch (error) {
        console.error('[UsageIngest] Error processing message:', error);
      }
    },
  });
}

run().catch((err) => {
  console.error('[UsageIngest] Fatal error:', err);
  process.exit(1);
});
