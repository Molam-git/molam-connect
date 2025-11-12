/**
 * Brique 46 - Billing & Invoicing Marchands
 * Main API Server
 *
 * Port: 8046
 * Database: molam_billing
 */

import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { Registry, collectDefaultMetrics, Counter, Histogram } from "prom-client";
import { pool } from "./utils/db.js";
import { authenticateJWT } from "./utils/authz.js";
import billingRoutes from "./routes/billing.js";
import opsRoutes from "./routes/ops.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8046;

// Prometheus metrics
const register = new Registry();
collectDefaultMetrics({ register });

const httpRequestDuration = new Histogram({
  name: "b46_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

const billingErrors = new Counter({
  name: "b46_errors_total",
  help: "Total billing errors",
  labelNames: ["type"],
  registers: [register],
});

// Middleware
app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: "Too many requests from this IP",
});
app.use("/api/", limiter);

// Request timing
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration.labels(req.method, req.route?.path || req.path, res.statusCode.toString()).observe(duration);
  });
  next();
});

// Health check
app.get("/health", async (req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "brique-46-billing", timestamp: new Date().toISOString() });
  } catch (err) {
    billingErrors.labels("health_check").inc();
    res.status(503).json({ status: "error", message: "Database unavailable" });
  }
});

// Metrics endpoint
app.get("/metrics", async (req: Request, res: Response) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// API Routes
app.use("/api/billing", authenticateJWT, billingRoutes);
app.use("/api/ops/billing", authenticateJWT, opsRoutes);

// Internal routes (no auth for service-to-service)
import internalRoutes from "./routes/internal.js";
app.use("/api/internal/billing", internalRoutes);

// Error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Error:", err);
  billingErrors.labels(err.type || "unknown").inc();

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
  console.log(`🧾 Brique 46 - Billing & Invoicing`);
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🗄️  Database: ${process.env.DATABASE_URL?.split("@")[1]}`);
  console.log(`📊 Metrics: http://localhost:${PORT}/metrics`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
});

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
