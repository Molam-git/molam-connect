/**
 * Prometheus Metrics for Analytics System
 */

import client from 'prom-client';

export const metricsRegistry = new client.Registry();

// Default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register: metricsRegistry });

// Custom metrics
export const ingestEventsCounter = new client.Counter({
  name: 'analytics_ingest_events_total',
  help: 'Total number of ingested transaction events',
  labelNames: ['event_type', 'status'],
  registers: [metricsRegistry],
});

export const ingestErrorsCounter = new client.Counter({
  name: 'analytics_ingest_errors_total',
  help: 'Total number of ingestion errors',
  labelNames: ['error_type'],
  registers: [metricsRegistry],
});

export const apiRequestDuration = new client.Histogram({
  name: 'analytics_api_request_duration_seconds',
  help: 'API request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

export const apiRequestsTotal = new client.Counter({
  name: 'analytics_api_requests_total',
  help: 'Total number of API requests',
  labelNames: ['method', 'route', 'status'],
  registers: [metricsRegistry],
});

export const cacheHitsCounter = new client.Counter({
  name: 'analytics_cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type'],
  registers: [metricsRegistry],
});

export const cacheMissesCounter = new client.Counter({
  name: 'analytics_cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type'],
  registers: [metricsRegistry],
});

export const anomaliesDetected = new client.Counter({
  name: 'analytics_anomalies_detected_total',
  help: 'Total number of anomalies detected',
  labelNames: ['severity', 'metric'],
  registers: [metricsRegistry],
});

export const alertsCreated = new client.Counter({
  name: 'analytics_alerts_created_total',
  help: 'Total number of alerts created',
  labelNames: ['severity', 'source'],
  registers: [metricsRegistry],
});

export const aggregationLagGauge = new client.Gauge({
  name: 'analytics_aggregation_lag_seconds',
  help: 'Lag between event time and aggregation processing time',
  registers: [metricsRegistry],
});
