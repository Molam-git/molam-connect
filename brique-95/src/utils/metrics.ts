/**
 * Metrics and observability utilities
 * Prometheus-compatible metrics collection
 */

import express, { Request, Response } from 'express';

// Simple in-memory metrics store
// In production, use a proper metrics library like prom-client
const metrics: Map<string, any> = new Map();

/**
 * Record a metric
 */
export function recordMetric(
  name: string,
  value: number,
  labels: Record<string, string> = {}
): void {
  const key = `${name}${JSON.stringify(labels)}`;

  if (!metrics.has(key)) {
    metrics.set(key, {
      name,
      labels,
      type: 'counter',
      value: 0,
      last_updated: new Date()
    });
  }

  const metric = metrics.get(key);
  metric.value += value;
  metric.last_updated = new Date();
}

/**
 * Record a histogram/timing metric
 */
export function recordHistogram(
  name: string,
  value: number,
  labels: Record<string, string> = {}
): void {
  const key = `${name}${JSON.stringify(labels)}`;

  if (!metrics.has(key)) {
    metrics.set(key, {
      name,
      labels,
      type: 'histogram',
      values: [],
      count: 0,
      sum: 0,
      last_updated: new Date()
    });
  }

  const metric = metrics.get(key);
  metric.values.push(value);
  metric.count++;
  metric.sum += value;
  metric.last_updated = new Date();

  // Keep only last 1000 values
  if (metric.values.length > 1000) {
    metric.values.shift();
  }
}

/**
 * Get all metrics
 */
export function getMetrics(): any[] {
  return Array.from(metrics.values());
}

/**
 * Get specific metric
 */
export function getMetric(name: string): any | null {
  for (const [key, metric] of metrics.entries()) {
    if (metric.name === name) {
      return metric;
    }
  }
  return null;
}

/**
 * Reset all metrics
 */
export function resetMetrics(): void {
  metrics.clear();
}

/**
 * Format metrics in Prometheus format
 */
export function formatPrometheusMetrics(): string {
  let output = '';

  const now = Date.now();

  for (const metric of metrics.values()) {
    const { name, labels, type, value, values, count, sum } = metric;

    // Labels string
    const labelsStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    const labelsPart = labelsStr ? `{${labelsStr}}` : '';

    if (type === 'counter') {
      output += `# TYPE ${name} counter\n`;
      output += `${name}${labelsPart} ${value}\n`;
    } else if (type === 'histogram' && values && values.length > 0) {
      const sorted = [...values].sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
      const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
      const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;

      output += `# TYPE ${name} histogram\n`;
      output += `${name}_count${labelsPart} ${count}\n`;
      output += `${name}_sum${labelsPart} ${sum}\n`;
      output += `${name}_bucket{le="50",${labelsStr}} ${p50}\n`;
      output += `${name}_bucket{le="95",${labelsStr}} ${p95}\n`;
      output += `${name}_bucket{le="99",${labelsStr}} ${p99}\n`;
    }

    output += '\n';
  }

  return output;
}

/**
 * Initialize metrics endpoint
 */
export function initMetrics(app: express.Application): void {
  app.get('/metrics', (req: Request, res: Response) => {
    res.set('Content-Type', 'text/plain');
    res.send(formatPrometheusMetrics());
  });

  console.log('✓ Metrics endpoint initialized at /metrics');
}

/**
 * Middleware to track request metrics
 */
export function metricsMiddleware() {
  return (req: Request, res: Response, next: Function) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;

      recordHistogram('http_request_duration_ms', duration, {
        method: req.method,
        path: req.path,
        status: res.statusCode.toString()
      });

      recordMetric('http_requests_total', 1, {
        method: req.method,
        path: req.path,
        status: res.statusCode.toString()
      });
    });

    next();
  };
}

export default {
  recordMetric,
  recordHistogram,
  getMetrics,
  getMetric,
  resetMetrics,
  formatPrometheusMetrics,
  initMetrics,
  metricsMiddleware
};
