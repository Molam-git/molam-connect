/**
 * Brique 120: Payouts Engine Tests
 * Tests pour les routes de payouts
 */

import request from 'supertest';
import { Pool } from 'pg';
import express from 'express';
import payoutsRouter from '../src/routes/payouts';

// Setup Express app
const app = express();
app.use(express.json());

// Mock user_id middleware
app.use((req, res, next) => {
  req.body.user_id = '00000000-0000-0000-0000-000000000001';
  next();
});

app.use('/api/payouts', payoutsRouter);

// PostgreSQL test pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'molam_connect_test',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

describe('Brique 120 - Payouts Engine', () => {
  let testPayoutId: string;

  beforeAll(async () => {
    // Run migration
    const migration = require('fs').readFileSync(
      __dirname + '/../migrations/001_payouts_engine.sql',
      'utf8'
    );
    await pool.query(migration);
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DROP TABLE IF EXISTS payout_events CASCADE');
    await pool.query('DROP TABLE IF EXISTS payout_approval_signatures CASCADE');
    await pool.query('DROP TABLE IF EXISTS payout_approvals CASCADE');
    await pool.query('DROP TABLE IF EXISTS payout_batch_lines CASCADE');
    await pool.query('DROP TABLE IF EXISTS payout_batches CASCADE');
    await pool.query('DROP TABLE IF EXISTS payouts CASCADE');
    await pool.query('DROP TABLE IF EXISTS ledger_holds CASCADE');
    await pool.query('DROP TABLE IF EXISTS payout_routing_rules CASCADE');
    await pool.query('DROP VIEW IF EXISTS pending_payouts_summary CASCADE');
    await pool.query('DROP VIEW IF EXISTS failed_payouts_dlq CASCADE');
    await pool.query('DROP VIEW IF EXISTS batch_execution_summary CASCADE');
    await pool.end();
  });

  beforeEach(async () => {
    // Clean tables before each test
    await pool.query('DELETE FROM payout_events');
    await pool.query('DELETE FROM payout_approval_signatures');
    await pool.query('DELETE FROM payout_approvals');
    await pool.query('DELETE FROM payout_batch_lines');
    await pool.query('DELETE FROM payout_batches');
    await pool.query('DELETE FROM payouts');
    await pool.query('DELETE FROM ledger_holds');
  });

  describe('POST /api/payouts - Create Payout', () => {
    test('should create payout successfully', async () => {
      const payoutData = {
        origin_module: 'connect',
        origin_entity_id: '11111111-1111-1111-1111-111111111111',
        currency: 'EUR',
        amount: 1000,
        beneficiary: {
          account_number: 'FR7612345678901234567890123',
          account_name: 'Test Merchant',
          bank_code: 'BNPAFRPP'
        },
        priority: 'normal'
      };

      const response = await request(app)
        .post('/api/payouts')
        .set('Idempotency-Key', 'test-idem-123')
        .send(payoutData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.payout).toBeDefined();
      expect(response.body.payout.external_id).toBe('test-idem-123');
      expect(response.body.payout.status).toBe('pending');
      expect(parseFloat(response.body.payout.amount)).toBe(1000);
      expect(response.body.payout.reference_code).toMatch(/^PO-/);
      expect(response.body.hold_id).toBeDefined();

      testPayoutId = response.body.payout.id;

      // Verify ledger hold was created
      const holdResult = await pool.query(
        'SELECT * FROM ledger_holds WHERE ref_id = $1',
        [testPayoutId]
      );
      expect(holdResult.rows.length).toBe(1);
      expect(parseFloat(holdResult.rows[0].amount)).toBe(1000);
      expect(holdResult.rows[0].status).toBe('active');

      // Verify event was logged
      const eventResult = await pool.query(
        'SELECT * FROM payout_events WHERE payout_id = $1',
        [testPayoutId]
      );
      expect(eventResult.rows.length).toBe(1);
      expect(eventResult.rows[0].event_type).toBe('created');
    });

    test('should be idempotent', async () => {
      const payoutData = {
        origin_module: 'wallet',
        origin_entity_id: '22222222-2222-2222-2222-222222222222',
        currency: 'USD',
        amount: 500,
        beneficiary: {
          account_number: 'US1234567890',
          account_name: 'Test User'
        }
      };

      const key = 'idem-duplicate-test';

      // First request
      const response1 = await request(app)
        .post('/api/payouts')
        .set('Idempotency-Key', key)
        .send(payoutData)
        .expect(201);

      // Second request with same key
      const response2 = await request(app)
        .post('/api/payouts')
        .set('Idempotency-Key', key)
        .send(payoutData)
        .expect(200);

      expect(response2.body.success).toBe(true);
      expect(response2.body.payout.id).toBe(response1.body.payout.id);
      expect(response2.body.idempotent).toBe(true);

      // Verify only one payout was created
      const countResult = await pool.query(
        'SELECT COUNT(*) FROM payouts WHERE external_id = $1',
        [key]
      );
      expect(parseInt(countResult.rows[0].count)).toBe(1);
    });

    test('should reject request without idempotency key', async () => {
      const response = await request(app)
        .post('/api/payouts')
        .send({
          origin_module: 'connect',
          origin_entity_id: '11111111-1111-1111-1111-111111111111',
          currency: 'EUR',
          amount: 100,
          beneficiary: {}
        })
        .expect(400);

      expect(response.body.error).toBe('idempotency_key_required');
    });

    test('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/api/payouts')
        .set('Idempotency-Key', 'missing-fields-test')
        .send({
          origin_module: 'connect'
          // Missing other required fields
        })
        .expect(400);

      expect(response.body.error).toBe('missing_required_fields');
      expect(response.body.required).toContain('origin_entity_id');
      expect(response.body.required).toContain('currency');
      expect(response.body.required).toContain('amount');
    });

    test('should reject invalid amount', async () => {
      const response = await request(app)
        .post('/api/payouts')
        .set('Idempotency-Key', 'invalid-amount')
        .send({
          origin_module: 'connect',
          origin_entity_id: '11111111-1111-1111-1111-111111111111',
          currency: 'EUR',
          amount: -100, // Invalid negative amount
          beneficiary: {}
        })
        .expect(400);

      expect(response.body.error).toBe('invalid_amount');
    });

    test('should reject invalid priority', async () => {
      const response = await request(app)
        .post('/api/payouts')
        .set('Idempotency-Key', 'invalid-priority')
        .send({
          origin_module: 'connect',
          origin_entity_id: '11111111-1111-1111-1111-111111111111',
          currency: 'EUR',
          amount: 100,
          beneficiary: {},
          priority: 'invalid'
        })
        .expect(400);

      expect(response.body.error).toBe('invalid_priority');
    });

    test('should calculate fees correctly for instant priority', async () => {
      const response = await request(app)
        .post('/api/payouts')
        .set('Idempotency-Key', 'instant-fee-test')
        .send({
          origin_module: 'connect',
          origin_entity_id: '11111111-1111-1111-1111-111111111111',
          currency: 'EUR',
          amount: 1000,
          beneficiary: {},
          priority: 'instant'
        })
        .expect(201);

      const payout = response.body.payout;
      // Instant should have 0.5% molam fee + 2.00 bank fee
      expect(parseFloat(payout.molam_fee)).toBe(5.00); // 1000 * 0.005
      expect(parseFloat(payout.bank_fee)).toBe(2.00);
      expect(parseFloat(payout.net_amount)).toBe(993.00); // 1000 - 5 - 2
    });

    test('should calculate fees correctly for normal priority', async () => {
      const response = await request(app)
        .post('/api/payouts')
        .set('Idempotency-Key', 'normal-fee-test')
        .send({
          origin_module: 'connect',
          origin_entity_id: '11111111-1111-1111-1111-111111111111',
          currency: 'EUR',
          amount: 1000,
          beneficiary: {},
          priority: 'normal'
        })
        .expect(201);

      const payout = response.body.payout;
      // Normal should have 0.25% molam fee + 0.50 bank fee
      expect(parseFloat(payout.molam_fee)).toBe(2.50); // 1000 * 0.0025
      expect(parseFloat(payout.bank_fee)).toBe(0.50);
      expect(parseFloat(payout.net_amount)).toBe(997.00); // 1000 - 2.5 - 0.5
    });
  });

  describe('GET /api/payouts/:id - Get Payout Details', () => {
    beforeEach(async () => {
      // Create test payout
      const response = await request(app)
        .post('/api/payouts')
        .set('Idempotency-Key', 'get-test-payout')
        .send({
          origin_module: 'connect',
          origin_entity_id: '11111111-1111-1111-1111-111111111111',
          currency: 'EUR',
          amount: 500,
          beneficiary: {},
          priority: 'normal'
        });

      testPayoutId = response.body.payout.id;
    });

    test('should get payout details', async () => {
      const response = await request(app)
        .get(`/api/payouts/${testPayoutId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.payout).toBeDefined();
      expect(response.body.payout.id).toBe(testPayoutId);
      expect(response.body.hold).toBeDefined();
      expect(response.body.events).toBeDefined();
      expect(response.body.events.length).toBeGreaterThan(0);
    });

    test('should return 404 for non-existent payout', async () => {
      const response = await request(app)
        .get('/api/payouts/00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(response.body.error).toBe('payout_not_found');
    });
  });

  describe('GET /api/payouts - List Payouts', () => {
    beforeEach(async () => {
      // Create multiple test payouts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/payouts')
          .set('Idempotency-Key', `list-test-${i}`)
          .send({
            origin_module: i % 2 === 0 ? 'connect' : 'wallet',
            origin_entity_id: '11111111-1111-1111-1111-111111111111',
            currency: i % 2 === 0 ? 'EUR' : 'USD',
            amount: (i + 1) * 100,
            beneficiary: {},
            priority: i === 0 ? 'instant' : 'normal'
          });
      }
    });

    test('should list all payouts', async () => {
      const response = await request(app)
        .get('/api/payouts')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.payouts).toHaveLength(5);
      expect(response.body.pagination.total).toBe(5);
    });

    test('should filter by status', async () => {
      const response = await request(app)
        .get('/api/payouts?status=pending')
        .expect(200);

      expect(response.body.payouts.every((p: any) => p.status === 'pending')).toBe(true);
    });

    test('should filter by origin_module', async () => {
      const response = await request(app)
        .get('/api/payouts?origin_module=connect')
        .expect(200);

      expect(response.body.payouts.every((p: any) => p.origin_module === 'connect')).toBe(true);
      expect(response.body.payouts.length).toBe(3); // 0, 2, 4
    });

    test('should filter by currency', async () => {
      const response = await request(app)
        .get('/api/payouts?currency=USD')
        .expect(200);

      expect(response.body.payouts.every((p: any) => p.currency === 'USD')).toBe(true);
      expect(response.body.payouts.length).toBe(2); // 1, 3
    });

    test('should paginate results', async () => {
      const response = await request(app)
        .get('/api/payouts?page=1&limit=2')
        .expect(200);

      expect(response.body.payouts).toHaveLength(2);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(2);
      expect(response.body.pagination.pages).toBe(3); // 5 total / 2 per page
    });
  });

  describe('POST /api/payouts/:id/cancel - Cancel Payout', () => {
    beforeEach(async () => {
      const response = await request(app)
        .post('/api/payouts')
        .set('Idempotency-Key', 'cancel-test-payout')
        .send({
          origin_module: 'connect',
          origin_entity_id: '11111111-1111-1111-1111-111111111111',
          currency: 'EUR',
          amount: 500,
          beneficiary: {}
        });

      testPayoutId = response.body.payout.id;
    });

    test('should cancel pending payout', async () => {
      const response = await request(app)
        .post(`/api/payouts/${testPayoutId}/cancel`)
        .send({ reason: 'User requested cancellation' })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify payout status
      const payoutResult = await pool.query(
        'SELECT status FROM payouts WHERE id = $1',
        [testPayoutId]
      );
      expect(payoutResult.rows[0].status).toBe('cancelled');

      // Verify hold was cancelled
      const holdResult = await pool.query(
        'SELECT status FROM ledger_holds WHERE ref_id = $1',
        [testPayoutId]
      );
      expect(holdResult.rows[0].status).toBe('cancelled');

      // Verify event was logged
      const eventResult = await pool.query(
        'SELECT * FROM payout_events WHERE payout_id = $1 AND event_type = $2',
        [testPayoutId, 'cancelled']
      );
      expect(eventResult.rows.length).toBe(1);
    });

    test('should reject cancellation of non-cancellable status', async () => {
      // Update payout to sent status
      await pool.query(
        'UPDATE payouts SET status = $1 WHERE id = $2',
        ['sent', testPayoutId]
      );

      const response = await request(app)
        .post(`/api/payouts/${testPayoutId}/cancel`)
        .send({ reason: 'Test' })
        .expect(400);

      expect(response.body.error).toBe('payout_not_cancellable');
    });

    test('should return 404 for non-existent payout', async () => {
      const response = await request(app)
        .post('/api/payouts/00000000-0000-0000-0000-000000000000/cancel')
        .send({ reason: 'Test' })
        .expect(404);

      expect(response.body.error).toBe('payout_not_found');
    });
  });

  describe('GET /api/payouts/summary/pending - Pending Summary', () => {
    beforeEach(async () => {
      // Create multiple payouts
      await request(app)
        .post('/api/payouts')
        .set('Idempotency-Key', 'summary-1')
        .send({
          origin_module: 'connect',
          origin_entity_id: '11111111-1111-1111-1111-111111111111',
          currency: 'EUR',
          amount: 1000,
          beneficiary: {},
          priority: 'normal'
        });

      await request(app)
        .post('/api/payouts')
        .set('Idempotency-Key', 'summary-2')
        .send({
          origin_module: 'connect',
          origin_entity_id: '11111111-1111-1111-1111-111111111111',
          currency: 'EUR',
          amount: 2000,
          beneficiary: {},
          priority: 'instant'
        });

      await request(app)
        .post('/api/payouts')
        .set('Idempotency-Key', 'summary-3')
        .send({
          origin_module: 'wallet',
          origin_entity_id: '22222222-2222-2222-2222-222222222222',
          currency: 'USD',
          amount: 500,
          beneficiary: {},
          priority: 'normal'
        });
    });

    test('should return pending payouts summary', async () => {
      const response = await request(app)
        .get('/api/payouts/summary/pending')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.summary.length).toBeGreaterThan(0);

      // Find EUR summary
      const eurSummary = response.body.summary.find((s: any) =>
        s.currency === 'EUR' && s.origin_module === 'connect'
      );
      expect(eurSummary).toBeDefined();
      expect(parseInt(eurSummary.total_count)).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Database Functions', () => {
    test('create_ledger_hold function should work', async () => {
      const result = await pool.query(`
        SELECT create_ledger_hold($1, $2, $3, $4, $5, $6) as hold_id
      `, [
        '11111111-1111-1111-1111-111111111111',
        'EUR',
        100,
        'test hold',
        'payout',
        null
      ]);

      expect(result.rows[0].hold_id).toBeDefined();

      // Verify hold was created
      const holdResult = await pool.query(
        'SELECT * FROM ledger_holds WHERE id = $1',
        [result.rows[0].hold_id]
      );

      expect(holdResult.rows.length).toBe(1);
      expect(parseFloat(holdResult.rows[0].amount)).toBe(100);
      expect(holdResult.rows[0].status).toBe('active');
    });

    test('release_ledger_hold function should work', async () => {
      // Create hold
      const createResult = await pool.query(`
        SELECT create_ledger_hold($1, $2, $3, $4, $5, $6) as hold_id
      `, [
        '11111111-1111-1111-1111-111111111111',
        'EUR',
        100,
        'test hold',
        'payout',
        null
      ]);

      const holdId = createResult.rows[0].hold_id;

      // Release hold
      const releaseResult = await pool.query(
        'SELECT release_ledger_hold($1, $2)',
        [holdId, 100]
      );

      expect(releaseResult.rows[0].release_ledger_hold).toBe(true);

      // Verify hold status
      const holdResult = await pool.query(
        'SELECT * FROM ledger_holds WHERE id = $1',
        [holdId]
      );

      expect(holdResult.rows[0].status).toBe('released');
      expect(parseFloat(holdResult.rows[0].released_amount)).toBe(100);
    });

    test('calculate_payout_fees function should work', async () => {
      const result = await pool.query(`
        SELECT * FROM calculate_payout_fees($1, $2, $3, $4)
      `, ['EUR', 1000, 'instant', 'connect']);

      expect(result.rows.length).toBe(1);
      expect(parseFloat(result.rows[0].molam_fee)).toBe(5.00); // 0.5%
      expect(parseFloat(result.rows[0].bank_fee)).toBe(2.00);
      expect(parseFloat(result.rows[0].net_amount)).toBe(993.00);
    });
  });
});
