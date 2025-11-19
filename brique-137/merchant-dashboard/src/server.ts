// ============================================================================
// Merchant Dashboard Server
// ============================================================================

import express, { Request, Response } from "express";
import cors from "cors";
import { logger } from "./utils/logger";
import { dashboardRouter } from "./routes/merchant/dashboard";
import { pool } from "./utils/db";
import promClient from "prom-client";

const PORT = parseInt(process.env.PORT || "3000", 10);
const NODE_ENV = process.env.NODE_ENV || "development";

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info("HTTP Request", {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: duration,
      ip: req.ip,
    });
  });
  next();
});

// Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const httpRequestDuration = new promClient.Histogram({
  name: "molam_merchant_dashboard_http_request_duration_ms",
  help: "Duration of HTTP requests in ms",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

const kpiComputeDuration = new promClient.Histogram({
  name: "molam_merchant_kpi_compute_seconds",
  help: "Duration of KPI computation in seconds",
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});

const transactionsQueryLatency = new promClient.Histogram({
  name: "molam_merchant_transactions_query_latency_seconds",
  help: "Latency of transactions query in seconds",
  buckets: [0.1, 0.3, 0.5, 1, 2],
  registers: [register],
});

const refundsTotal = new promClient.Counter({
  name: "molam_merchant_refunds_total",
  help: "Total number of refunds initiated",
  labelNames: ["merchant_id", "status"],
  registers: [register],
});

// Export metrics for use in services
export const metrics = {
  httpRequestDuration,
  kpiComputeDuration,
  transactionsQueryLatency,
  refundsTotal,
};

// Routes
app.use("/api/merchant/dashboard", dashboardRouter);

// Health check
app.get("/health", async (req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || "1.0.0",
    });
  } catch (error: any) {
    logger.error("Health check failed", { error: error.message });
    res.status(503).json({ status: "unhealthy", error: error.message });
  }
});

// Readiness check
app.get("/ready", async (req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ready" });
  } catch (error: any) {
    res.status(503).json({ status: "not_ready", error: error.message });
  }
});

// Metrics endpoint
app.get("/metrics", async (req: Request, res: Response) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "not_found" });
});

// Error handler
app.use((err: any, req: Request, res: Response, next: any) => {
  logger.error("Unhandled error", {
    error: err.message,
    stack: err.stack,
    path: req.path,
  });
  res.status(500).json({ error: "internal_error" });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  logger.info(`Merchant Dashboard server listening on port ${PORT}`, {
    node_env: NODE_ENV,
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  pool.end().then(() => {
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  pool.end().then(() => {
    process.exit(0);
  });
});
