/**
 * Brique 53 - Checkout Hosted / Embedded Subscription Checkout
 * Main API Server
 *
 * Port: 8053
 * Database: molam_checkout
 */
import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { Registry, collectDefaultMetrics, Counter, Histogram } from "prom-client";
import { pool } from "./utils/db.js";
import { authzMiddleware } from "./utils/authz.js";
import { checkoutRouter } from "./routes/checkoutRoutes.js";
import { startExpiryWorker } from "./workers/expiryWorker.js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8053;

// Prometheus metrics
const register = new Registry();
collectDefaultMetrics({ register });

const httpRequestDuration = new Histogram({
  name: "b53_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

export const checkoutSessionsCreatedTotal = new Counter({
  name: "b53_checkout_sessions_created_total",
  help: "Total checkout sessions created",
  labelNames: ["merchant_id", "locale"],
  registers: [register],
});

export const checkoutSessionsCompletedTotal = new Counter({
  name: "b53_checkout_sessions_completed_total",
  help: "Total checkout sessions completed",
  labelNames: ["merchant_id"],
  registers: [register],
});

export const checkoutSessionsFailedTotal = new Counter({
  name: "b53_checkout_sessions_failed_total",
  help: "Total checkout sessions failed",
  labelNames: ["merchant_id", "reason"],
  registers: [register],
});

export const checkoutConversionRate = new Histogram({
  name: "b53_checkout_conversion_rate",
  help: "Checkout conversion rate",
  labelNames: ["merchant_id"],
  registers: [register],
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow iframe embedding
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../web/public")));

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
      service: "brique-53-checkout",
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
app.use("/api", authzMiddleware, checkoutRouter);

// Hosted checkout page (no auth required for customers)
app.get("/checkout/:sessionId", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    // Serve hosted checkout page
    res.sendFile(path.join(__dirname, "../web/pages/checkout.html"));
  } catch (err) {
    res.status(500).send("Error loading checkout page");
  }
});

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
  console.log(`🛒 Brique 53 - Checkout Hosted / Embedded`);
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🗄️  Database: ${process.env.DATABASE_URL?.split("@")[1]}`);
  console.log(`📊 Metrics: http://localhost:${PORT}/metrics`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
  console.log(`🛍️  Checkout: http://localhost:${PORT}/checkout/[session-id]`);
});

// Start background workers
if (process.env.NODE_ENV !== "test") {
  startExpiryWorker().catch(console.error);
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
