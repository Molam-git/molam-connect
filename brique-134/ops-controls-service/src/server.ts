// ============================================================================
// Ops Controls Service - Main Server
// ============================================================================

import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import promClient from "prom-client";
import { logger } from "./logger";
import { checkDatabaseHealth } from "./db";
import { opsRouter } from "./routes/ops";

const PORT = parseInt(process.env.PORT || "8084", 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || "100", 10);

// ============================================================================
// Prometheus Metrics
// ============================================================================

const register = new promClient.Registry();

promClient.collectDefaultMetrics({ register });

const httpRequestDuration = new promClient.Histogram({
  name: "molam_ops_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

const opsActionCounter = new promClient.Counter({
  name: "molam_ops_action_requests_total",
  help: "Total number of ops action requests",
  labelNames: ["action", "status"],
  registers: [register],
});

// ============================================================================
// Express App Setup
// ============================================================================

const app = express();

// Security & middleware
app.use(helmet());
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: RATE_LIMIT_MAX,
  message: { error: "rate_limit_exceeded" },
});
app.use(limiter);

// Request logging & metrics
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode.toString())
      .observe(duration);

    logger.info("HTTP request", {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Math.round(duration * 1000),
      ip: req.ip,
    });
  });

  next();
});

// ============================================================================
// Health Checks
// ============================================================================

app.get("/healthz", async (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/readyz", async (req, res) => {
  const dbHealthy = await checkDatabaseHealth();

  if (dbHealthy) {
    res.status(200).json({ status: "ready" });
  } else {
    res.status(503).json({ status: "not_ready", reason: "database_unavailable" });
  }
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// ============================================================================
// API Routes
// ============================================================================

app.use("/api/ops", opsRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "not_found" });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error("Unhandled error", {
    error: err.message,
    stack: err.stack,
    path: req.path,
  });

  res.status(500).json({ error: "internal_server_error" });
});

// ============================================================================
// Server Lifecycle
// ============================================================================

let server: any;

async function start() {
  try {
    // Check database connection
    const dbHealthy = await checkDatabaseHealth();
    if (!dbHealthy) {
      logger.error("Database not available at startup");
      process.exit(1);
    }

    server = app.listen(PORT, () => {
      logger.info(`Ops Controls Service started`, {
        port: PORT,
        env: process.env.NODE_ENV,
      });
    });
  } catch (error: any) {
    logger.error("Failed to start server", { error: error.message });
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully`);

  if (server) {
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 30000);
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Start server
start();

export { app, opsActionCounter };
