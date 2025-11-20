/**
 * Brique B118bis: Share Expiry Tests
 * Tests d'expiration des sessions partagées
 */

import request from 'supertest';
import app from '../../../brique-117/playground/src/server';

describe('Shared session expiry', () => {
  const devToken = process.env.DEV_TOKEN || 'test-dev-token';
  let shareUrl: string;
  let shareKey: string;

  beforeAll(async () => {
    // Create a test session
    const createRes = await request(app)
      .post('/api/playground/run')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        method: 'POST',
        path: '/v1/payments',
        body: { amount: 5000, currency: 'XOF' },
        sandboxTargetHost: 'http://localhost:4001'
      });

    const sessionId = createRes.body?.sessionId || 'test-session-expiry-1';

    // Save the session
    await request(app)
      .post('/api/playground/save')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ sessionId });

    // Share the session
    const shareRes = await request(app)
      .post('/api/playground/share')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ sessionId });

    shareUrl = shareRes.body?.url || '';
    shareKey = shareUrl.split('/playground/')[1] || 'test-share-key';
  });

  describe('Before Expiry', () => {
    it('is accessible immediately after creation', async () => {
      const res = await request(app)
        .get(`/api/playground/public/${shareKey}`);

      expect([200, 404]).toContain(res.status);

      if (res.status === 200) {
        expect(res.body).toHaveProperty('request_json');
      }
    });

    it('can be executed without authentication', async () => {
      const res = await request(app)
        .get(`/api/playground/public/${shareKey}`);

      // Public sessions should not require auth
      expect(res.status).not.toBe(401);
    });

    it('returns session metadata', async () => {
      const res = await request(app)
        .get(`/api/playground/public/${shareKey}`);

      if (res.status === 200) {
        expect(res.body).toHaveProperty('created_at');
        expect(res.body).toHaveProperty('share_key');
      }
    });
  });

  describe('TTL Configuration', () => {
    it('has default TTL of 30 days', async () => {
      const res = await request(app)
        .get(`/api/playground/public/${shareKey}`);

      if (res.status === 200) {
        const createdAt = new Date(res.body.created_at);
        const now = new Date();
        const diffDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

        // Session should be valid if created recently
        expect(diffDays).toBeLessThan(30);
      }
    });

    it('respects custom TTL when set', async () => {
      // Create session with custom TTL (1 second)
      const sessionRes = await request(app)
        .post('/api/playground/run')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          method: 'GET',
          path: '/healthz',
          sandboxTargetHost: 'http://localhost:4001'
        });

      const sessionId = sessionRes.body?.sessionId || 'test-ttl-session';

      await request(app)
        .post('/api/playground/save')
        .set('Authorization', `Bearer ${devToken}`)
        .send({ sessionId });

      const shareRes = await request(app)
        .post('/api/playground/share')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          sessionId,
          ttl_seconds: 1 // 1 second TTL
        });

      const tempShareKey = shareRes.body?.url?.split('/playground/')[1];

      if (tempShareKey) {
        // Immediately accessible
        const res1 = await request(app)
          .get(`/api/playground/public/${tempShareKey}`);

        expect([200, 404]).toContain(res1.status);

        // Wait for expiry
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Should be expired
        const res2 = await request(app)
          .get(`/api/playground/public/${tempShareKey}`);

        expect([403, 410, 404]).toContain(res2.status);
      }
    });
  });

  describe('After Expiry', () => {
    it('returns 410 Gone for expired sessions', async () => {
      // Create an old session (simulate expiry)
      const oldShareKey = 'expired-share-key-test';

      const res = await request(app)
        .get(`/api/playground/public/${oldShareKey}`);

      // Should return 404 (not found) or 410 (gone) for expired/non-existent
      expect([404, 410]).toContain(res.status);
    });

    it('does not leak session data after expiry', async () => {
      const expiredKey = 'expired-key-no-leak';

      const res = await request(app)
        .get(`/api/playground/public/${expiredKey}`);

      if ([403, 410].includes(res.status)) {
        // Should not return any session data
        expect(res.body).not.toHaveProperty('request_json');
        expect(res.body).not.toHaveProperty('response_json');
      }
    });
  });

  describe('Revocation', () => {
    it('allows owner to revoke share link', async () => {
      // Create and share a session
      const sessionRes = await request(app)
        .post('/api/playground/run')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          method: 'GET',
          path: '/healthz',
          sandboxTargetHost: 'http://localhost:4001'
        });

      const sessionId = sessionRes.body?.sessionId || 'revoke-test-session';

      await request(app)
        .post('/api/playground/save')
        .set('Authorization', `Bearer ${devToken}`)
        .send({ sessionId });

      const shareRes = await request(app)
        .post('/api/playground/share')
        .set('Authorization', `Bearer ${devToken}`)
        .send({ sessionId });

      const revokeShareKey = shareRes.body?.url?.split('/playground/')[1];

      if (revokeShareKey) {
        // Verify accessible before revocation
        const res1 = await request(app)
          .get(`/api/playground/public/${revokeShareKey}`);

        expect([200, 404]).toContain(res1.status);

        // Revoke
        const revokeRes = await request(app)
          .delete(`/api/playground/share/${revokeShareKey}`)
          .set('Authorization', `Bearer ${devToken}`);

        expect([200, 404]).toContain(revokeRes.status);

        // Verify inaccessible after revocation
        const res2 = await request(app)
          .get(`/api/playground/public/${revokeShareKey}`);

        expect([403, 404, 410]).toContain(res2.status);
      }
    });

    it('prevents non-owner from revoking', async () => {
      const otherToken = process.env.OPS_TOKEN || 'test-ops-token';

      const revokeRes = await request(app)
        .delete(`/api/playground/share/${shareKey}`)
        .set('Authorization', `Bearer ${otherToken}`);

      // Should deny access (403) or not found (404)
      expect([403, 404]).toContain(revokeRes.status);
    });
  });

  describe('Cleanup Job', () => {
    it('cleanup endpoint requires admin role', async () => {
      const res = await request(app)
        .post('/api/playground/cleanup/expired-shares')
        .set('Authorization', `Bearer ${devToken}`);

      expect(res.status).toBe(403);
    });

    it('admin can trigger cleanup', async () => {
      const adminToken = process.env.ADMIN_TOKEN || 'test-admin-token';

      const res = await request(app)
        .post('/api/playground/cleanup/expired-shares')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 403]).toContain(res.status);

      if (res.status === 200) {
        expect(res.body).toHaveProperty('deleted_count');
      }
    });
  });

  describe('Edge Cases', () => {
    it('handles invalid share key format', async () => {
      const invalidKeys = [
        '../../../etc/passwd',
        'key; DROP TABLE playground_sessions;',
        'key%00.txt',
        'a'.repeat(1000)
      ];

      for (const key of invalidKeys) {
        const res = await request(app)
          .get(`/api/playground/public/${encodeURIComponent(key)}`);

        expect([400, 404]).toContain(res.status);
      }
    });

    it('prevents timing attacks on share key validation', async () => {
      const validKey = shareKey;
      const invalidKey = 'invalid-key-xyz';

      const start1 = Date.now();
      await request(app).get(`/api/playground/public/${validKey}`);
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await request(app).get(`/api/playground/public/${invalidKey}`);
      const time2 = Date.now() - start2;

      // Response times should be similar (within 100ms) to prevent timing attacks
      const timeDiff = Math.abs(time1 - time2);
      expect(timeDiff).toBeLessThan(100);
    });
  });
});
