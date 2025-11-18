// Prometheus metrics for reconciliation monitoring
import * as promClient from 'prom-client';

// Create a Registry
export const register = new promClient.Registry();

// Add default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

// Custom metrics for reconciliation
export const recoLinesProcessed = new promClient.Counter({
  name: 'reco_lines_processed_total',
  help: 'Total number of statement lines processed',
  labelNames: ['bank_profile_id', 'status'],
  registers: [register],
});

export const recoMatchRate = new promClient.Gauge({
  name: 'reco_match_rate',
  help: 'Current reconciliation match rate (percentage)',
  labelNames: ['bank_profile_id'],
  registers: [register],
});

export const recoLatency = new promClient.Histogram({
  name: 'reco_latency_seconds',
  help: 'Reconciliation processing latency in seconds',
  labelNames: ['operation', 'bank_profile_id'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const recoQueueSize = new promClient.Gauge({
  name: 'reco_queue_size',
  help: 'Current size of manual reconciliation queue',
  labelNames: ['severity'],
  registers: [register],
});

export const recoDLQTotal = new promClient.Counter({
  name: 'reco_dlq_total',
  help: 'Total number of lines sent to dead letter queue',
  labelNames: ['reason'],
  registers: [register],
});

export const recoParseErrors = new promClient.Counter({
  name: 'reco_parse_errors_total',
  help: 'Total number of statement parsing errors',
  labelNames: ['file_type', 'bank_profile_id'],
  registers: [register],
});

// Helper to measure operation duration
export function measureDuration<T>(
  metric: promClient.Histogram<string>,
  labels: Record<string, string>,
  fn: () => Promise<T>
): Promise<T> {
  const end = metric.startTimer(labels);
  return fn().finally(() => end());
}
