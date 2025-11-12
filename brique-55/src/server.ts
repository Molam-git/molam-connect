/**
 * Brique 55 - Disputes & Chargebacks Engine
 * Express Server
 */
import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import dotenv from "dotenv";
import { authzMiddleware } from "./utils/authz.js";
import { healthCheck } from "./utils/db.js";
import disputeRoutes from "./routes/disputeRoutes.js";
import promClient from "prom-client";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8055;

// Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const disputesCreatedCounter = new promClient.Counter({
  name: "molam_disputes_created_total",
  help: "Total disputes created",
  labelNames: ["origin", "reason_code"],
  registers: [register],
});

const disputesResolvedCounter = new promClient.Counter({
  name: "molam_disputes_resolved_total",
  help: "Total disputes resolved",
  labelNames: ["outcome"],
  registers: [register],
});

const disputeProcessingTime = new promClient.Histogram({
  name: "molam_dispute_processing_time_seconds",
  help: "Time to resolve disputes",
  buckets: [60, 300, 900, 3600, 86400, 604800], // 1m, 5m, 15m, 1h, 1d, 1w
  registers: [register],
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(
  fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    abortOnLimit: true,
  })
);

// Health check (public)
app.get("/health", async (_req, res) => {
  const dbHealthy = await healthCheck();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? "healthy" : "unhealthy",
    service: "disputes",
    timestamp: new Date().toISOString(),
  });
});

// Metrics endpoint (public)
app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// Apply authentication to all /api routes
app.use("/api", authzMiddleware);

// Routes
app.use("/api/disputes", disputeRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "internal_server_error", message: err.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Brique 55 - Disputes & Chargebacks Engine running on port ${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log(`📈 Metrics: http://localhost:${PORT}/metrics`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  process.exit(0);
});

// Export metrics for use in services
export { disputesCreatedCounter, disputesResolvedCounter, disputeProcessingTime };
