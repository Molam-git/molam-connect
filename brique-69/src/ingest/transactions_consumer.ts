/**
 * Brique 69 - Analytics Kafka Consumer
 * Consumes wallet transaction events and updates hourly aggregates in real-time
 */

import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { parseISO } from 'date-fns';
import * as dotenv from 'dotenv';
import { query, getRegionForCountry } from '../services/db';
import { getRedisClient, getCached, setCached, incrementFloat, pushToMovingAverage, getMovingAverage } from '../services/redis';
import { TransactionEvent } from '../types';
import { publishAnomalyEvent } from '../services/sira';
import { metricsRegistry, ingestEventsCounter, ingestErrorsCounter } from '../utils/metrics';

dotenv.config();

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'analytics-consumer',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  retry: {
    retries: 8,
    initialRetryTime: 300,
  },
});

let consumer: Consumer | null = null;

export async function startConsumer() {
  consumer = kafka.consumer({
    groupId: process.env.KAFKA_GROUP_ID || 'analytics-consumer-g',
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
  });

  await consumer.connect();
  console.log('✅ Kafka consumer connected');

  const topic = process.env.KAFKA_TOPIC_TRANSACTIONS || 'wallet_txn_created';
  await consumer.subscribe({ topic, fromBeginning: false });
  console.log(`📡 Subscribed to topic: ${topic}`);

  await consumer.run({
    eachMessage: async (payload: EachMessagePayload) => {
      try {
        await handleMessage(payload);
      } catch (error) {
        console.error('Error processing message:', error);
        ingestErrorsCounter.inc({ error_type: 'processing_error' });
      }
    },
  });

  console.log('🚀 Analytics consumer running...');
}

async function handleMessage({ message }: EachMessagePayload) {
  if (!message.value) return;

  const startTime = Date.now();

  try {
    const event: TransactionEvent = JSON.parse(message.value.toString());

    // Normalize event data
    const timestamp = parseISO(event.occurred_at);
    const region = event.region || await getRegionForCountry(event.country || 'UNKNOWN');
    const currency = event.currency || 'USD';
    const amount = Number(event.amount || 0);
    const feeMolam = Number(event.fee_molam || 0);
    const feePartner = Number(event.fee_partner || 0);
    const netRevenue = amount - feeMolam - feePartner;

    // Get FX rate for the day (with Redis cache)
    const day = timestamp.toISOString().slice(0, 10);
    const fxRate = await getFXRateWithCache(day, currency, 'USD');

    // Calculate USD equivalents
    const grossUsd = Number((amount * fxRate).toFixed(6));
    const netUsd = Number((netRevenue * fxRate).toFixed(6));
    const feeMolamUsd = Number((feeMolam * fxRate).toFixed(6));
    const feePartnerUsd = Number((feePartner * fxRate).toFixed(6));

    // Determine transaction status counts
    const isRefund = event.type === 'refund' || event.status === 'refunded';
    const isChargeback = event.type === 'chargeback';
    const isSuccess = event.status === 'succeeded' && !isRefund && !isChargeback;
    const isFailed = event.status === 'failed';
    const isPending = event.status === 'pending';

    // Upsert hourly aggregate using database function
    await query(
      `SELECT upsert_hourly_agg($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
      [
        timestamp, // p_hour
        region,
        event.country || 'UNKNOWN',
        event.merchant_id || null,
        event.agent_id || null,
        event.product_id || null,
        event.payment_method || null,
        currency,
        isSuccess ? amount : 0, // p_gross_local
        isSuccess ? grossUsd : 0, // p_gross_usd
        isSuccess ? netRevenue : 0, // p_net_local
        isSuccess ? netUsd : 0, // p_net_usd
        isSuccess ? feeMolam : 0, // p_fee_molam_local
        isSuccess ? feeMolamUsd : 0, // p_fee_molam_usd
        isSuccess ? feePartner : 0, // p_fee_partner_local
        isSuccess ? feePartnerUsd : 0, // p_fee_partner_usd
        isRefund ? amount : 0, // p_refund_local
        isRefund ? grossUsd : 0, // p_refund_usd
        isChargeback ? amount : 0, // p_chargeback_local
        isChargeback ? grossUsd : 0, // p_chargeback_usd
        1, // p_tx_count
        isSuccess ? 1 : 0, // p_success_count
        isFailed ? 1 : 0, // p_failed_count
        isPending ? 1 : 0, // p_pending_count
      ]
    );

    // Update Redis live counters for real-time dashboard
    await updateLiveCounters(event, amount, netRevenue, feeMolam);

    // Check for anomalies and publish to SIRA if needed
    await checkAnomalies(event, amount, netRevenue, region);

    // Update metrics
    ingestEventsCounter.inc({ event_type: event.type, status: event.status });

    const duration = Date.now() - startTime;
    if (duration > 1000) {
      console.warn(`Slow message processing: ${duration}ms for event ${event.id}`);
    }

  } catch (error) {
    console.error('Error handling transaction event:', error);
    ingestErrorsCounter.inc({ error_type: 'upsert_error' });
    throw error;
  }
}

async function getFXRateWithCache(
  date: string,
  baseCurrency: string,
  quoteCurrency: string = 'USD'
): Promise<number> {
  const cacheKey = `fx:${date}:${baseCurrency}:${quoteCurrency}`;

  const cached = await getCached<number>(cacheKey);
  if (cached !== null) return cached;

  const result = await query<{ rate: string }>(
    'SELECT rate FROM fx_rates WHERE as_of_date = $1 AND base_currency = $2 AND quote_currency = $3',
    [date, baseCurrency, quoteCurrency]
  );

  const rate = result.rows[0]?.rate ? parseFloat(result.rows[0].rate) : 1.0;

  // Cache for 24 hours
  await setCached(cacheKey, rate, 86400);

  return rate;
}

async function updateLiveCounters(
  event: TransactionEvent,
  amount: number,
  netRevenue: number,
  feeMolam: number
) {
  const redis = getRedisClient();
  const ttl = 3600; // 1 hour

  // Merchant-level counters
  if (event.merchant_id) {
    await incrementFloat(`live:merchant:${event.merchant_id}:gross`, amount, ttl);
    await incrementFloat(`live:merchant:${event.merchant_id}:net`, netRevenue, ttl);
    await incrementFloat(`live:merchant:${event.merchant_id}:fees`, feeMolam, ttl);
  }

  // Global counters
  await incrementFloat('live:global:gross', amount, ttl);
  await incrementFloat('live:global:net', netRevenue, ttl);

  // Country counters
  if (event.country) {
    await incrementFloat(`live:country:${event.country}:gross`, amount, ttl);
  }
}

async function checkAnomalies(
  event: TransactionEvent,
  amount: number,
  netRevenue: number,
  region: string
) {
  if (!process.env.SIRA_ENABLED || process.env.SIRA_ENABLED !== 'true') {
    return;
  }

  try {
    // Simple z-score anomaly detection using moving average
    const maKey = `ma:merchant:${event.merchant_id}:hourly`;
    const movingAvg = await getMovingAverage(maKey, 24);

    await pushToMovingAverage(maKey, amount, 24);

    if (movingAvg !== null && movingAvg > 0) {
      const zScore = Math.abs((amount - movingAvg) / movingAvg);

      // If transaction is >3 standard deviations from average, flag as anomaly
      if (zScore > 3) {
        console.log(`⚠️  Anomaly detected: merchant ${event.merchant_id}, z-score: ${zScore.toFixed(2)}`);

        await publishAnomalyEvent({
          merchant_id: event.merchant_id,
          transaction_id: event.id,
          metric: 'transaction_amount',
          value: amount,
          expected: movingAvg,
          deviation: zScore,
          severity: zScore > 5 ? 'critical' : 'warn',
          region,
          timestamp: event.occurred_at,
        });
      }
    }
  } catch (error) {
    console.error('Error in anomaly detection:', error);
    // Don't throw - anomaly detection is non-critical
  }
}

export async function stopConsumer() {
  if (consumer) {
    await consumer.disconnect();
    console.log('Kafka consumer disconnected');
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await stopConsumer();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await stopConsumer();
  process.exit(0);
});

// Start consumer if run directly
if (require.main === module) {
  startConsumer().catch((error) => {
    console.error('Failed to start consumer:', error);
    process.exit(1);
  });
}
