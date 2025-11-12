import { Pool } from 'pg';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { computeFeatures, flattenFeatures } from '../lib/featureUtils';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'subscription.events';
const KAFKA_GROUP_ID = process.env.KAFKA_GROUP_ID || 'sira-feature-ingest';

interface SubscriptionEvent {
  id: string;
  merchant_id: string;
  user_id: string;
  type: string; // 'payment_succeeded', 'payment_failed', 'login', 'cancel', 'plan_change'
  payload: any;
  occurred_at: string;
}

/**
 * Process a single subscription event
 * 1. Store raw event
 * 2. Update feature store
 */
async function processEvent(event: SubscriptionEvent): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Insert raw event (idempotent with ON CONFLICT)
    await client.query(
      `INSERT INTO subscription_events_raw(id, merchant_id, user_id, event_type, payload, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [event.id, event.merchant_id, event.user_id, event.type, JSON.stringify(event.payload), event.occurred_at]
    );

    // 2. Update feature snapshot (daily aggregation)
    const snapshotDate = new Date(event.occurred_at).toISOString().slice(0, 10);

    // Compute incremental features from event
    const features = await computeFeatures(event, client);
    const flatFeatures = flattenFeatures(features);

    // Upsert feature snapshot (merge with existing features for the day)
    await client.query(
      `INSERT INTO subscription_features(user_id, merchant_id, snapshot_date, features)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, merchant_id, snapshot_date)
       DO UPDATE SET
         features = subscription_features.features || EXCLUDED.features,
         updated_at = NOW()`,
      [event.user_id, event.merchant_id, snapshotDate, JSON.stringify(flatFeatures)]
    );

    await client.query('COMMIT');

    console.log(
      `[Feature Ingest] ✓ Processed event: user=${event.user_id}, type=${event.type}, date=${snapshotDate}`
    );
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error(`[Feature Ingest] ✗ Error processing event:`, error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Start Kafka consumer
 */
async function startKafkaConsumer(): Promise<void> {
  console.log(`[Feature Ingest] Starting Kafka consumer...`);
  console.log(`[Feature Ingest] Brokers: ${KAFKA_BROKERS.join(', ')}`);
  console.log(`[Feature Ingest] Topic: ${KAFKA_TOPIC}`);
  console.log(`[Feature Ingest] Group: ${KAFKA_GROUP_ID}`);

  const kafka = new Kafka({
    clientId: 'sira-feature-ingest',
    brokers: KAFKA_BROKERS,
  });

  const consumer: Consumer = kafka.consumer({ groupId: KAFKA_GROUP_ID });

  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }: EachMessagePayload) => {
      try {
        const event: SubscriptionEvent = JSON.parse(message.value!.toString());
        await processEvent(event);
      } catch (error: any) {
        console.error(`[Feature Ingest] Failed to process message from ${topic}:${partition}:`, error.message);
        // In production: send to dead letter queue
      }
    },
  });

  console.log(`[Feature Ingest] Consumer running and waiting for events...`);
}

/**
 * Graceful shutdown
 */
async function shutdown(): Promise<void> {
  console.log('[Feature Ingest] Shutting down gracefully...');
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start worker
if (require.main === module) {
  startKafkaConsumer().catch((error) => {
    console.error('[Feature Ingest] Fatal error:', error);
    process.exit(1);
  });
}

export { processEvent, startKafkaConsumer };
