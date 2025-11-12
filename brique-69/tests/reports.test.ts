/**
 * Reports & Export Integration Tests
 */

import { Pool } from 'pg';
import request from 'supertest';
import app from '../src/server';
import { promises as fs } from 'fs';
import { join } from 'path';

describe('Reports & Export API', () => {
  let pool: Pool;
  let authToken: string;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });

    authToken = 'test-token';
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('POST /api/analytics/reports/export', () => {
    it('should generate CSV export', async () => {
      const response = await request(app)
        .post('/api/analytics/reports/export')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          format: 'csv',
          reportName: 'Test Export',
          queryParams: {
            from: '2025-01-01',
            to: '2025-01-31',
            granularity: 'day',
            metrics: ['gross_volume_usd', 'tx_count'],
            dimensions: ['day'],
          },
        })
        .expect(200);

      expect(response.body).toHaveProperty('downloadUrl');
      expect(response.body).toHaveProperty('fileName');
      expect(response.body.format).toBe('csv');
    });

    it('should generate Excel export', async () => {
      const response = await request(app)
        .post('/api/analytics/reports/export')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          format: 'xlsx',
          reportName: 'Test Excel Export',
          queryParams: {
            from: '2025-01-01',
            to: '2025-01-31',
            granularity: 'day',
          },
        })
        .expect(200);

      expect(response.body.format).toBe('xlsx');
    });

    it('should reject invalid format', async () => {
      await request(app)
        .post('/api/analytics/reports/export')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          format: 'invalid',
          reportName: 'Test',
          queryParams: {},
        })
        .expect(400);
    });
  });

  describe('POST /api/analytics/reports/schedule', () => {
    it('should create scheduled report', async () => {
      const response = await request(app)
        .post('/api/analytics/reports/schedule')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Weekly Report',
          format: 'xlsx',
          queryParams: {
            granularity: 'day',
            metrics: ['gross_volume_usd'],
            dimensions: ['day', 'country'],
          },
          cronExpr: '0 8 * * 1',
          recipients: [{ email: 'test@example.com' }],
          deliveryMethod: 'email',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Weekly Report');
      expect(response.body.format).toBe('xlsx');
    });

    it('should reject missing required fields', async () => {
      await request(app)
        .post('/api/analytics/reports/schedule')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Incomplete',
        })
        .expect(400);
    });
  });

  describe('GET /api/analytics/reports/schedules', () => {
    it('should list scheduled reports', async () => {
      const response = await request(app)
        .get('/api/analytics/reports/schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/analytics/reports/history', () => {
    it('should return report history', async () => {
      const response = await request(app)
        .get('/api/analytics/reports/history')
        .query({ limit: 10 })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('reports');
      expect(Array.isArray(response.body.reports)).toBe(true);
    });
  });

  describe('GET /api/analytics/reports/templates', () => {
    it('should return export templates', async () => {
      const response = await request(app)
        .get('/api/analytics/reports/templates')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });
  });
});

describe('Custom Views API', () => {
  let authToken: string;

  beforeAll(() => {
    authToken = 'test-token';
  });

  describe('POST /api/analytics/views', () => {
    it('should create custom view', async () => {
      const response = await request(app)
        .post('/api/analytics/views')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'My Custom View',
          description: 'Test view',
          viewConfig: {
            dateRange: { from: '2025-01-01', to: '2025-01-31' },
            metrics: ['gross_volume_usd'],
            dimensions: ['country'],
          },
          isPublic: false,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('My Custom View');
    });
  });

  describe('GET /api/analytics/views', () => {
    it('should list custom views', async () => {
      const response = await request(app)
        .get('/api/analytics/views')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });
});
