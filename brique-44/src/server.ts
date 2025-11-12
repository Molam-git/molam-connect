// ============================================================================
// Brique 44 - Anti-fraude Temps Réel
// Main Express Server
// ============================================================================

import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Registry, collectDefaultMetrics } from "prom-client";

import { pool, checkDbHealth, closeDb } from "./utils/db";
import { fraudRouter } from "./routes/fraud";
import { reviewsRouter } from "./routes/reviews";
import { blacklistRouter } from "./routes/blacklist";

const PORT = parseInt(process.env.PORT || "8044");
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
collectDefaultMetrics({ register, prefix: "b44_" });

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
      service: "brique-44-fraud-detection",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: "unhealthy",
      service: "brique-44-fraud-detection",
      error: "database_unavailable",
    });
  }
});

// ============================================================================
// API Routes
// ============================================================================
app.use("/api/fraud", fraudRouter);
app.use("/api/fraud/reviews", reviewsRouter);
app.use("/api/fraud/blacklist", blacklistRouter);

// Root endpoint
app.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    service: "Brique 44 - Anti-fraude Temps Réel",
    version: "1.0.0",
    description: "Real-time fraud detection with SIRA integration, Kafka workers, and Ops dashboard",
    endpoints: {
      health: "/healthz",
      metrics: "/metrics",
      fraud: "/api/fraud",
      reviews: "/api/fraud/reviews",
      blacklist: "/api/fraud/blacklist",
    },
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
  ║  Brique 44 - Anti-fraude Temps Réel                      ║
  ╠═══════════════════════════════════════════════════════════╣
  ║  Port:        ${PORT.toString().padEnd(46)}║
  ║  Environment: ${NODE_ENV.padEnd(46)}║
  ║  API:         http://localhost:${PORT.toString().padEnd(30)}║
  ╚═══════════════════════════════════════════════════════════╝

  Endpoints:
    GET  /healthz                              Health check
    GET  /metrics                              Prometheus metrics
    POST /api/fraud/evaluate                   Evaluate transaction
    GET  /api/fraud/decisions/:txnId           Get decision
    GET  /api/fraud/decisions                  List decisions
    GET  /api/fraud/reviews                    Get review queue
    POST /api/fraud/reviews/:id/assign         Assign review
    POST /api/fraud/reviews/:id/decide         Manual decision
    GET  /api/fraud/reviews/stats              Review statistics
    POST /api/fraud/blacklist                  Add to blacklist
    GET  /api/fraud/blacklist                  List blacklist
    DELETE /api/fraud/blacklist/:id            Remove from blacklist
    GET  /api/fraud/blacklist/check/:type/:val Check blacklist

  Workers (run separately):
    npm run worker:kafka-consumer              Real-time Kafka consumer
    npm run worker:metrics-aggregator          Daily metrics aggregation
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
