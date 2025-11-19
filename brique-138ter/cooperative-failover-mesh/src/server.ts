// ============================================================================
// Cooperative Failover Mesh Server
// ============================================================================

import express, { Request, Response } from "express";
import cors from "cors";
import { logger } from "./utils/logger";
import { meshRouter } from "./routes/mesh";
import { pool } from "./utils/db";
import { startMeshController } from "./mesh/controller";
import { initProducer, shutdown as shutdownBroker } from "./mesh/broker";
import promClient from "prom-client";

const PORT = parseInt(process.env.PORT || "3000", 10);

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info("HTTP Request", {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: duration,
    });
  });
  next();
});

// Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const meshFailoverTotal = new promClient.Counter({
  name: "molam_mesh_failover_applied_total",
  help: "Total number of failovers applied",
  labelNames: ["region", "currency"],
  registers: [register],
});

const meshPredictionConfidence = new promClient.Histogram({
  name: "molam_mesh_prediction_confidence",
  help: "Distribution of SIRA prediction confidence",
  buckets: [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99, 1.0],
  registers: [register],
});

const meshCrossborderVolume = new promClient.Counter({
  name: "molam_mesh_crossborder_volume_total",
  help: "Total crossborder transaction volume",
  labelNames: ["from_region", "to_region", "currency"],
  registers: [register],
});

// Routes
app.use("/api/mesh", meshRouter);

// Health check
app.get("/health", async (req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  } catch (error: any) {
    logger.error("Health check failed", { error: error.message });
    res.status(503).json({ status: "unhealthy", error: error.message });
  }
});

// Readiness check
app.get("/ready", async (req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ready" });
  } catch (error: any) {
    res.status(503).json({ status: "not_ready", error: error.message });
  }
});

// Metrics endpoint
app.get("/metrics", async (req: Request, res: Response) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "not_found" });
});

// Error handler
app.use((err: any, req: Request, res: Response, next: any) => {
  logger.error("Unhandled error", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "internal_error" });
});

// Start server
async function start() {
  try {
    // Initialize Kafka producer
    await initProducer();

    // Start mesh controller
    if (process.env.ENABLE_CONTROLLER !== "false") {
      await startMeshController();
    }

    app.listen(PORT, "0.0.0.0", () => {
      logger.info(`Cooperative Failover Mesh server listening on port ${PORT}`);
    });
  } catch (error: any) {
    logger.error("Failed to start server", { error: error.message });
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  await shutdownBroker();
  await pool.end();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully");
  await shutdownBroker();
  await pool.end();
  process.exit(0);
});

start();
