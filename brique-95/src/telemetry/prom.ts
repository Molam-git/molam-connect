/**
 * Prometheus Metrics Instrumentation
 * Industrial-grade metrics collection for routing service
 */

import client from 'prom-client';
import { Request, Response } from 'express';

// Create registry
export const register = new client.Registry();

// Collect default metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({
  register,
  prefix: 'routing_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

// =====================================================
// Routing Metrics
// =====================================================

/**
 * Total routing requests counter
 * Labels: route (wallet/connect/hybrid), result (success/fail/fallback), country, currency
 */
export const routingRequestsTotal = new client.Counter({
  name: 'routing_requests_total',
  help: 'Total number of routing requests',
  labelNames: ['route', 'result', 'country', 'currency'],
  registers: [register],
});

/**
 * Routing request duration histogram
 * Tracks latency of routing decisions
 */
export const routingDuration = new client.Histogram({
  name: 'routing_request_duration_seconds',
  help: 'Duration of routing requests in seconds',
  labelNames: ['route'],
  buckets: [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2],
  registers: [register],
});

/**
 * Routing decisions by route counter
 */
export const routingDecisionsByRoute = new client.Counter({
  name: 'routing_decisions_by_route_total',
  help: 'Total routing decisions by selected route',
  labelNames: ['route'],
  registers: [register],
});

/**
 * Cache hit counter
 * Labels: type (sira_cache/decision_cache)
 */
export const routingCacheHit = new client.Counter({
  name: 'routing_cache_hit_total',
  help: 'Total cache hits for routing',
  labelNames: ['type'],
  registers: [register],
});

/**
 * Cache miss counter
 */
export const routingCacheMiss = new client.Counter({
  name: 'routing_cache_miss_total',
  help: 'Total cache misses for routing',
  labelNames: ['type'],
  registers: [register],
});

/**
 * SIRA call latency histogram
 */
export const siraLatency = new client.Histogram({
  name: 'routing_sira_latency_seconds',
  help: 'SIRA API call latency in seconds',
  buckets: [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1],
  registers: [register],
});

/**
 * SIRA call failures counter
 */
export const siraCallsFailed = new client.Counter({
  name: 'routing_sira_calls_failed_total',
  help: 'Total failed SIRA API calls',
  labelNames: ['error_type'],
  registers: [register],
});

/**
 * Routing failures counter
 * Labels: error_type
 */
export const routingFailures = new client.Counter({
  name: 'routing_failures_total',
  help: 'Total routing failures',
  labelNames: ['error_type'],
  registers: [register],
});

/**
 * Idempotency conflicts counter
 */
export const idempotencyConflicts = new client.Counter({
  name: 'routing_idempotency_conflicts_total',
  help: 'Total idempotency key conflicts',
  registers: [register],
});

/**
 * Database error counter
 */
export const dbErrors = new client.Counter({
  name: 'routing_db_error_total',
  help: 'Total database errors',
  labelNames: ['operation'],
  registers: [register],
});

/**
 * Redis latency histogram
 */
export const redisLatency = new client.Histogram({
  name: 'routing_redis_latency_seconds',
  help: 'Redis operation latency in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.02, 0.05, 0.1],
  registers: [register],
});

/**
 * Queue depth gauge (if using job queues)
 */
export const queueDepth = new client.Gauge({
  name: 'routing_queue_depth',
  help: 'Current depth of routing job queue',
  labelNames: ['queue_name'],
  registers: [register],
});

/**
 * Retries counter
 */
export const routingRetries = new client.Counter({
  name: 'routing_retries_total',
  help: 'Total routing decision retries',
  labelNames: ['reason'],
  registers: [register],
});

/**
 * Rule evaluation counter
 */
export const ruleEvaluations = new client.Counter({
  name: 'routing_rule_evaluations_total',
  help: 'Total rule evaluations',
  labelNames: ['rule_type', 'matched'],
  registers: [register],
});

/**
 * Wallet availability check counter
 */
export const walletChecks = new client.Counter({
  name: 'routing_wallet_checks_total',
  help: 'Total wallet availability checks',
  labelNames: ['result'],
  registers: [register],
});

/**
 * Fallback route used counter
 */
export const fallbackUsed = new client.Counter({
  name: 'routing_fallback_used_total',
  help: 'Total times fallback route was used',
  labelNames: ['primary_route', 'fallback_route'],
  registers: [register],
});

// =====================================================
// HTTP Metrics
// =====================================================

/**
 * HTTP requests counter
 */
export const httpRequests = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register],
});

/**
 * HTTP request duration histogram
 */
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

// =====================================================
// Metrics Endpoint Handler
// =====================================================

/**
 * Express handler for /metrics endpoint
 */
export function metricsHandler(req: Request, res: Response): void {
  res.set('Content-Type', register.contentType);
  register
    .metrics()
    .then((metrics) => {
      res.end(metrics);
    })
    .catch((error) => {
      res.status(500).end(error.message);
    });
}

/**
 * Initialize metrics endpoint
 */
export function initMetrics(app: any): void {
  app.get('/metrics', metricsHandler);
  console.log('✓ Prometheus metrics endpoint initialized at /metrics');
}

// =====================================================
// Middleware
// =====================================================

/**
 * Express middleware to track HTTP metrics
 */
export function httpMetricsMiddleware() {
  return (req: Request, res: Response, next: Function) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;

      // Normalize path to avoid high cardinality
      const path = normalizePath(req.path);

      httpRequests.inc({
        method: req.method,
        path,
        status: res.statusCode.toString(),
      });

      httpRequestDuration.observe(
        {
          method: req.method,
          path,
          status: res.statusCode.toString(),
        },
        duration
      );
    });

    next();
  };
}

/**
 * Normalize path to avoid high cardinality
 */
function normalizePath(path: string): string {
  // Replace UUIDs with :id
  path = path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id');

  // Replace numeric IDs with :id
  path = path.replace(/\/\d+/g, '/:id');

  return path;
}

// =====================================================
// Helper Functions
// =====================================================

/**
 * Record routing decision metrics
 */
export function recordRoutingDecision(
  route: string,
  result: 'success' | 'fail' | 'fallback',
  country: string,
  currency: string,
  duration: number
): void {
  routingRequestsTotal.inc({ route, result, country, currency });
  routingDecisionsByRoute.inc({ route });
  routingDuration.observe({ route }, duration / 1000);
}

/**
 * Record cache metrics
 */
export function recordCacheMetrics(type: 'sira_cache' | 'decision_cache', hit: boolean): void {
  if (hit) {
    routingCacheHit.inc({ type });
  } else {
    routingCacheMiss.inc({ type });
  }
}

/**
 * Record SIRA call metrics
 */
export function recordSiraCall(duration: number, error: boolean = false, errorType?: string): void {
  if (error) {
    siraCallsFailed.inc({ error_type: errorType || 'unknown' });
  }
  siraLatency.observe(duration / 1000);
}

/**
 * Record database operation metrics
 */
export function recordDbOperation(operation: string, duration: number, error: boolean = false): void {
  if (error) {
    dbErrors.inc({ operation });
  }
  // Could add a db operation histogram here if needed
}

/**
 * Record Redis operation metrics
 */
export function recordRedisOperation(operation: string, duration: number): void {
  redisLatency.observe({ operation }, duration / 1000);
}

export default {
  register,
  initMetrics,
  httpMetricsMiddleware,
  recordRoutingDecision,
  recordCacheMetrics,
  recordSiraCall,
  recordDbOperation,
  recordRedisOperation,
};
