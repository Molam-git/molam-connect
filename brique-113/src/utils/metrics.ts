/**
 * Brique 113: Prometheus Metrics
 */

import { Express } from 'express';
import client from 'prom-client';

// Create a Registry
const register = new client.Registry();

// Add default metrics (memory, CPU, etc.)
client.collectDefaultMetrics({ register });

// Custom metrics for inference
export const inferenceRequestsTotal = new client.Counter({
  name: 'sira_inference_requests_total',
  help: 'Total number of inference requests',
  labelNames: ['product', 'model_id', 'model_role', 'decision', 'status'],
  registers: [register],
});

export const inferenceLatencyHistogram = new client.Histogram({
  name: 'sira_inference_latency_seconds',
  help: 'Inference latency in seconds',
  labelNames: ['product', 'model_id', 'model_role'],
  buckets: [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2],
  registers: [register],
});

export const cacheHitsTotal = new client.Counter({
  name: 'sira_inference_cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type'], // 'memory' | 'redis'
  registers: [register],
});

export const cacheMissesTotal = new client.Counter({
  name: 'sira_inference_cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type'],
  registers: [register],
});

export const modelsLoadedGauge = new client.Gauge({
  name: 'sira_models_loaded',
  help: 'Number of models currently loaded in memory',
  registers: [register],
});

export const modelLoadErrorsTotal = new client.Counter({
  name: 'sira_model_load_errors_total',
  help: 'Total number of model load errors',
  labelNames: ['model_id', 'error_type'],
  registers: [register],
});

export const predictionErrorsTotal = new client.Counter({
  name: 'sira_prediction_errors_total',
  help: 'Total number of prediction errors',
  labelNames: ['product', 'model_id', 'error_type'],
  registers: [register],
});

export const canaryTrafficRatio = new client.Gauge({
  name: 'sira_canary_traffic_ratio',
  help: 'Current canary traffic ratio (0-1)',
  labelNames: ['product'],
  registers: [register],
});

export const modelPerformanceGauge = new client.Gauge({
  name: 'sira_model_performance',
  help: 'Model performance metrics',
  labelNames: ['product', 'model_id', 'model_role', 'metric_name'],
  registers: [register],
});

/**
 * Initialize Prometheus metrics endpoint
 */
export function initPrometheus(app: Express): void {
  app.get('/metrics', async (_req, res) => {
    try {
      res.set('Content-Type', register.contentType);
      const metrics = await register.metrics();
      res.end(metrics);
    } catch (err) {
      res.status(500).end(err);
    }
  });
}

export { register };
