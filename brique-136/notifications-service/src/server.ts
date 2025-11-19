// ============================================================================
// Notifications Service - Main Server
// ============================================================================

import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import promClient from "prom-client";
import { logger } from "./logger";
import { checkDatabaseHealth } from "./db";
import { notificationsRouter } from "./routes/notifications";

const PORT = parseInt(process.env.PORT || "8086", 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || "200", 10);

// ============================================================================
// Prometheus Metrics
// ============================================================================

const register = new promClient.Registry();

promClient.collectDefaultMetrics({ register });

const emailsSentCounter = new promClient.Counter({
  name: "molam_notifications_emails_sent_total",
  help: "Total number of emails sent",
  labelNames: ["notification_type", "status"],
  registers: [register],
});

const tokenVerificationsCounter = new promClient.Counter({
  name: "molam_notifications_token_verifications_total",
  help: "Total number of token verifications",
  labelNames: ["result"],
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
  windowMs: 60 * 1000,
  max: RATE_LIMIT_MAX,
  message: { error: "rate_limit_exceeded" },
});
app.use(limiter);

// Request logging
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info("HTTP request", {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: duration,
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

app.use("/api/notifications", notificationsRouter);

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
    const dbHealthy = await checkDatabaseHealth();
    if (!dbHealthy) {
      logger.error("Database not available at startup");
      process.exit(1);
    }

    server = app.listen(PORT, () => {
      logger.info(`Notifications Service started`, {
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

start();

export { app, emailsSentCounter, tokenVerificationsCounter };
