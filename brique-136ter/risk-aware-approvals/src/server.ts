// ============================================================================
// Risk-Aware Approvals Server
// ============================================================================

import express, { Request, Response } from "express";
import { logger } from "./logger";
import { approvalsRouter } from "./routes/approvals";
import { pool } from "./db";
import promClient from "prom-client";

const PORT = parseInt(process.env.PORT || "3000", 10);

const app = express();

// Middleware
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
  name: "molam_approvals_http_request_duration_ms",
  help: "Duration of HTTP requests in ms",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

const approvalCreatedCounter = new promClient.Counter({
  name: "molam_approvals_created_total",
  help: "Total number of approval requests created",
  labelNames: ["action_type", "status"],
  registers: [register],
});

const approvalDecidedCounter = new promClient.Counter({
  name: "molam_approvals_decided_total",
  help: "Total number of approvals decided",
  labelNames: ["status"],
  registers: [register],
});

const siraScoreHistogram = new promClient.Histogram({
  name: "molam_approvals_sira_score",
  help: "Distribution of SIRA scores",
  buckets: [0, 25, 50, 60, 70, 80, 85, 90, 95, 100],
  registers: [register],
});

// Export metrics for use in services
export const metrics = {
  httpRequestDuration,
  approvalCreatedCounter,
  approvalDecidedCounter,
  siraScoreHistogram,
};

// Routes
app.use("/api/approvals", approvalsRouter);

// Health check
app.get("/health", async (req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
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
  logger.error("Unhandled error", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "internal_error" });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  logger.info(`Risk-Aware Approvals server listening on port ${PORT}`);
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
