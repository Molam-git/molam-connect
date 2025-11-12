/**
 * Analytics API Integration Tests
 */

import { Pool } from 'pg';
import request from 'supertest';
import app from '../src/server';

describe('Analytics API', () => {
  let pool: Pool;
  let authToken: string;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });

    // Mock auth token
    authToken = 'test-token';
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('GET /api/analytics/summary', () => {
    it('should return summary data with valid auth', async () => {
      const response = await request(app)
        .get('/api/analytics/summary')
        .query({ from: '2025-01-01', to: '2025-01-31', granularity: 'day' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return 401 without auth', async () => {
      await request(app)
        .get('/api/analytics/summary')
        .query({ from: '2025-01-01', to: '2025-01-31' })
        .expect(401);
    });
  });

  describe('GET /api/analytics/kpis', () => {
    it('should return aggregated KPIs', async () => {
      const response = await request(app)
        .get('/api/analytics/kpis')
        .query({ from: '2025-01-01', to: '2025-01-31' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('gross_volume');
      expect(response.body).toHaveProperty('net_revenue');
      expect(response.body).toHaveProperty('fees_collected');
      expect(response.body).toHaveProperty('success_rate');
    });
  });

  describe('GET /api/analytics/timeseries', () => {
    it('should return timeseries data', async () => {
      const response = await request(app)
        .get('/api/analytics/timeseries')
        .query({ metric: 'gross', from: '2025-01-01', to: '2025-01-31', interval: 'day' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/analytics/alerts', () => {
    it('should return alerts list', async () => {
      const response = await request(app)
        .get('/api/analytics/alerts')
        .query({ status: 'open', limit: 10 })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('alerts');
      expect(Array.isArray(response.body.alerts)).toBe(true);
    });
  });
});
