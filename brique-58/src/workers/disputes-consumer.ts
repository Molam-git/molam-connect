import { Kafka } from 'kafkajs';
import { createDispute } from '../services/disputesService';
import { normalizeNetworkDispute, computeNetworkDeadline } from '../utils/networks';
import fetch from 'node-fetch';

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'disputes-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});

const WEBHOOKS_URL = process.env.WEBHOOKS_URL || 'http://localhost:8045';

/**
 * Disputes Consumer Worker
 * Ingests dispute notifications from network connectors via Kafka
 */
async function start() {
  const consumer = kafka.consumer({
    groupId: process.env.KAFKA_GROUP_ID || 'disputes-consumer-group',
  });

  await consumer.connect();
  console.log('[DisputesConsumer] Connected to Kafka');

  await consumer.subscribe({
    topics: ['network.dispute.created', 'network.dispute.updated'],
    fromBeginning: false,
  });

  console.log('[DisputesConsumer] Subscribed to topics: network.dispute.created, network.dispute.updated');

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        const raw = JSON.parse(message.value!.toString());
        console.log(`[DisputesConsumer] Received message from ${topic}:`, raw.reference || raw.dispute_id);

        if (topic === 'network.dispute.created') {
          await handleDisputeCreated(raw);
        } else if (topic === 'network.dispute.updated') {
          await handleDisputeUpdated(raw);
        }
      } catch (error: any) {
        console.error('[DisputesConsumer] Error processing message:', error.message);
        // TODO: Send to DLQ (dead letter queue) for manual review
      }
    },
  });
}

/**
 * Handle new dispute creation from network
 */
async function handleDisputeCreated(raw: any) {
  const normalized = normalizeNetworkDispute(raw);
  const deadline = computeNetworkDeadline(raw);

  // Create dispute (idempotent by dispute_ref)
  const dispute = await createDispute({
    dispute_ref: normalized.dispute_ref,
    origin: 'network',
    origin_details: raw,
    payment_id: normalized.payment_id || undefined,
    merchant_id: normalized.merchant_id,
    customer_id: normalized.customer_id || undefined,
    amount: normalized.amount,
    currency: normalized.currency,
    country: normalized.country || undefined,
    reason_code: normalized.reason_code,
    reason_description: normalized.reason_description || undefined,
    network: normalized.network,
    network_deadline: deadline,
    actorId: 'system',
  });

  console.log(`[DisputesConsumer] Created dispute ${dispute.id} (${dispute.dispute_ref})`);

  // Publish webhook to merchant
  try {
    await fetch(`${WEBHOOKS_URL}/api/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: dispute.merchant_id,
        event_type: 'dispute.created',
        payload: {
          dispute_id: dispute.id,
          dispute_ref: dispute.dispute_ref,
          amount: dispute.amount,
          currency: dispute.currency,
          reason_code: dispute.reason_code,
          network_deadline: dispute.network_deadline,
        },
      }),
    });
  } catch (error: any) {
    console.error('[DisputesConsumer] Failed to publish webhook:', error.message);
  }
}

/**
 * Handle dispute update from network
 */
async function handleDisputeUpdated(raw: any) {
  const normalized = normalizeNetworkDispute(raw);

  // Update existing dispute status
  const { pool } = await import('../utils/db');

  const { rows: disputes } = await pool.query('SELECT * FROM disputes WHERE dispute_ref = $1', [normalized.dispute_ref]);

  if (disputes.length === 0) {
    console.warn(`[DisputesConsumer] Dispute not found for update: ${normalized.dispute_ref}`);
    return;
  }

  const dispute = disputes[0];

  // Update status
  await pool.query(
    'UPDATE disputes SET status = $1, network_response = $2, updated_at = NOW() WHERE id = $3',
    [normalized.status, JSON.stringify(raw), dispute.id]
  );

  // Create event
  await pool.query(
    `INSERT INTO dispute_events (dispute_id, actor, actor_type, action, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [dispute.id, 'system', 'network', 'network_update', JSON.stringify(raw)]
  );

  console.log(`[DisputesConsumer] Updated dispute ${dispute.id}: ${normalized.status}`);

  // Publish webhook
  try {
    await fetch(`${WEBHOOKS_URL}/api/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: dispute.merchant_id,
        event_type: 'dispute.updated',
        payload: {
          dispute_id: dispute.id,
          dispute_ref: dispute.dispute_ref,
          status: normalized.status,
        },
      }),
    });
  } catch (error: any) {
    console.error('[DisputesConsumer] Failed to publish webhook:', error.message);
  }
}

// Start consumer
start().catch((error) => {
  console.error('[DisputesConsumer] Fatal error:', error);
  process.exit(1);
});
