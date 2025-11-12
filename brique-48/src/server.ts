/**
 * Brique 48 - Radar Molam
 * Main API Server
 *
 * Port: 8048
 * Database: molam_radar
 */

import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { Registry, collectDefaultMetrics, Counter, Histogram } from "prom-client";
import { pool } from "./utils/db.js";
import { authenticateJWT } from "./utils/authz.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8048;

// Prometheus metrics
const register = new Registry();
collectDefaultMetrics({ register });

const httpRequestDuration = new Histogram({
  name: "b48_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

export const riskDecisions = new Counter({
  name: "b48_risk_decisions_total",
  help: "Total risk decisions",
  labelNames: ["decision", "reason"],
  registers: [register],
});

const riskEvaluationDuration = new Histogram({
  name: "b48_risk_evaluation_duration_ms",
  help: "Duration of risk evaluations in milliseconds",
  registers: [register],
});

// Middleware
app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000,
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
    res.json({ status: "ok", service: "brique-48-radar", timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: "error", message: "Database unavailable" });
  }
});

// Metrics endpoint
app.get("/metrics", async (req: Request, res: Response) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// API Routes
import radarRoutes from "./routes/radar.js";
import opsRoutes from "./routes/ops.js";

app.use("/api/radar", radarRoutes);
app.use("/api/ops/radar", authenticateJWT, opsRoutes);

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
  console.log(`🎯 Brique 48 - Radar Molam (Fraud & Risk Engine)`);
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🗄️  Database: ${process.env.DATABASE_URL?.split("@")[1]}`);
  console.log(`📊 Metrics: http://localhost:${PORT}/metrics`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
  console.log(`🔍 Risk evaluation: POST /api/radar/evaluate`);
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
export { riskEvaluationDuration };
