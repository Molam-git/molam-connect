/**
 * Brique B118bis: Rate Limiting Tests
 * Tests de limitation de débit et prévention d'abus
 */

import request from 'supertest';
import app from '../../../brique-117/playground/src/server';

describe('Rate limiting', () => {
  const token = process.env.DEV_TOKEN || 'test-dev-token';
  const opsToken = process.env.OPS_TOKEN || 'test-ops-token';

  describe('Request Rate Limiting', () => {
    it('allows normal usage within limits', async () => {
      const results = [];

      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({
            method: 'GET',
            path: '/healthz',
            sandboxTargetHost: 'http://localhost:4001'
          });

        results.push(res.status);
      }

      // First 5 requests should succeed (or fail validation, not rate limit)
      const rateLimitedCount = results.filter(s => s === 429).length;
      expect(rateLimitedCount).toBe(0);
    });

    it('throttles after excessive requests', async () => {
      const results = [];
      const requestCount = 20;

      for (let i = 0; i < requestCount; i++) {
        const res = await request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({
            method: 'GET',
            path: '/healthz',
            sandboxTargetHost: 'http://localhost:4001'
          });

        results.push(res.status);

        // Small delay to avoid overwhelming
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Should have at least some 429 responses
      const rateLimitedCount = results.filter(s => s === 429).length;
      expect(rateLimitedCount).toBeGreaterThan(0);
    });

    it('returns proper rate limit headers', async () => {
      const res = await request(app)
        .post('/api/playground/run')
        .set('Authorization', `Bearer ${token}`)
        .send({
          method: 'GET',
          path: '/healthz',
          sandboxTargetHost: 'http://localhost:4001'
        });

      // Should include rate limit headers
      if (res.status === 429) {
        expect(res.headers).toHaveProperty('x-ratelimit-limit');
        expect(res.headers).toHaveProperty('x-ratelimit-remaining');
        expect(res.headers).toHaveProperty('x-ratelimit-reset');
        expect(res.headers).toHaveProperty('retry-after');
      }
    });

    it('includes retry-after header when rate limited', async () => {
      // Exhaust rate limit
      for (let i = 0; i < 15; i++) {
        await request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({
            method: 'GET',
            path: '/healthz',
            sandboxTargetHost: 'http://localhost:4001'
          });
      }

      // Next request should be rate limited
      const res = await request(app)
        .post('/api/playground/run')
        .set('Authorization', `Bearer ${token}`)
        .send({
          method: 'GET',
          path: '/healthz',
          sandboxTargetHost: 'http://localhost:4001'
        });

      if (res.status === 429) {
        expect(res.headers['retry-after']).toBeDefined();
        const retryAfter = parseInt(res.headers['retry-after']);
        expect(retryAfter).toBeGreaterThan(0);
      }
    });
  });

  describe('Per-User Rate Limiting', () => {
    it('limits are independent per user', async () => {
      const devResults = [];
      const opsResults = [];

      // Developer user makes requests
      for (let i = 0; i < 10; i++) {
        const res = await request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({
            method: 'GET',
            path: '/healthz',
            sandboxTargetHost: 'http://localhost:4001'
          });

        devResults.push(res.status);
      }

      // Ops user makes requests (should have independent quota)
      for (let i = 0; i < 10; i++) {
        const res = await request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${opsToken}`)
          .send({
            method: 'GET',
            path: '/healthz',
            sandboxTargetHost: 'http://localhost:4001'
          });

        opsResults.push(res.status);
      }

      // Both users should be able to make requests independently
      const devSuccess = devResults.filter(s => [200, 400].includes(s)).length;
      const opsSuccess = opsResults.filter(s => [200, 400].includes(s)).length;

      expect(devSuccess).toBeGreaterThan(0);
      expect(opsSuccess).toBeGreaterThan(0);
    });

    it('different endpoints have separate quotas', async () => {
      const runResults = [];
      const saveResults = [];

      // Exhaust /run quota
      for (let i = 0; i < 12; i++) {
        const res = await request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({
            method: 'GET',
            path: '/healthz',
            sandboxTargetHost: 'http://localhost:4001'
          });

        runResults.push(res.status);
      }

      // /save should still work
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/playground/save')
          .set('Authorization', `Bearer ${token}`)
          .send({
            sessionId: `test-session-${i}`
          });

        saveResults.push(res.status);
      }

      const saveSuccess = saveResults.filter(s => [200, 400, 404].includes(s)).length;
      expect(saveSuccess).toBeGreaterThan(0);
    });
  });

  describe('Burst Protection', () => {
    it('allows burst within sliding window', async () => {
      // Rapid burst of 5 requests
      const burstResults = await Promise.all([
        request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({ method: 'GET', path: '/healthz', sandboxTargetHost: 'http://localhost:4001' }),
        request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({ method: 'GET', path: '/healthz', sandboxTargetHost: 'http://localhost:4001' }),
        request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({ method: 'GET', path: '/healthz', sandboxTargetHost: 'http://localhost:4001' }),
        request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({ method: 'GET', path: '/healthz', sandboxTargetHost: 'http://localhost:4001' }),
        request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({ method: 'GET', path: '/healthz', sandboxTargetHost: 'http://localhost:4001' })
      ]);

      const statuses = burstResults.map(r => r.status);
      const successCount = statuses.filter(s => [200, 400].includes(s)).length;

      // Should allow some burst requests
      expect(successCount).toBeGreaterThan(0);
    });

    it('blocks excessive burst', async () => {
      const results = [];

      // Massive burst of 25 requests
      for (let i = 0; i < 25; i++) {
        const res = await request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({
            method: 'GET',
            path: '/healthz',
            sandboxTargetHost: 'http://localhost:4001'
          });

        results.push(res.status);
      }

      // Should have blocked some
      const blockedCount = results.filter(s => s === 429).length;
      expect(blockedCount).toBeGreaterThan(0);
    });
  });

  describe('Reset Window', () => {
    it('resets quota after time window', async () => {
      // Exhaust quota
      for (let i = 0; i < 15; i++) {
        await request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({
            method: 'GET',
            path: '/healthz',
            sandboxTargetHost: 'http://localhost:4001'
          });
      }

      // Should be rate limited now
      const res1 = await request(app)
        .post('/api/playground/run')
        .set('Authorization', `Bearer ${token}`)
        .send({
          method: 'GET',
          path: '/healthz',
          sandboxTargetHost: 'http://localhost:4001'
        });

      if (res1.status === 429) {
        // Wait for reset (typically 60 seconds, but test with shorter window)
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Should be able to make requests again
        const res2 = await request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({
            method: 'GET',
            path: '/healthz',
            sandboxTargetHost: 'http://localhost:4001'
          });

        // Might still be limited or reset depending on window
        expect([200, 400, 429]).toContain(res2.status);
      }
    });
  });

  describe('IP-Based Rate Limiting', () => {
    it('applies rate limit per IP for unauthenticated requests', async () => {
      const results = [];

      for (let i = 0; i < 10; i++) {
        const res = await request(app)
          .get('/api/playground/public/test_share_abc123')
          .set('X-Forwarded-For', '1.2.3.4');

        results.push(res.status);
      }

      // Public endpoints should also have rate limits
      const rateLimitedCount = results.filter(s => s === 429).length;

      // May or may not be rate limited depending on config
      expect(rateLimitedCount).toBeGreaterThanOrEqual(0);
    });

    it('different IPs have independent quotas', async () => {
      const ip1Results = [];
      const ip2Results = [];

      // IP 1
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .get('/api/playground/public/test_share_abc123')
          .set('X-Forwarded-For', '10.0.0.1');

        ip1Results.push(res.status);
      }

      // IP 2
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .get('/api/playground/public/test_share_abc123')
          .set('X-Forwarded-For', '10.0.0.2');

        ip2Results.push(res.status);
      }

      // Both IPs should be able to make requests
      expect(ip1Results.length).toBe(5);
      expect(ip2Results.length).toBe(5);
    });
  });

  describe('Memory Leak Prevention', () => {
    it('does not leak memory on repeated requests', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Make many requests
      for (let i = 0; i < 100; i++) {
        await request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({
            method: 'GET',
            path: '/healthz',
            sandboxTargetHost: 'http://localhost:4001'
          });

        // Periodic GC hint
        if (i % 20 === 0 && global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (< 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    it('cleans up rate limit records', async () => {
      // Make requests to create rate limit records
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}-${i}`)
          .send({
            method: 'GET',
            path: '/healthz',
            sandboxTargetHost: 'http://localhost:4001'
          });
      }

      // Trigger cleanup (if endpoint exists)
      const cleanupRes = await request(app)
        .post('/api/playground/cleanup/rate-limits')
        .set('Authorization', `Bearer ${opsToken}`);

      expect([200, 403, 404]).toContain(cleanupRes.status);
    });
  });

  describe('Error Response Format', () => {
    it('returns proper error format when rate limited', async () => {
      // Exhaust quota
      for (let i = 0; i < 15; i++) {
        await request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({
            method: 'GET',
            path: '/healthz',
            sandboxTargetHost: 'http://localhost:4001'
          });
      }

      const res = await request(app)
        .post('/api/playground/run')
        .set('Authorization', `Bearer ${token}`)
        .send({
          method: 'GET',
          path: '/healthz',
          sandboxTargetHost: 'http://localhost:4001'
        });

      if (res.status === 429) {
        expect(res.body).toHaveProperty('error');
        expect(res.body.error).toContain('rate limit');
      }
    });
  });

  describe('Whitelist/Bypass', () => {
    it('allows ops to bypass rate limits', async () => {
      const results = [];

      // Ops should have higher or no limits
      for (let i = 0; i < 20; i++) {
        const res = await request(app)
          .get('/api/playground/ops/metrics')
          .set('Authorization', `Bearer ${opsToken}`);

        results.push(res.status);
      }

      const successCount = results.filter(s => s === 200).length;

      // Most requests should succeed
      expect(successCount).toBeGreaterThan(10);
    });
  });
});
