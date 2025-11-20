/**
 * Brique 118: Jest Unit Tests - Mock Sandbox Server
 * Tests unitaires pour le serveur sandbox déterministe
 */

import request from 'supertest';
import app from '../../mock-sandbox/server';

describe('Mock Sandbox Server - Unit Tests', () => {
  describe('GET /healthz', () => {
    it('should return health check', async () => {
      const res = await request(app).get('/healthz');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('timestamp');
    });

    it('should return ISO timestamp', async () => {
      const res = await request(app).get('/healthz');

      const timestamp = new Date(res.body.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.toISOString()).toBe(res.body.timestamp);
    });
  });

  describe('POST /v1/payments', () => {
    it('should create payment with valid data', async () => {
      const paymentData = {
        amount: 5000,
        currency: 'XOF',
        method: 'wallet'
      };

      const res = await request(app)
        .post('/v1/payments')
        .send(paymentData);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
      expect(res.body.id).toMatch(/^pay_test_/);
      expect(res.body).toHaveProperty('status', 'succeeded');
      expect(res.body).toHaveProperty('amount', 5000);
      expect(res.body).toHaveProperty('currency', 'XOF');
      expect(res.body).toHaveProperty('method', 'wallet');
      expect(res.body).toHaveProperty('created_at');
    });

    it('should use default values for missing fields', async () => {
      const res = await request(app)
        .post('/v1/payments')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(0);
      expect(res.body.currency).toBe('XOF');
      expect(res.body.method).toBe('wallet');
    });

    it('should capture idempotency key from header', async () => {
      const idempotencyKey = 'test-key-12345';

      const res = await request(app)
        .post('/v1/payments')
        .set('Idempotency-Key', idempotencyKey)
        .send({ amount: 1000, currency: 'EUR' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('idempotency_key', idempotencyKey);
    });

    it('should use "none" if no idempotency key provided', async () => {
      const res = await request(app)
        .post('/v1/payments')
        .send({ amount: 1000 });

      expect(res.body).toHaveProperty('idempotency_key', 'none');
    });

    it('should generate unique payment IDs', async () => {
      const res1 = await request(app)
        .post('/v1/payments')
        .send({ amount: 1000 });

      const res2 = await request(app)
        .post('/v1/payments')
        .send({ amount: 1000 });

      expect(res1.body.id).not.toBe(res2.body.id);
    });

    it('should handle different currencies', async () => {
      const currencies = ['XOF', 'EUR', 'USD', 'GNF', 'XAF'];

      for (const currency of currencies) {
        const res = await request(app)
          .post('/v1/payments')
          .send({ amount: 1000, currency });

        expect(res.status).toBe(200);
        expect(res.body.currency).toBe(currency);
      }
    });
  });

  describe('GET /v1/payments/:id', () => {
    it('should retrieve payment by ID', async () => {
      const paymentId = 'pay_test_12345';

      const res = await request(app).get(`/v1/payments/${paymentId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', paymentId);
      expect(res.body).toHaveProperty('status', 'succeeded');
      expect(res.body).toHaveProperty('amount', 5000);
      expect(res.body).toHaveProperty('currency', 'XOF');
      expect(res.body).toHaveProperty('created_at');
    });

    it('should return payment for any ID (mock behavior)', async () => {
      const randomIds = ['pay_abc', 'pay_xyz', 'pay_123'];

      for (const id of randomIds) {
        const res = await request(app).get(`/v1/payments/${id}`);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(id);
      }
    });
  });

  describe('POST /v1/refunds', () => {
    it('should create refund with valid data', async () => {
      const refundData = {
        payment_id: 'pay_123456',
        amount: 2500
      };

      const res = await request(app)
        .post('/v1/refunds')
        .send(refundData);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
      expect(res.body.id).toMatch(/^ref_test_/);
      expect(res.body).toHaveProperty('payment_id', 'pay_123456');
      expect(res.body).toHaveProperty('amount', 2500);
      expect(res.body).toHaveProperty('status', 'succeeded');
      expect(res.body).toHaveProperty('created_at');
    });

    it('should use default amount if not provided', async () => {
      const res = await request(app)
        .post('/v1/refunds')
        .send({ payment_id: 'pay_123' });

      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(5000);
    });

    it('should generate unique refund IDs', async () => {
      const res1 = await request(app)
        .post('/v1/refunds')
        .send({ payment_id: 'pay_123', amount: 1000 });

      const res2 = await request(app)
        .post('/v1/refunds')
        .send({ payment_id: 'pay_123', amount: 1000 });

      expect(res1.body.id).not.toBe(res2.body.id);
    });
  });

  describe('POST /webhooks/test', () => {
    it('should accept webhook payload', async () => {
      const webhookData = {
        type: 'payment.succeeded',
        data: {
          id: 'pay_123',
          amount: 5000
        }
      };

      const res = await request(app)
        .post('/webhooks/test')
        .send(webhookData);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('sent', true);
    });

    it('should accept any webhook type', async () => {
      const types = ['payment.succeeded', 'payment.failed', 'refund.created'];

      for (const type of types) {
        const res = await request(app)
          .post('/webhooks/test')
          .send({ type, data: {} });

        expect(res.status).toBe(200);
        expect(res.body.sent).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request(app).get('/unknown/route');

      expect(res.status).toBe(404);
    });

    it('should handle malformed JSON', async () => {
      const res = await request(app)
        .post('/v1/payments')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(res.status).toBe(400);
    });
  });

  describe('CORS and Headers', () => {
    it('should accept JSON content type', async () => {
      const res = await request(app)
        .post('/v1/payments')
        .set('Content-Type', 'application/json')
        .send({ amount: 1000 });

      expect(res.status).toBe(200);
    });

    it('should return JSON response', async () => {
      const res = await request(app).get('/healthz');

      expect(res.headers['content-type']).toMatch(/json/);
    });
  });

  describe('Deterministic Behavior', () => {
    it('should return consistent structure for payments', async () => {
      const res = await request(app)
        .post('/v1/payments')
        .send({ amount: 1000, currency: 'EUR' });

      const expectedKeys = ['id', 'status', 'amount', 'currency', 'method', 'idempotency_key', 'created_at'];

      expectedKeys.forEach((key) => {
        expect(res.body).toHaveProperty(key);
      });
    });

    it('should always return succeeded status for payments', async () => {
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/v1/payments')
          .send({ amount: 1000 });

        expect(res.body.status).toBe('succeeded');
      }
    });

    it('should always return succeeded status for refunds', async () => {
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/v1/refunds')
          .send({ payment_id: 'pay_123' });

        expect(res.body.status).toBe('succeeded');
      }
    });
  });
});
