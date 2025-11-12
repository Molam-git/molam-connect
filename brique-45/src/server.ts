// ============================================================================
// Brique 45 - Webhooks Industriels
// Main Express Server
// ============================================================================

import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Registry, collectDefaultMetrics } from "prom-client";

import { pool, checkDbHealth, closeDb } from "./utils/db";
import { authMiddleware } from "./utils/authz";
import { webhooksRouter } from "./webhooks/router";
import { webhooksOpsRouter } from "./webhooks/ops";

const PORT = parseInt(process.env.PORT || "8045");
const NODE_ENV = process.env.NODE_ENV || "development";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

// ============================================================================
// Express App Setup
// ============================================================================
const app = express();

// Security middleware
app.use(helmet());

// CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }

  next();
});

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000"), // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "1000"),
  message: { error: "rate_limit_exceeded" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// ============================================================================
// Prometheus Metrics
// ============================================================================
const register = new Registry();
collectDefaultMetrics({ register, prefix: "b45_" });

app.get("/metrics", async (req: Request, res: Response) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// ============================================================================
// Health Check
// ============================================================================
app.get("/healthz", async (req: Request, res: Response) => {
  const dbHealthy = await checkDbHealth();

  if (dbHealthy) {
    res.status(200).json({
      status: "healthy",
      service: "brique-45-webhooks",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: "unhealthy",
      service: "brique-45-webhooks",
      error: "database_unavailable",
    });
  }
});

// ============================================================================
// API Routes
// ============================================================================
// Apply authentication to all API routes
app.use("/api/webhooks", authMiddleware, webhooksRouter);
app.use("/api/ops/webhooks", authMiddleware, webhooksOpsRouter);

// Root endpoint
app.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    service: "Brique 45 - Webhooks Industriels",
    version: "1.0.0",
    description: "Multi-tenant webhooks with signature rotation, retry+DLQ, and Ops dashboard",
    endpoints: {
      health: "/healthz",
      metrics: "/metrics",
      webhooks: "/api/webhooks",
      ops: "/api/ops/webhooks",
    },
    features: [
      "Multi-tenant endpoints (merchants, agents, internal apps)",
      "Versioned secrets with rotation and grace period",
      "HMAC SHA-256 signature (Stripe-compatible)",
      "Intelligent retry with exponential backoff",
      "Dead letter queue (DLQ) for failed deliveries",
      "Ops dashboard for monitoring and manual intervention",
      "Idempotency and anti-replay protection",
    ],
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "not_found" });
});

// Error handler
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "internal_server_error",
    message: NODE_ENV === "development" ? err.message : undefined,
  });
});

// ============================================================================
// Server Startup
// ============================================================================
const server = app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║  Brique 45 - Webhooks Industriels                        ║
  ╠═══════════════════════════════════════════════════════════╣
  ║  Port:        ${PORT.toString().padEnd(46)}║
  ║  Environment: ${NODE_ENV.padEnd(46)}║
  ║  API:         http://localhost:${PORT.toString().padEnd(30)}║
  ╚═══════════════════════════════════════════════════════════╝

  Administration Endpoints:
    POST /api/webhooks/endpoints              Create endpoint
    GET  /api/webhooks/endpoints              List endpoints
    GET  /api/webhooks/endpoints/:id          Get endpoint details
    POST /api/webhooks/endpoints/:id/rotate   Rotate secret
    POST /api/webhooks/endpoints/:id/status   Pause/Activate
    PUT  /api/webhooks/endpoints/:id/subs     Update subscriptions
    DEL  /api/webhooks/endpoints/:id          Delete endpoint

  Ops Endpoints:
    GET  /api/ops/webhooks/deliveries         List deliveries
    GET  /api/ops/webhooks/deliveries/:id     Get delivery details
    POST /api/ops/webhooks/deliveries/:id/retry   Manual retry
    POST /api/ops/webhooks/deliveries/:id/requeue Requeue from DLQ
    GET  /api/ops/webhooks/deadletters        List DLQ entries
    GET  /api/ops/webhooks/stats              Dashboard statistics
    GET  /api/ops/webhooks/events             List recent events

  Workers (run separately):
    npm run worker:dispatcher                  Dispatcher with retry+DLQ
  `);
});

// ============================================================================
// Graceful Shutdown
// ============================================================================
async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  server.close(async () => {
    console.log("HTTP server closed");

    await closeDb();
    console.log("Database connections closed");

    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
