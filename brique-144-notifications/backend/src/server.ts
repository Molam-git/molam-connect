/**
 * BRIQUE 144 — Notifications Server
 */
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import { notifRouter } from "./notifications/router";
import { pool } from "./notifications/db";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Health check
app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "molam-notifications" });
});

// Routes
app.use("/api/notifications", notifRouter);

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
  console.log(`🌍 Molam Notifications Service running on port ${PORT}`);

  // Test DB connection
  try {
    await pool.query("SELECT 1");
    console.log("✅ Database connected");
  } catch (e: any) {
    console.error("❌ Database connection failed:", e.message);
    process.exit(1);
  }
});

export default app;
