// =====================================================================
// Event Publisher
// =====================================================================
// Publishes events to Kafka or webhook endpoints
// Date: 2025-11-12
// =====================================================================

import { Kafka, Producer } from 'kafkajs';
import { pool } from '../db';

// Kafka configuration
const kafka = new Kafka({
  clientId: 'molam-preview-events',
  brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
  retry: {
    initialRetryTime: 300,
    retries: 8,
  },
});

let producer: Producer | null = null;

/**
 * Get or create Kafka producer
 */
async function getProducer(): Promise<Producer> {
  if (!producer) {
    producer = kafka.producer({
      idempotent: true,
      maxInFlightRequests: 5,
      transactionTimeout: 30000,
    });
    await producer.connect();
    console.log('Kafka producer connected');
  }
  return producer;
}

/**
 * Publish event to Kafka
 */
export async function publishEvent(
  tenantType: string,
  tenantId: string,
  eventType: string,
  data: Record<string, any>
): Promise<void> {
  const event = {
    event_id: `${eventType}_${tenantId}_${Date.now()}`,
    event_type: eventType,
    tenant_type: tenantType,
    tenant_id: tenantId,
    data,
    timestamp: new Date().toISOString(),
  };

  try {
    const kafkaProducer = await getProducer();
    await kafkaProducer.send({
      topic: 'overage_preview_events',
      messages: [
        {
          key: tenantId,
          value: JSON.stringify(event),
          headers: {
            'event-type': eventType,
            'tenant-type': tenantType,
          },
        },
      ],
    });

    console.log(`Event published: ${eventType} for tenant ${tenantId}`);
  } catch (error) {
    console.error('Failed to publish event to Kafka:', error);

    // Fallback: Store event in database for retry
    await storeEventForRetry(event);
  }
}

/**
 * Store event in database for retry
 */
async function storeEventForRetry(event: any): Promise<void> {
  try {
    await pool.query(
      `
      INSERT INTO preview_events_retry (
        event_id,
        event_type,
        tenant_type,
        tenant_id,
        data,
        retry_count,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, 0, NOW())
      ON CONFLICT (event_id) DO NOTHING
      `,
      [
        event.event_id,
        event.event_type,
        event.tenant_type,
        event.tenant_id,
        JSON.stringify(event.data),
      ]
    );
  } catch (error) {
    console.error('Failed to store event for retry:', error);
  }
}

/**
 * Send webhook notification
 */
export async function sendWebhook(
  url: string,
  payload: Record<string, any>
): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Molam-Preview-Webhook/1.0',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed with status ${response.status}`);
    }

    console.log(`Webhook sent successfully to ${url}`);
    return true;
  } catch (error) {
    console.error(`Failed to send webhook to ${url}:`, error);
    return false;
  }
}

/**
 * Graceful shutdown
 */
export async function shutdownPublisher(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    console.log('Kafka producer disconnected');
    producer = null;
  }
}

// Cleanup on process termination
process.on('SIGINT', shutdownPublisher);
process.on('SIGTERM', shutdownPublisher);
