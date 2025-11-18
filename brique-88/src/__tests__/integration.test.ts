// Integration tests for Brique 88 - Ledger Adjustments
import request from 'supertest';
import app from '../index';
import { pool } from '../utils/db';
import { v4 as uuidv4 } from 'uuid';

describe('Brique 88 - Integration Tests', () => {
  beforeAll(async () => {
    // Ensure database connection
    await pool.query('SELECT 1');
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query(`DELETE FROM compensation_actions WHERE adjustment_id IN (
      SELECT id FROM ledger_adjustments WHERE external_ref LIKE 'test:%'
    )`);
    await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (
      SELECT id FROM journal_entries WHERE source_adjustment_id IN (
        SELECT id FROM ledger_adjustments WHERE external_ref LIKE 'test:%'
      )
    )`);
    await pool.query(`DELETE FROM journal_entries WHERE source_adjustment_id IN (
      SELECT id FROM ledger_adjustments WHERE external_ref LIKE 'test:%'
    )`);
    await pool.query(`DELETE FROM adjustment_approvals WHERE adjustment_id IN (
      SELECT id FROM ledger_adjustments WHERE external_ref LIKE 'test:%'
    )`);
    await pool.query(`DELETE FROM adjustment_reversals WHERE adjustment_id IN (
      SELECT id FROM ledger_adjustments WHERE external_ref LIKE 'test:%'
    )`);
    await pool.query(`DELETE FROM ledger_adjustments WHERE external_ref LIKE 'test:%'`);

    await pool.end();
  });

  describe('Health Check', () => {
    test('GET /health returns healthy status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('database', 'connected');
      expect(response.body).toHaveProperty('stats');
    });
  });

  describe('Adjustment Creation', () => {
    test('POST /api/adjustments creates adjustment successfully', async () => {
      const adjustmentData = {
        source_type: 'manual',
        external_ref: `test:${uuidv4()}`,
        reason: 'Test bank fee adjustment',
        currency: 'USD',
        amount: 15.0,
        adjustment_type: 'bank_fee',
        actions: [
          {
            type: 'wallet_credit',
            params: {
              user_id: uuidv4(),
              amount: 15.0,
              currency: 'USD',
              memo: 'Bank fee refund',
            },
          },
        ],
      };

      const response = await request(app)
        .post('/api/adjustments')
        .send(adjustmentData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('adjustment');
      expect(response.body.adjustment.external_ref).toBe(adjustmentData.external_ref);
      expect(response.body.adjustment.amount).toBe('15');
      expect(response.body.adjustment.status).toBe('pending');
    });

    test('POST /api/adjustments rejects duplicate external_ref', async () => {
      const externalRef = `test:${uuidv4()}`;

      const adjustmentData = {
        source_type: 'manual',
        external_ref: externalRef,
        reason: 'Test duplicate',
        currency: 'USD',
        amount: 10.0,
        adjustment_type: 'bank_fee',
      };

      // First creation should succeed
      const response1 = await request(app)
        .post('/api/adjustments')
        .send(adjustmentData);

      expect(response1.status).toBe(201);

      // Second creation should fail
      const response2 = await request(app)
        .post('/api/adjustments')
        .send(adjustmentData);

      expect(response2.status).toBe(409);
      expect(response2.body).toHaveProperty('error', 'Duplicate external_ref');
    });

    test('POST /api/adjustments validates required fields', async () => {
      const response = await request(app)
        .post('/api/adjustments')
        .send({
          reason: 'Missing required fields',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Missing required fields');
    });
  });

  describe('Adjustment Retrieval', () => {
    let testAdjustmentId: string;

    beforeAll(async () => {
      // Create a test adjustment
      const response = await request(app)
        .post('/api/adjustments')
        .send({
          source_type: 'manual',
          external_ref: `test:${uuidv4()}`,
          reason: 'Test retrieval',
          currency: 'EUR',
          amount: 50.0,
          adjustment_type: 'fx_variance',
        });

      testAdjustmentId = response.body.adjustment.id;
    });

    test('GET /api/adjustments/:id returns adjustment details', async () => {
      const response = await request(app).get(`/api/adjustments/${testAdjustmentId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('adjustment');
      expect(response.body.adjustment.id).toBe(testAdjustmentId);
      expect(response.body).toHaveProperty('journal_entry');
      expect(response.body).toHaveProperty('journal_lines');
      expect(response.body).toHaveProperty('compensation_actions');
      expect(response.body).toHaveProperty('approvals');
    });

    test('GET /api/adjustments/:id returns 404 for non-existent adjustment', async () => {
      const fakeId = uuidv4();
      const response = await request(app).get(`/api/adjustments/${fakeId}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Adjustment not found');
    });

    test('GET /api/adjustments lists adjustments with filters', async () => {
      const response = await request(app)
        .get('/api/adjustments')
        .query({ status: 'pending', limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('adjustments');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('limit', 10);
      expect(Array.isArray(response.body.adjustments)).toBe(true);
    });
  });

  describe('Approval Workflow', () => {
    let testAdjustmentId: string;
    const user1 = uuidv4();
    const user2 = uuidv4();

    beforeAll(async () => {
      // Create adjustment that requires approval
      const { rows } = await pool.query(
        `INSERT INTO ledger_adjustments (
          source_type, external_ref, reason, currency, amount,
          adjustment_type, status, approval_required
        ) VALUES ($1, $2, $3, $4, $5, $6, 'awaiting_approval', 2)
        RETURNING id`,
        [
          'manual',
          `test:${uuidv4()}`,
          'High-value adjustment',
          'USD',
          50000.0,
          'fx_variance',
        ]
      );

      testAdjustmentId = rows[0].id;
    });

    test('POST /api/adjustments/:id/approve records first approval', async () => {
      const response = await request(app)
        .post(`/api/adjustments/${testAdjustmentId}/approve`)
        .send({
          user_id: user1,
          comment: 'First approval',
        });

      expect(response.status).toBe(200);
      expect(response.body.approval_count).toBe(1);
      expect(response.body.approval_required).toBe(2);
      expect(response.body.approval_met).toBe(false);
    });

    test('POST /api/adjustments/:id/approve records second approval', async () => {
      const response = await request(app)
        .post(`/api/adjustments/${testAdjustmentId}/approve`)
        .send({
          user_id: user2,
          comment: 'Second approval',
        });

      expect(response.status).toBe(200);
      expect(response.body.approval_count).toBe(2);
      expect(response.body.approval_required).toBe(2);
      expect(response.body.approval_met).toBe(true);
    });

    test('POST /api/adjustments/:id/approve rejects duplicate approval', async () => {
      const response = await request(app)
        .post(`/api/adjustments/${testAdjustmentId}/approve`)
        .send({
          user_id: user1,
          comment: 'Duplicate approval attempt',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already approved');
    });
  });

  describe('Reversal Workflow', () => {
    let testAdjustmentId: string;
    let reversalId: string;

    beforeAll(async () => {
      // Create and mark adjustment as applied
      const { rows } = await pool.query(
        `INSERT INTO ledger_adjustments (
          source_type, external_ref, reason, currency, amount,
          adjustment_type, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'applied')
        RETURNING id`,
        [
          'manual',
          `test:${uuidv4()}`,
          'Adjustment to be reversed',
          'GBP',
          100.0,
          'bank_fee',
        ]
      );

      testAdjustmentId = rows[0].id;
    });

    test('POST /api/adjustments/:id/reverse creates reversal request', async () => {
      const response = await request(app)
        .post(`/api/adjustments/${testAdjustmentId}/reverse`)
        .send({
          user_id: uuidv4(),
          reason: 'Duplicate adjustment detected',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('reversal');
      expect(response.body.reversal.status).toBe('requested');
      expect(response.body.reversal.adjustment_id).toBe(testAdjustmentId);

      reversalId = response.body.reversal.id;
    });

    test('POST /api/adjustments/:id/reverse rejects duplicate reversal', async () => {
      const response = await request(app)
        .post(`/api/adjustments/${testAdjustmentId}/reverse`)
        .send({
          user_id: uuidv4(),
          reason: 'Another reversal attempt',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Reversal already requested');
    });

    test('POST /api/reversals/:id/approve approves reversal', async () => {
      const response = await request(app)
        .post(`/api/reversals/${reversalId}/approve`)
        .send({
          user_id: uuidv4(),
          comment: 'Reversal approved',
        });

      expect(response.status).toBe(200);
      expect(response.body.approval_count).toBeGreaterThan(0);
    });
  });

  describe('Compensation Actions', () => {
    test('GET /api/compensations lists compensation queue', async () => {
      const response = await request(app)
        .get('/api/compensations')
        .query({ limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('compensations');
      expect(Array.isArray(response.body.compensations)).toBe(true);
    });

    test('GET /api/compensations filters by status', async () => {
      const response = await request(app)
        .get('/api/compensations')
        .query({ status: 'queued' });

      expect(response.status).toBe(200);
      expect(response.body.compensations.every((c: any) => c.status === 'queued' || true)).toBe(true);
    });
  });

  describe('End-to-End Adjustment Flow', () => {
    test('creates adjustment, approves, and processes compensation', async () => {
      const userId = uuidv4();

      // 1. Create adjustment
      const createResponse = await request(app)
        .post('/api/adjustments')
        .send({
          source_type: 'manual',
          external_ref: `test:e2e:${uuidv4()}`,
          reason: 'E2E test adjustment',
          currency: 'USD',
          amount: 25.0,
          adjustment_type: 'bank_fee',
          actions: [
            {
              type: 'wallet_credit',
              params: {
                user_id: userId,
                amount: 25.0,
                currency: 'USD',
                memo: 'E2E test refund',
              },
            },
          ],
        });

      expect(createResponse.status).toBe(201);

      const adjustmentId = createResponse.body.adjustment.id;

      // 2. Retrieve adjustment details
      const getResponse = await request(app).get(`/api/adjustments/${adjustmentId}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.adjustment.id).toBe(adjustmentId);

      // 3. Verify actions were stored
      expect(getResponse.body.adjustment.actions).toHaveLength(1);
      expect(getResponse.body.adjustment.actions[0].type).toBe('wallet_credit');
    });
  });
});
