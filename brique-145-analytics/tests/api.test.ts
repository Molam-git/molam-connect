/**
 * BRIQUE 145 — API Integration Tests
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';

const API_URL = process.env.API_URL || 'http://localhost:3002';
const PRIVATE_KEY = process.env.TEST_PRIVATE_KEY || '';

// Generate test JWT
function generateTestToken(roles: string[] = ['pay_admin']): string {
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

describe('Analytics API', () => {
  let token: string;

  beforeAll(() => {
    token = generateTestToken();
  });

  describe('GET /healthz', () => {
    it('should return health status', async () => {
      const response = await request(API_URL).get('/healthz');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        ok: true,
        service: 'analytics-api'
      });
    });
  });

  describe('GET /api/analytics/overview', () => {
    it('should return overview with valid token', async () => {
      const response = await request(API_URL)
        .get('/api/analytics/overview')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('gmv');
      expect(response.body).toHaveProperty('tx_count');
      expect(response.body).toHaveProperty('fees_total');
    });

    it('should reject request without token', async () => {
      const response = await request(API_URL)
        .get('/api/analytics/overview');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('missing_auth');
    });

    it('should reject request with invalid role', async () => {
      const invalidToken = generateTestToken(['guest']);

      const response = await request(API_URL)
        .get('/api/analytics/overview')
        .set('Authorization', `Bearer ${invalidToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('forbidden');
    });

    it('should filter by zone', async () => {
      const response = await request(API_URL)
        .get('/api/analytics/overview?zone=CEDEAO')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
    });

    it('should filter by date range', async () => {
      const from = new Date('2025-01-01').toISOString();
      const to = new Date('2025-01-19').toISOString();

      const response = await request(API_URL)
        .get(`/api/analytics/overview?from=${from}&to=${to}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/analytics/by-country', () => {
    it('should return country breakdown', async () => {
      const response = await request(API_URL)
        .get('/api/analytics/by-country')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('country');
        expect(response.body[0]).toHaveProperty('gmv');
        expect(response.body[0]).toHaveProperty('tx_count');
      }
    });
  });

  describe('GET /api/analytics/timeseries', () => {
    it('should return timeseries data', async () => {
      const response = await request(API_URL)
        .get('/api/analytics/timeseries?granularity=hour')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('bucket_ts');
        expect(response.body[0]).toHaveProperty('gmv');
        expect(response.body[0]).toHaveProperty('tx_count');
      }
    });

    it('should support different granularities', async () => {
      const granularities = ['minute', 'hour', 'day'];

      for (const granularity of granularities) {
        const response = await request(API_URL)
          .get(`/api/analytics/timeseries?granularity=${granularity}`)
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
      }
    });
  });

  describe('Caching', () => {
    it('should cache repeated queries', async () => {
      const query = '/api/analytics/overview?zone=CEDEAO';

      // First request
      const start1 = Date.now();
      await request(API_URL)
        .get(query)
        .set('Authorization', `Bearer ${token}`);
      const duration1 = Date.now() - start1;

      // Second request (should be cached)
      const start2 = Date.now();
      await request(API_URL)
        .get(query)
        .set('Authorization', `Bearer ${token}`);
      const duration2 = Date.now() - start2;

      // Cached request should be faster
      expect(duration2).toBeLessThan(duration1);
    });
  });
});
