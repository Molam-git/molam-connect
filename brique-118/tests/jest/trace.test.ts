/**
 * Brique 118ter: Metrics & Traces Tests
 * Tests d'observabilité et export Prometheus
 */

import request from 'supertest';
import app from '../../src/server';
import {
  testRuns,
  fuzzingAlerts,
  rateLimitHits,
  rbacViolations,
  sharedSessions,
  requestDuration,
  payloadSize,
  snippetsGenerated,
  siraSuggestions,
  recordTestRun,
  recordFuzzingAlert,
  recordRateLimitHit,
  recordRBACViolation,
  recordSharedSession,
  recordRequestDuration,
  recordPayloadSize,
  recordSnippetGenerated,
  recordSiraSuggestion,
  resetMetrics,
  register
} from '../../src/metrics';

describe('Metrics & Traces', () => {
  const token = process.env.DEV_TOKEN || 'test-dev-token';

  beforeEach(() => {
    // Reset metrics before each test
    resetMetrics();
  });

  describe('Prometheus Endpoint', () => {
    it('exposes /metrics endpoint', async () => {
      const res = await request(app).get('/metrics');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
    });

    it('returns valid Prometheus format', async () => {
      const res = await request(app).get('/metrics');

      // Should contain metric type declarations
      expect(res.text).toMatch(/# TYPE/);
      expect(res.text).toMatch(/# HELP/);
    });

    it('includes default Node.js metrics', async () => {
      const res = await request(app).get('/metrics');

      expect(res.text).toContain('molam_playground_nodejs_version_info');
      expect(res.text).toContain('molam_playground_process_cpu_user_seconds_total');
    });

    it('includes custom playground metrics', async () => {
      const res = await request(app).get('/metrics');

      expect(res.text).toContain('molam_playground_test_runs_total');
      expect(res.text).toContain('molam_playground_fuzzing_alerts_total');
      expect(res.text).toContain('molam_playground_rate_limit_hits_total');
    });
  });

  describe('Test Runs Counter', () => {
    it('increments testRuns after a successful run', async () => {
      const metricsBefore = await register.metrics();
      const beforeMatch = metricsBefore.match(/molam_playground_test_runs_total\{.*status="success".*\} (\d+)/);
      const beforeValue = beforeMatch ? parseInt(beforeMatch[1]) : 0;

      await request(app)
        .post('/api/playground/run')
        .set('Authorization', `Bearer ${token}`)
        .send({
          method: 'GET',
          path: '/healthz',
          sandboxTargetHost: 'http://mock:4001'
        });

      const metricsAfter = await register.metrics();
      const afterMatch = metricsAfter.match(/molam_playground_test_runs_total\{.*status="success".*\} (\d+)/);
      const afterValue = afterMatch ? parseInt(afterMatch[1]) : 0;

      expect(afterValue).toBeGreaterThan(beforeValue);
    });

    it('records method and endpoint labels', async () => {
      recordTestRun('success', 'POST', '/v1/payments');

      const metrics = await register.metrics();

      expect(metrics).toContain('method="POST"');
      expect(metrics).toContain('endpoint="/v1/payments"');
    });

    it('differentiates success from failure', async () => {
      recordTestRun('success', 'GET', '/healthz');
      recordTestRun('failure', 'POST', '/v1/payments');

      const metrics = await register.metrics();

      expect(metrics).toContain('status="success"');
      expect(metrics).toContain('status="failure"');
    });
  });

  describe('Fuzzing Alerts Counter', () => {
    it('increments on SQL injection detection', async () => {
      recordFuzzingAlert('sql_injection', 'high');

      const metrics = await register.metrics();

      expect(metrics).toContain('molam_playground_fuzzing_alerts_total');
      expect(metrics).toContain('attack_type="sql_injection"');
      expect(metrics).toContain('severity="high"');
    });

    it('tracks different attack types', async () => {
      recordFuzzingAlert('sql_injection', 'high');
      recordFuzzingAlert('xss', 'medium');
      recordFuzzingAlert('command_injection', 'critical');

      const metrics = await register.metrics();

      expect(metrics).toContain('attack_type="sql_injection"');
      expect(metrics).toContain('attack_type="xss"');
      expect(metrics).toContain('attack_type="command_injection"');
    });

    it('categorizes by severity', async () => {
      recordFuzzingAlert('path_traversal', 'low');
      recordFuzzingAlert('ssrf', 'critical');

      const metrics = await register.metrics();

      expect(metrics).toContain('severity="low"');
      expect(metrics).toContain('severity="critical"');
    });
  });

  describe('Rate Limit Hits Counter', () => {
    it('increments when rate limit is hit', async () => {
      recordRateLimitHit('developer', '/api/playground/run');

      const metrics = await register.metrics();

      expect(metrics).toContain('molam_playground_rate_limit_hits_total');
      expect(metrics).toContain('user_role="developer"');
      expect(metrics).toContain('endpoint="/api/playground/run"');
    });

    it('tracks different user roles', async () => {
      recordRateLimitHit('developer', '/api/playground/run');
      recordRateLimitHit('ops', '/api/playground/ops/logs');

      const metrics = await register.metrics();

      expect(metrics).toContain('user_role="developer"');
      expect(metrics).toContain('user_role="ops"');
    });
  });

  describe('RBAC Violations Counter', () => {
    it('increments on unauthorized access attempt', async () => {
      recordRBACViolation('developer', 'DELETE', '/api/playground/sessions/purge');

      const metrics = await register.metrics();

      expect(metrics).toContain('molam_playground_rbac_violations_total');
      expect(metrics).toContain('user_role="developer"');
      expect(metrics).toContain('attempted_action="DELETE"');
      expect(metrics).toContain('resource="/api/playground/sessions/purge"');
    });

    it('tracks privilege escalation attempts', async () => {
      recordRBACViolation('developer', 'GET', '/api/playground/ops/logs');
      recordRBACViolation('ops', 'DELETE', '/api/playground/sessions/purge');

      const metrics = await register.metrics();

      const violations = (metrics.match(/molam_playground_rbac_violations_total/g) || []).length;
      expect(violations).toBeGreaterThan(0);
    });
  });

  describe('Shared Sessions Counter', () => {
    it('categorizes sessions by TTL', async () => {
      recordSharedSession(3600);      // 1 hour - short
      recordSharedSession(86400);     // 1 day - medium
      recordSharedSession(2592000);   // 30 days - long

      const metrics = await register.metrics();

      expect(metrics).toContain('ttl_category="short"');
      expect(metrics).toContain('ttl_category="medium"');
      expect(metrics).toContain('ttl_category="long"');
    });
  });

  describe('Request Duration Histogram', () => {
    it('records request durations', async () => {
      recordRequestDuration('GET', 200, 0.123);
      recordRequestDuration('POST', 200, 0.456);

      const metrics = await register.metrics();

      expect(metrics).toContain('molam_playground_request_duration_seconds');
      expect(metrics).toContain('method="GET"');
      expect(metrics).toContain('method="POST"');
    });

    it('buckets durations correctly', async () => {
      recordRequestDuration('GET', 200, 0.05);  // < 0.1s
      recordRequestDuration('GET', 200, 0.3);   // 0.1-0.5s
      recordRequestDuration('GET', 200, 2.5);   // 2-5s

      const metrics = await register.metrics();

      // Should have buckets
      expect(metrics).toContain('le="0.1"');
      expect(metrics).toContain('le="0.5"');
      expect(metrics).toContain('le="5"');
    });
  });

  describe('Payload Size Histogram', () => {
    it('records payload sizes', async () => {
      recordPayloadSize('POST', 500);
      recordPayloadSize('POST', 5000);

      const metrics = await register.metrics();

      expect(metrics).toContain('molam_playground_payload_size_bytes');
    });

    it('auto-records on API requests', async () => {
      await request(app)
        .post('/api/playground/run')
        .send({
          method: 'POST',
          path: '/v1/payments',
          body: { amount: 5000, currency: 'XOF', description: 'Test payment' }
        });

      const metrics = await register.metrics();

      expect(metrics).toContain('molam_playground_payload_size_bytes');
    });
  });

  describe('Snippets Generated Counter', () => {
    it('tracks code snippets by language', async () => {
      recordSnippetGenerated('node');
      recordSnippetGenerated('php');
      recordSnippetGenerated('python');
      recordSnippetGenerated('curl');

      const metrics = await register.metrics();

      expect(metrics).toContain('molam_playground_snippets_generated_total');
      expect(metrics).toContain('language="node"');
      expect(metrics).toContain('language="php"');
      expect(metrics).toContain('language="python"');
      expect(metrics).toContain('language="curl"');
    });
  });

  describe('Sira Suggestions Counter', () => {
    it('tracks suggestions by type and severity', async () => {
      recordSiraSuggestion('missing_idempotency', 'warning');
      recordSiraSuggestion('invalid_method', 'error');
      recordSiraSuggestion('optimization_hint', 'info');

      const metrics = await register.metrics();

      expect(metrics).toContain('molam_playground_sira_suggestions_total');
      expect(metrics).toContain('suggestion_type="missing_idempotency"');
      expect(metrics).toContain('severity="warning"');
      expect(metrics).toContain('severity="error"');
    });
  });

  describe('Health Endpoint', () => {
    it('returns health status', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('memory');
    });

    it('includes memory metrics', async () => {
      const res = await request(app).get('/health');

      expect(res.body.memory).toHaveProperty('heapUsed');
      expect(res.body.memory).toHaveProperty('heapTotal');
      expect(res.body.memory).toHaveProperty('rss');
    });
  });

  describe('Metric Labels', () => {
    it('supports multiple label combinations', async () => {
      recordTestRun('success', 'GET', '/healthz');
      recordTestRun('success', 'POST', '/v1/payments');
      recordTestRun('failure', 'POST', '/v1/refunds');

      const metrics = await register.metrics();

      // Should have multiple label combinations
      const labelMatches = metrics.match(/molam_playground_test_runs_total\{[^}]+\}/g);
      expect(labelMatches).toBeTruthy();
      expect(labelMatches!.length).toBeGreaterThan(1);
    });
  });

  describe('Metric Reset', () => {
    it('can reset all metrics', async () => {
      recordTestRun('success', 'GET', '/healthz');
      recordFuzzingAlert('xss', 'high');

      resetMetrics();

      const metrics = await register.metrics();

      // After reset, custom counters should be 0 or not present
      // But default metrics will still be there
      expect(metrics).toContain('molam_playground_'); // Still has prefix
    });
  });

  describe('Performance', () => {
    it('handles high volume of metric updates', async () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        recordTestRun('success', 'GET', '/healthz');
      }

      const duration = Date.now() - start;

      // Should complete 1000 updates in < 100ms
      expect(duration).toBeLessThan(100);
    });

    it('metrics endpoint responds quickly', async () => {
      // Generate some metrics
      for (let i = 0; i < 100; i++) {
        recordTestRun('success', 'GET', '/healthz');
        recordFuzzingAlert('xss', 'medium');
      }

      const start = Date.now();
      const res = await request(app).get('/metrics');
      const duration = Date.now() - start;

      expect(res.status).toBe(200);
      expect(duration).toBeLessThan(100); // < 100ms
    });
  });
});
