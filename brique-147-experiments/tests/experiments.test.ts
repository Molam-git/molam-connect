/**
 * BRIQUE 147 — Experiments API Tests
 */
import request from 'supertest';
import { pool } from '../src/db';
import jwt from 'jsonwebtoken';

const API_URL = process.env.API_URL || 'http://localhost:3010';
const PRIVATE_KEY = process.env.TEST_PRIVATE_KEY || '';

// Generate test JWT
function generateTestToken(roles: string[] = ['ops_admin']): string {
  return jwt.sign(
    {
      sub: 'test_user_123',
      tenant_id: 'tenant_456',
      roles
    },
    PRIVATE_KEY,
    { algorithm: 'RS256', expiresIn: '1h' }
  );
}

describe('Experiments API', () => {
  let adminToken: string;
  let marketingToken: string;

  beforeAll(() => {
    adminToken = generateTestToken(['ops_admin']);
    marketingToken = generateTestToken(['marketing']);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('POST /api/experiments', () => {
    it('should create experiment with variants', async () => {
      const res = await request(API_URL)
        .post('/api/experiments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Experiment',
          description: 'Testing experiment creation',
          targeting: { country: ['SN', 'FR'] },
          variants: [
            { name: 'Control', config: {}, traffic_share: 50, is_control: true },
            { name: 'Variant A', config: { button_color: 'blue' }, traffic_share: 50, is_control: false }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Test Experiment');
      expect(res.body.status).toBe('draft');
    });

    it('should reject request without auth', async () => {
      const res = await request(API_URL)
        .post('/api/experiments')
        .send({
          name: 'Test',
          variants: [{ name: 'A' }, { name: 'B' }]
        });

      expect(res.status).toBe(401);
    });

    it('should reject request with insufficient role', async () => {
      const guestToken = generateTestToken(['guest']);

      const res = await request(API_URL)
        .post('/api/experiments')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          name: 'Test',
          variants: [{ name: 'A' }, { name: 'B' }]
        });

      expect(res.status).toBe(403);
    });

    it('should reject experiment with < 2 variants', async () => {
      const res = await request(API_URL)
        .post('/api/experiments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Invalid',
          variants: [{ name: 'A' }]
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/experiments', () => {
    it('should list experiments', async () => {
      const res = await request(API_URL)
        .get('/api/experiments')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should filter by status', async () => {
      const res = await request(API_URL)
        .get('/api/experiments?status=draft')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      res.body.forEach((exp: any) => {
        expect(exp.status).toBe('draft');
      });
    });
  });

  describe('POST /api/experiments/:id/start', () => {
    it('should start experiment', async () => {
      // Create experiment first
      const createRes = await request(API_URL)
        .post('/api/experiments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Start Test',
          variants: [{ name: 'A' }, { name: 'B' }]
        });

      const experimentId = createRes.body.id;

      // Start it
      const startRes = await request(API_URL)
        .post(`/api/experiments/${experimentId}/start`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(startRes.status).toBe(200);
      expect(startRes.body.status).toBe('running');
      expect(startRes.body.start_date).toBeTruthy();
    });

    it('should not start already running experiment', async () => {
      const createRes = await request(API_URL)
        .post('/api/experiments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Already Running',
          variants: [{ name: 'A' }, { name: 'B' }]
        });

      const experimentId = createRes.body.id;

      // Start once
      await request(API_URL)
        .post(`/api/experiments/${experimentId}/start`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Try to start again
      const secondStart = await request(API_URL)
        .post(`/api/experiments/${experimentId}/start`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(secondStart.status).toBe(400);
    });
  });

  describe('POST /api/experiments/:id/assign', () => {
    it('should assign user to variant', async () => {
      // Create and start experiment
      const createRes = await request(API_URL)
        .post('/api/experiments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Assignment Test',
          variants: [
            { name: 'A', traffic_share: 50 },
            { name: 'B', traffic_share: 50 }
          ]
        });

      const experimentId = createRes.body.id;

      await request(API_URL)
        .post(`/api/experiments/${experimentId}/start`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Assign user
      const assignRes = await request(API_URL)
        .post(`/api/experiments/${experimentId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          molam_id: 'user_test_123'
        });

      expect(assignRes.status).toBe(200);
      expect(assignRes.body.variant_id).toBeTruthy();
      expect(assignRes.body.molam_id).toBe('user_test_123');
    });

    it('should return same variant for same user', async () => {
      const createRes = await request(API_URL)
        .post('/api/experiments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Sticky Assignment Test',
          variants: [{ name: 'A' }, { name: 'B' }]
        });

      const experimentId = createRes.body.id;

      await request(API_URL)
        .post(`/api/experiments/${experimentId}/start`)
        .set('Authorization', `Bearer ${adminToken}`);

      // First assignment
      const assign1 = await request(API_URL)
        .post(`/api/experiments/${experimentId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ molam_id: 'sticky_user' });

      // Second assignment (should be same)
      const assign2 = await request(API_URL)
        .post(`/api/experiments/${experimentId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ molam_id: 'sticky_user' });

      expect(assign1.body.variant_id).toBe(assign2.body.variant_id);
    });
  });

  describe('POST /api/experiments/:id/track', () => {
    it('should track metric event', async () => {
      const createRes = await request(API_URL)
        .post('/api/experiments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Tracking Test',
          variants: [{ name: 'A' }, { name: 'B' }]
        });

      const experimentId = createRes.body.id;
      const variantId = createRes.body.variants[0].id;

      const trackRes = await request(API_URL)
        .post(`/api/experiments/${experimentId}/track`)
        .send({
          variant_id: variantId,
          molam_id: 'user_track',
          event_type: 'conversion',
          value: 100.50,
          metadata: { source: 'web' }
        });

      expect(trackRes.status).toBe(200);
      expect(trackRes.body.status).toBe('ok');
    });
  });

  describe('GET /api/experiments/:id/results', () => {
    it('should return experiment results', async () => {
      const createRes = await request(API_URL)
        .post('/api/experiments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Results Test',
          variants: [{ name: 'A' }, { name: 'B' }]
        });

      const experimentId = createRes.body.id;

      const resultsRes = await request(API_URL)
        .get(`/api/experiments/${experimentId}/results`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resultsRes.status).toBe(200);
      expect(Array.isArray(resultsRes.body)).toBe(true);
      expect(resultsRes.body.length).toBe(2); // 2 variants
    });
  });
});
