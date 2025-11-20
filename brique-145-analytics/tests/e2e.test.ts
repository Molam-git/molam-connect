/**
 * BRIQUE 145 — End-to-End Tests
 * Tests complete flow: Kafka → ClickHouse → API → WebSocket
 */
import { Kafka } from 'kafkajs';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const API_URL = process.env.API_URL || 'http://localhost:3002';
const WS_URL = process.env.WS_URL || 'http://localhost:3003';
const PRIVATE_KEY = process.env.TEST_PRIVATE_KEY || '';

function generateTestToken(): string {
  return jwt.sign(
    {
      sub: 'test_e2e_user',
      tenant_id: 'tenant_e2e',
      roles: ['pay_admin']
    },
    PRIVATE_KEY,
    { algorithm: 'RS256', expiresIn: '1h' }
  );
}

describe('Analytics E2E Flow', () => {
  let kafka: Kafka;
  let producer: any;
  let socket: Socket;
  let token: string;

  beforeAll(async () => {
    token = generateTestToken();

    // Setup Kafka producer
    kafka = new Kafka({
      clientId: 'test-e2e',
      brokers: KAFKA_BROKERS
    });

    producer = kafka.producer();
    await producer.connect();
  });

  afterAll(async () => {
    if (producer) {
      await producer.disconnect();
    }
    if (socket) {
      socket.close();
    }
  });

  it('should process event through complete pipeline', async () => {
    const testEventId = `txn_e2e_${Date.now()}`;

    // Step 1: Produce event to Kafka
    await producer.send({
      topic: 'wallet_txn_created',
      messages: [
        {
          key: testEventId,
          value: JSON.stringify({
            id: testEventId,
            amount: 25000,
            currency: 'XOF',
            fee: 500,
            status: 'succeeded',
            country: 'SN',
            city: 'Dakar',
            timestamp: new Date().toISOString()
          })
        }
      ]
    });

    console.log(`✅ Published event ${testEventId} to Kafka`);

    // Step 2: Wait for consumer to process (buffer + insert time)
    await new Promise(resolve => setTimeout(resolve, 8000));

    // Step 3: Verify data appears in API
    const apiResponse = await request(API_URL)
      .get('/api/analytics/overview?country=SN')
      .set('Authorization', `Bearer ${token}`);

    expect(apiResponse.status).toBe(200);
    expect(apiResponse.body.gmv).toBeGreaterThan(0);
    expect(apiResponse.body.tx_count).toBeGreaterThan(0);

    console.log('✅ Data verified in API:', apiResponse.body);
  }, 30000);

  it('should receive real-time updates via WebSocket', (done) => {
    const testEventId = `txn_ws_${Date.now()}`;

    // Step 1: Connect WebSocket
    socket = io(WS_URL, {
      auth: { token }
    });

    socket.on('connect', () => {
      console.log('✅ WebSocket connected');

      // Subscribe to zone updates
      socket.emit('subscribe', { zone: 'CEDEAO' });
    });

    socket.on('subscribed', () => {
      console.log('✅ Subscribed to CEDEAO updates');

      // Step 2: Produce event
      producer.send({
        topic: 'wallet_txn_created',
        messages: [
          {
            key: testEventId,
            value: JSON.stringify({
              id: testEventId,
              amount: 15000,
              currency: 'XOF',
              fee: 300,
              status: 'succeeded',
              country: 'SN',
              city: 'Dakar',
              timestamp: new Date().toISOString()
            })
          }
        ]
      }).then(() => {
        console.log(`✅ Published event ${testEventId} for WebSocket test`);
      });
    });

    // Step 3: Wait for delta update
    socket.on('analytics:delta', (delta) => {
      console.log('✅ Received WebSocket delta:', delta);

      expect(delta).toHaveProperty('zone');
      expect(delta).toHaveProperty('country');
      expect(delta).toHaveProperty('amount');

      socket.close();
      done();
    });

    socket.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
      done(error);
    });

    // Timeout after 15 seconds
    setTimeout(() => {
      socket.close();
      done(new Error('WebSocket delta not received within timeout'));
    }, 15000);
  }, 20000);

  it('should aggregate data correctly in ClickHouse', async () => {
    // Query timeseries to verify materialized views are working
    const response = await request(API_URL)
      .get('/api/analytics/timeseries?granularity=hour&country=SN')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);

    if (response.body.length > 0) {
      const dataPoint = response.body[0];
      expect(dataPoint).toHaveProperty('bucket_ts');
      expect(dataPoint).toHaveProperty('gmv');
      expect(dataPoint).toHaveProperty('tx_count');
      expect(typeof dataPoint.gmv).toBe('number');
      expect(typeof dataPoint.tx_count).toBe('number');

      console.log('✅ Aggregated data sample:', dataPoint);
    }
  });

  it('should handle high-volume batch processing', async () => {
    const batchSize = 50;
    const events = Array.from({ length: batchSize }, (_, i) => ({
      key: `txn_batch_${Date.now()}_${i}`,
      value: JSON.stringify({
        id: `txn_batch_${Date.now()}_${i}`,
        amount: Math.floor(Math.random() * 50000) + 5000,
        currency: 'XOF',
        fee: Math.floor(Math.random() * 1000) + 100,
        status: 'succeeded',
        country: ['SN', 'ML', 'CI', 'BF'][Math.floor(Math.random() * 4)],
        timestamp: new Date().toISOString()
      })
    }));

    // Send batch
    const startTime = Date.now();
    await producer.send({
      topic: 'wallet_txn_created',
      messages: events
    });

    const produceTime = Date.now() - startTime;
    console.log(`✅ Produced ${batchSize} events in ${produceTime}ms`);

    expect(produceTime).toBeLessThan(5000); // Should complete within 5s

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Verify batch was processed
    const response = await request(API_URL)
      .get('/api/analytics/overview?zone=CEDEAO')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.tx_count).toBeGreaterThanOrEqual(batchSize);

    console.log('✅ Batch processed successfully, total transactions:', response.body.tx_count);
  }, 30000);
});
