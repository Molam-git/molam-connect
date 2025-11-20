/**
 * Brique B118bis: RBAC Tests
 * Tests de contrôle d'accès basé sur les rôles
 */

import request from 'supertest';
import app from '../../../brique-117/playground/src/server';

describe('RBAC checks', () => {
  const devToken = process.env.DEV_TOKEN || 'test-dev-token';
  const opsToken = process.env.OPS_TOKEN || 'test-ops-token';
  const payAdminToken = process.env.PAY_ADMIN_TOKEN || 'test-pay-admin-token';
  const siraAdminToken = process.env.SIRA_ADMIN_TOKEN || 'test-sira-admin-token';

  describe('Developer Role', () => {
    it('allows access to playground run', async () => {
      const res = await request(app)
        .post('/api/playground/run')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          method: 'GET',
          path: '/healthz',
          sandboxTargetHost: 'http://localhost:4001'
        });

      expect([200, 400]).toContain(res.status); // 400 if validation fails, but not 403
    });

    it('allows access to playground save', async () => {
      const res = await request(app)
        .post('/api/playground/save')
        .set('Authorization', `Bearer ${devToken}`)
        .send({ sessionId: 'test-session-1' });

      expect([200, 400]).toContain(res.status);
    });

    it('allows access to playground share', async () => {
      const res = await request(app)
        .post('/api/playground/share')
        .set('Authorization', `Bearer ${devToken}`)
        .send({ sessionId: 'test-session-1' });

      expect([200, 400, 404]).toContain(res.status);
    });

    it('denies access to ops routes', async () => {
      const res = await request(app)
        .get('/api/playground/ops/logs')
        .set('Authorization', `Bearer ${devToken}`);

      expect(res.status).toBe(403);
    });

    it('denies access to admin routes', async () => {
      const res = await request(app)
        .delete('/api/playground/sessions/purge')
        .set('Authorization', `Bearer ${devToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Ops Role', () => {
    it('allows access to ops logs', async () => {
      const res = await request(app)
        .get('/api/playground/ops/logs')
        .set('Authorization', `Bearer ${opsToken}`);

      expect(res.status).toBe(200);
    });

    it('allows access to ops metrics', async () => {
      const res = await request(app)
        .get('/api/playground/ops/metrics')
        .set('Authorization', `Bearer ${opsToken}`);

      expect(res.status).toBe(200);
    });

    it('allows access to playground run (read-only monitoring)', async () => {
      const res = await request(app)
        .get('/api/playground/sessions')
        .set('Authorization', `Bearer ${opsToken}`);

      expect([200, 400]).toContain(res.status);
    });

    it('denies write access to sensitive admin operations', async () => {
      const res = await request(app)
        .delete('/api/playground/sessions/purge')
        .set('Authorization', `Bearer ${opsToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Pay Admin Role', () => {
    it('allows access to payment operations', async () => {
      const res = await request(app)
        .get('/api/playground/ops/payment-stats')
        .set('Authorization', `Bearer ${payAdminToken}`);

      expect([200, 404]).toContain(res.status);
    });

    it('allows access to playground for testing payments', async () => {
      const res = await request(app)
        .post('/api/playground/run')
        .set('Authorization', `Bearer ${payAdminToken}`)
        .send({
          method: 'POST',
          path: '/v1/payments',
          body: { amount: 5000, currency: 'XOF' },
          sandboxTargetHost: 'http://localhost:4001'
        });

      expect([200, 400]).toContain(res.status);
    });

    it('denies access to general ops logs', async () => {
      const res = await request(app)
        .get('/api/playground/ops/logs')
        .set('Authorization', `Bearer ${payAdminToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Sira Admin Role', () => {
    it('allows access to sira configuration', async () => {
      const res = await request(app)
        .get('/api/playground/sira/config')
        .set('Authorization', `Bearer ${siraAdminToken}`);

      expect([200, 404]).toContain(res.status);
    });

    it('allows updating sira suggestions settings', async () => {
      const res = await request(app)
        .post('/api/playground/sira/settings')
        .set('Authorization', `Bearer ${siraAdminToken}`)
        .send({ enabled: true, confidence_threshold: 0.8 });

      expect([200, 400, 404]).toContain(res.status);
    });

    it('allows access to playground for testing sira', async () => {
      const res = await request(app)
        .post('/api/playground/run')
        .set('Authorization', `Bearer ${siraAdminToken}`)
        .send({
          method: 'POST',
          path: '/v1/payments',
          sandboxTargetHost: 'http://localhost:4001'
        });

      expect([200, 400]).toContain(res.status);
    });
  });

  describe('Unauthenticated Access', () => {
    it('denies access without token', async () => {
      const res = await request(app)
        .post('/api/playground/run')
        .send({
          method: 'GET',
          path: '/healthz',
          sandboxTargetHost: 'http://localhost:4001'
        });

      expect(res.status).toBe(401);
    });

    it('denies access with invalid token', async () => {
      const res = await request(app)
        .post('/api/playground/run')
        .set('Authorization', 'Bearer invalid-token-xyz')
        .send({
          method: 'GET',
          path: '/healthz',
          sandboxTargetHost: 'http://localhost:4001'
        });

      expect(res.status).toBe(401);
    });

    it('allows access to public shared sessions without auth', async () => {
      const res = await request(app)
        .get('/api/playground/public/test_share_abc123');

      // Should return 200 if exists, 404 if not found, but NOT 401
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('Token Expiry', () => {
    it('rejects expired token', async () => {
      const expiredToken = 'expired-token-should-fail';

      const res = await request(app)
        .post('/api/playground/run')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({
          method: 'GET',
          path: '/healthz',
          sandboxTargetHost: 'http://localhost:4001'
        });

      expect(res.status).toBe(401);
    });
  });

  describe('Cross-Role Permissions', () => {
    it('developer cannot access ops-only endpoints', async () => {
      const opsEndpoints = [
        '/api/playground/ops/logs',
        '/api/playground/ops/metrics',
        '/api/playground/ops/alerts'
      ];

      for (const endpoint of opsEndpoints) {
        const res = await request(app)
          .get(endpoint)
          .set('Authorization', `Bearer ${devToken}`);

        expect(res.status).toBe(403);
      }
    });

    it('ops cannot delete sessions (admin only)', async () => {
      const res = await request(app)
        .delete('/api/playground/sessions/purge')
        .set('Authorization', `Bearer ${opsToken}`);

      expect(res.status).toBe(403);
    });
  });
});
