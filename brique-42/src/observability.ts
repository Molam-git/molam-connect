/**
 * Brique 42 - Connect Payments
 * Observability: Logging (Pino) + Metrics (Prometheus)
 *
 * Provides structured logging and metrics collection
 */

import pino from "pino";
import { Request, Response, NextFunction } from "express";
import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

// ============================================================================
// Pino Logger
// ============================================================================

/**
 * Structured logger with pretty-print in development
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        }
      : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  base: {
    service: "brique-42-payments",
    env: process.env.NODE_ENV || "development",
  },
});

/**
 * Express middleware for request logging
 */
export function loggerMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  // Log on response finish
  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

    logger[level]({
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      duration_ms: duration,
      user_id: (req as any).user?.id,
      ip: req.ip || req.socket.remoteAddress,
    });
  });

  next();
}

// ============================================================================
// Prometheus Metrics
// ============================================================================

/**
 * Prometheus registry
 */
export const register = new Registry();

// Collect default metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({
  register,
  prefix: "b42_",
  labels: { service: "brique-42-payments" },
});

// Custom metrics

/**
 * HTTP request duration histogram
 */
export const httpDuration = new Histogram({
  name: "b42_http_request_duration_ms",
  help: "Duration of HTTP requests in milliseconds",
  labelNames: ["method", "route", "status"],
  buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
  registers: [register],
});

/**
 * HTTP request counter
 */
export const httpCounter = new Counter({
  name: "b42_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

/**
 * Transaction counter (for payment intents, charges, refunds)
 */
export const txCounter = new Counter({
  name: "b42_transactions_total",
  help: "Total number of payment transactions",
  labelNames: ["type", "status", "method", "currency"],
  registers: [register],
});

/**
 * Transaction amount gauge (for monitoring volume)
 */
export const txAmount = new Counter({
  name: "b42_transaction_amount_total",
  help: "Total transaction amount processed",
  labelNames: ["type", "currency", "method"],
  registers: [register],
});

/**
 * Webhook delivery counter
 */
export const webhookCounter = new Counter({
  name: "b42_webhook_deliveries_total",
  help: "Total number of webhook delivery attempts",
  labelNames: ["status", "attempt"],
  registers: [register],
});

/**
 * Webhook delivery duration
 */
export const webhookDuration = new Histogram({
  name: "b42_webhook_delivery_duration_ms",
  help: "Duration of webhook delivery in milliseconds",
  labelNames: ["status"],
  buckets: [50, 100, 200, 500, 1000, 2000, 5000, 10000],
  registers: [register],
});

/**
 * SIRA risk score histogram
 */
export const siraScore = new Histogram({
  name: "b42_sira_risk_score",
  help: "SIRA risk scores for transactions",
  labelNames: ["label"],
  buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  registers: [register],
});

/**
 * Payout eligibility counter
 */
export const payoutCounter = new Counter({
  name: "b42_payout_eligibility_total",
  help: "Total number of charges made eligible for payout",
  labelNames: ["hold_days", "risk_label"],
  registers: [register],
});

/**
 * Express middleware for metrics collection
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
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
export async function metricsHandler(req: Request, res: Response) {
  try {
    res.set("Content-Type", register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    logger.error({ error }, "Error collecting metrics");
    res.status(500).end("Error collecting metrics");
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Record a transaction metric
 */
export function recordTransaction(
  type: "intent" | "charge" | "refund",
  status: string,
  amount: number,
  currency: string,
  method: string
) {
  txCounter.inc({ type, status, method, currency });
  txAmount.inc({ type, currency, method }, amount);

  logger.info({
    event: "transaction_recorded",
    type,
    status,
    amount,
    currency,
    method,
  });
}

/**
 * Record SIRA risk score
 */
export function recordRiskScore(score: number, label: string) {
  siraScore.observe({ label }, score);

  logger.info({
    event: "risk_score_recorded",
    score,
    label,
  });
}

/**
 * Record webhook delivery
 */
export function recordWebhookDelivery(status: "ok" | "retry" | "failed", attempt: number, duration: number) {
  webhookCounter.inc({ status, attempt: attempt.toString() });
  webhookDuration.observe({ status }, duration);

  logger.info({
    event: "webhook_delivery_recorded",
    status,
    attempt,
    duration_ms: duration,
  });
}

/**
 * Record payout eligibility
 */
export function recordPayoutEligibility(holdDays: number, riskLabel: string) {
  payoutCounter.inc({ hold_days: holdDays.toString(), risk_label: riskLabel });

  logger.info({
    event: "payout_eligibility_recorded",
    hold_days: holdDays,
    risk_label: riskLabel,
  });
}
