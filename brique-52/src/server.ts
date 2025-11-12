/**
 * Brique 52 - Subscriptions & Recurring Payments Engine
 * Main API Server
 *
 * Port: 8052
 * Database: molam_subscriptions
 */
import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { Registry, collectDefaultMetrics, Counter, Histogram } from "prom-client";
import { pool } from "./utils/db.js";
import { authzMiddleware } from "./utils/authz.js";
import { subscriptionRouter } from "./routes/subscriptionRoutes.js";
import { paymentMethodRouter } from "./routes/paymentMethodRoutes.js";
import { planRouter } from "./routes/planRoutes.js";
import { startSubscriptionWorker } from "./workers/subscriptionWorker.js";
import { startDunningWorker } from "./workers/dunningWorker.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8052;

// Prometheus metrics
const register = new Registry();
collectDefaultMetrics({ register });

const httpRequestDuration = new Histogram({
  name: "b52_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

export const subscriptionsCreatedTotal = new Counter({
  name: "b52_subscriptions_created_total",
  help: "Total subscriptions created",
  labelNames: ["merchant_id", "status"],
  registers: [register],
});

export const subscriptionsCanceledTotal = new Counter({
  name: "b52_subscriptions_canceled_total",
  help: "Total subscriptions canceled",
  labelNames: ["merchant_id", "reason"],
  registers: [register],
});

export const mrrTotal = new Counter({
  name: "b52_mrr_total",
  help: "Monthly Recurring Revenue",
  labelNames: ["merchant_id", "currency"],
  registers: [register],
});

export const subscriptionInvoicesTotal = new Counter({
  name: "b52_subscription_invoices_total",
  help: "Total subscription invoices",
  labelNames: ["status"],
  registers: [register],
});

export const dunningAttemptsTotal = new Counter({
  name: "b52_dunning_attempts_total",
  help: "Total dunning attempts",
  labelNames: ["merchant_id", "outcome"],
  registers: [register],
});

// Middleware
app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: "Too many requests from this IP",
});
app.use("/api/", limiter);

// Request timing
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode.toString())
      .observe(duration);
  });
  next();
});

// Health check
app.get("/health", async (req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "ok",
      service: "brique-52-subscriptions",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ status: "error", message: "Database unavailable" });
  }
});

// Metrics endpoint
app.get("/metrics", async (req: Request, res: Response) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// API Routes (with authentication)
app.use("/api", authzMiddleware, subscriptionRouter);
app.use("/api", authzMiddleware, paymentMethodRouter);
app.use("/api", authzMiddleware, planRouter);

// Error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Error:", err);

  res.status(err.status || 500).json({
    error: {
      message: err.message || "Internal server error",
      type: err.type || "server_error",
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    },
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: { message: "Not found", type: "not_found" } });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`💳 Brique 52 - Subscriptions & Recurring Payments Engine`);
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🗄️  Database: ${process.env.DATABASE_URL?.split("@")[1]}`);
  console.log(`📊 Metrics: http://localhost:${PORT}/metrics`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
});

// Start background workers
if (process.env.NODE_ENV !== "test") {
  startSubscriptionWorker().catch(console.error);
  startDunningWorker().catch(console.error);
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("HTTP server closed");
    pool.end().then(() => {
      console.log("Database pool closed");
      process.exit(0);
    });
  });
});

export default app;
