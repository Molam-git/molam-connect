/**
 * Brique 56 - Chargeback Prevention & Auto-Response Rules Engine
 * Express Server
 */
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { authzMiddleware } from "./utils/authz.js";
import { healthCheck } from "./utils/db.js";
import radarRoutes from "./routes/radarRoutes.js";
import promClient from "prom-client";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8056;

// Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const rulesTriggeredCounter = new promClient.Counter({
  name: "molam_radar_rules_triggered_total",
  help: "Total radar rules triggered",
  labelNames: ["rule_id", "rule_name"],
  registers: [register],
});

const actionsExecutedCounter = new promClient.Counter({
  name: "molam_radar_actions_executed_total",
  help: "Total radar actions executed",
  labelNames: ["action_type"],
  registers: [register],
});

const actionFailuresCounter = new promClient.Counter({
  name: "molam_radar_action_failures_total",
  help: "Total radar action failures",
  labelNames: ["action_type"],
  registers: [register],
});

const evaluationTime = new promClient.Histogram({
  name: "molam_radar_evaluation_time_seconds",
  help: "Time to evaluate rules for a payment",
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check (public)
app.get("/health", async (_req, res) => {
  const dbHealthy = await healthCheck();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? "healthy" : "unhealthy",
    service: "radar",
    timestamp: new Date().toISOString(),
  });
});

// Metrics endpoint (public)
app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// Apply authentication to all /api routes except /api/radar/evaluate (public for real-time)
app.use("/api/radar/evaluate", radarRoutes); // Public endpoint for real-time evaluation
app.use("/api", authzMiddleware); // Auth for all other endpoints

// Routes
app.use("/api/radar", radarRoutes);

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
  console.log(`🚀 Brique 56 - Radar Engine running on port ${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log(`📈 Metrics: http://localhost:${PORT}/metrics`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  process.exit(0);
});

// Export metrics for use in services
export { rulesTriggeredCounter, actionsExecutedCounter, actionFailuresCounter, evaluationTime };
