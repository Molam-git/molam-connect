/**
 * Brique 111 - Merchant Config UI
 * Express Server
 */

import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { merchantConfigRouter } from "./routes/merchantConfig";
import { pool } from "./db";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: process.env.NODE_ENV === "development" ? {
    target: "pino-pretty",
    options: { colorize: true }
  } : undefined
});

const app = express();
const PORT = process.env.PORT || 8111;

// Middleware
app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: "Too many requests, please try again later"
});
app.use("/api/", limiter);

// Health check
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "brique-111-merchant-config" });
  } catch (error) {
    res.status(503).json({ status: "error", message: "Database connection failed" });
  }
});

// API Routes
app.use("/api/config", merchantConfigRouter);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, req: { method: req.method, url: req.url } }, "Request error");
  res.status(err.status || 500).json({
    error: err.message || "Internal server error"
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 Brique 111 - Merchant Config UI running on port ${PORT}`);
  logger.info(`📊 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully...");
  await pool.end();
  process.exit(0);
});

export default app;


