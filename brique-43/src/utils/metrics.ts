/**
 * Brique 43 - Checkout Orchestration
 * Prometheus Metrics
 */

import { Request, Response, Application } from "express";
import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export const register = new Registry();

// Collect default metrics
collectDefaultMetrics({
  register,
  prefix: "b43_",
  labels: { service: "brique-43-checkout" },
});

// Custom metrics

export const httpDuration = new Histogram({
  name: "b43_http_request_duration_ms",
  help: "Duration of HTTP requests in milliseconds",
  labelNames: ["method", "route", "status"],
  buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
  registers: [register],
});

export const httpCounter = new Counter({
  name: "b43_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

export const intentCounter = new Counter({
  name: "b43_payment_intents_total",
  help: "Total number of payment intents",
  labelNames: ["status", "route", "currency"],
  registers: [register],
});

export const attemptCounter = new Counter({
  name: "b43_payment_attempts_total",
  help: "Total number of payment attempts",
  labelNames: ["route", "status", "provider"],
  registers: [register],
});

export const challengeCounter = new Counter({
  name: "b43_payment_challenges_total",
  help: "Total number of payment challenges",
  labelNames: ["type", "status", "channel"],
  registers: [register],
});

export const webhookCounter = new Counter({
  name: "b43_webhook_deliveries_total",
  help: "Total number of webhook deliveries",
  labelNames: ["status"],
  registers: [register],
});

/**
 * Metrics middleware
 */
export function metricsMiddleware(req: Request, res: Response, next: any): void {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const route = req.route?.path || req.path || "unknown";
    const labels = {
      method: req.method,
      route,
      status: res.statusCode.toString(),
    };

    httpDuration.observe(labels, duration);
    httpCounter.inc(labels);
  });

  next();
}

/**
 * Metrics endpoint handler
 */
export async function metricsHandler(req: Request, res: Response): Promise<void> {
  try {
    res.set("Content-Type", register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    console.error("Error collecting metrics:", error);
    res.status(500).end("Error collecting metrics");
  }
}

/**
 * Initialize metrics middleware on app
 */
export function initMetrics(app: Application): void {
  app.use(metricsMiddleware);
}
