// ============================================================================
// Pay Entry Service - Main Server
// ============================================================================

import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import * as promClient from "prom-client";
import { jwtMiddleware } from "./middleware/auth";
import { entryRouter } from "./routes/entry";
import { logger } from "./logger";
import { checkDatabaseHealth, closeDatabasePool } from "./db";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8082;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX || "600", 10), // 600 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limit_exceeded" },
});
app.use(limiter);

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info("HTTP Request", {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      user_agent: req.get("user-agent"),
      ip: req.ip,
    });
  });
  next();
});

// Prometheus metrics registry
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Custom metrics
export const httpRequestDuration = new promClient.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

// Health check endpoint
app.get("/healthz", async (_req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();

  if (!dbHealthy) {
    return res.status(503).json({
      status: "unhealthy",
      database: "down",
    });
  }

  res.json({
    status: "healthy",
    database: "up",
    version: process.env.npm_package_version || "1.0.0",
  });
});

// Readiness probe
app.get("/readyz", async (_req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();

  if (!dbHealthy) {
    return res.status(503).json({ ready: false, reason: "database_not_ready" });
  }

  res.json({ ready: true });
});

// Prometheus metrics endpoint
app.get("/metrics", async (_req: Request, res: Response) => {
  res.setHeader("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// Protected API routes
app.use("/api/pay/entry", jwtMiddleware, entryRouter);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "not_found" });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("Unhandled error", {
    error: err.message,
    stack: err.stack,
  });

  res.status(500).json({ error: "internal_server_error" });
});

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Pay Entry Service listening on port ${PORT}`, {
    env: process.env.NODE_ENV,
    port: PORT,
  });
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, starting graceful shutdown");

  server.close(async () => {
    logger.info("HTTP server closed");
    await closeDatabasePool();
    process.exit(0);
  });

  // Force shutdown after 30s
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 30000);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, starting graceful shutdown");
  process.exit(0);
});

// Uncaught exception handler
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection", { reason, promise });
});

export default app;
