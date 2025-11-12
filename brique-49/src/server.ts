/**
 * Brique 49 - Taxes & Compliance
 * Main API Server
 *
 * Port: 8049
 * Database: molam_taxes
 */

import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { Registry, collectDefaultMetrics, Counter, Histogram } from "prom-client";
import { pool } from "./utils/db.js";
import { authzMiddleware } from "./utils/authz.js";
import taxRouter from "./routes/taxRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8049;

// Prometheus metrics
const register = new Registry();
collectDefaultMetrics({ register });

const httpRequestDuration = new Histogram({
  name: "b49_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

export const taxComputeTotal = new Counter({
  name: "b49_tax_compute_total",
  help: "Total tax computations",
  labelNames: ["status"],
  registers: [register],
});

export const taxAmountTotal = new Counter({
  name: "b49_tax_amount_total",
  help: "Total tax amount computed",
  labelNames: ["country", "tax_code", "currency"],
  registers: [register],
});

export const fiscalReportsGenerated = new Counter({
  name: "b49_fiscal_reports_generated_total",
  help: "Total fiscal reports generated",
  labelNames: ["report_type", "legal_entity"],
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
    httpRequestDuration.labels(req.method, req.route?.path || req.path, res.statusCode.toString()).observe(duration);
  });
  next();
});

// Health check
app.get("/health", async (req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "brique-49-taxes", timestamp: new Date().toISOString() });
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
app.use("/api/tax", authzMiddleware, taxRouter);

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
  console.log(`🧾 Brique 49 - Taxes & Compliance`);
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
