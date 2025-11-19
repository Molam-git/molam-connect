/**
 * BRIQUE TRANSLATION — Express Server
 */
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
dotenv.config();

import { translationRouter } from "./routes/translation";
import { overridesRouter } from "./routes/overrides";
import { auditRouter } from "./routes/audit";
import { pool } from "./db";
import { metricsMiddleware, register } from "./utils/metrics";

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: "1mb" }));
app.use(metricsMiddleware);

// Health check
app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "molam-translation" });
});

// Metrics endpoint (Prometheus)
app.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// Routes
app.use("/api", translationRouter);
app.use("/api/admin/overrides", overridesRouter);
app.use("/api/admin/audit", auditRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "internal_error", detail: err.message });
});

// Start server
app.listen(PORT, async () => {
  console.log(`🌍 Molam Translation Service running on port ${PORT}`);

  // Test DB connection
  try {
    await pool.query("SELECT 1");
    console.log("✅ Database connected");
  } catch (e: any) {
    console.error("❌ Database connection failed:", e.message);
    process.exit(1);
  }
});
