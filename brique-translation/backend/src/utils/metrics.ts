/**
 * BRIQUE TRANSLATION — Prometheus Metrics
 */
import client from "prom-client";

const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const translationRequests = new client.Counter({
  name: "molam_translation_requests_total",
  help: "Total translation requests",
  labelNames: ["source", "target", "namespace"]
});

export const translationCacheHits = new client.Counter({
  name: "molam_translation_cache_hits_total",
  help: "Translation cache hits",
  labelNames: ["source", "target", "namespace"]
});

export const translationLatency = new client.Histogram({
  name: "molam_translation_latency_seconds",
  help: "Translation latency in seconds",
  labelNames: ["source", "target", "namespace"],
  buckets: [0.01, 0.05, 0.1, 0.15, 0.25, 0.5, 1, 2, 5]
});

export const translationErrors = new client.Counter({
  name: "molam_translation_errors_total",
  help: "Translation errors",
  labelNames: ["source", "target", "namespace", "error_type"]
});

register.registerMetric(translationRequests);
register.registerMetric(translationCacheHits);
register.registerMetric(translationLatency);
register.registerMetric(translationErrors);

export function metricsMiddleware(req: any, res: any, next: any) {
  res.locals._metricsStart = Date.now();
  next();
}

export { register };
