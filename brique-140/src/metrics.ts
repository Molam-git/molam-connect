/**
 * BRIQUE 140 — Prometheus Metrics
 */

import client from 'prom-client';

// Register default metrics
client.collectDefaultMetrics();

// Custom metrics
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.5, 1, 2, 5],
});

export const apiKeyAuthAttempts = new client.Counter({
  name: 'api_key_auth_attempts_total',
  help: 'Total API key authentication attempts',
  labelNames: ['status'], // success|failure
});

export const apiKeyUsage = new client.Counter({
  name: 'api_key_usage_total',
  help: 'Total API calls per key',
  labelNames: ['key_id', 'endpoint', 'status'],
});

export const activeApiKeys = new client.Gauge({
  name: 'active_api_keys',
  help: 'Number of active API keys',
});

/**
 * Metrics middleware
 */
export function metricsMiddleware(req: any, res: any, next: any) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.path, res.statusCode.toString())
      .observe(duration);
  });

  next();
}

/**
 * Metrics endpoint handler
 */
export async function metricsHandler(_req: any, res: any) {
  try {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  } catch (error) {
    res.status(500).end(error);
  }
}
