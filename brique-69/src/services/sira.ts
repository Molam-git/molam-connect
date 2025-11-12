/**
 * SIRA Integration Service
 * Publishes anomaly events to SIRA for deeper analysis
 */

import { Kafka, Producer } from 'kafkajs';

let producer: Producer | null = null;

interface AnomalyEvent {
  merchant_id: string;
  transaction_id: string;
  metric: string;
  value: number;
  expected: number;
  deviation: number;
  severity: 'info' | 'warn' | 'critical';
  region: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export async function initSIRAProducer() {
  if (!process.env.SIRA_ENABLED || process.env.SIRA_ENABLED !== 'true') {
    console.log('ℹ️  SIRA integration disabled');
    return;
  }

  const kafka = new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || 'analytics-sira',
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  });

  producer = kafka.producer();
  await producer.connect();
  console.log('✅ SIRA Kafka producer connected');
}

export async function publishAnomalyEvent(event: AnomalyEvent) {
  if (!producer) {
    await initSIRAProducer();
  }

  if (!producer) {
    console.warn('SIRA producer not initialized, skipping anomaly event');
    return;
  }

  const topic = process.env.KAFKA_TOPIC_ANOMALIES || 'analytics.anomaly';

  try {
    await producer.send({
      topic,
      messages: [
        {
          key: event.merchant_id,
          value: JSON.stringify({
            ...event,
            source: 'analytics',
            detected_at: new Date().toISOString(),
          }),
        },
      ],
    });

    console.log(`📤 Anomaly event published to SIRA: ${event.merchant_id}`);
  } catch (error) {
    console.error('Error publishing anomaly event to SIRA:', error);
  }
}

export async function closeSIRAProducer() {
  if (producer) {
    await producer.disconnect();
    console.log('SIRA producer disconnected');
  }
}
