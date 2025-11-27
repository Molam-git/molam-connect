/**
 * Brique 42 - Connect Payments
 * Main server - Payment intents, charges, refunds & real-time dashboard
 */

import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { auth } from "./auth";
import { intentsRouter } from "./routes/intents";
import { refundsRouter } from "./routes/refunds";
import { webhooksRouter } from "./routes/webhooks";
import { pool } from "./db";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8042;

// Middleware
app.use(helmet());
app.use(rateLimit({ windowMs: 60_000, max: 800 }));
app.use(express.json({ limit: "1mb" }));

// CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Public routes
app.get("/", (req, res) => {
  res.json({
    service: "Molam Connect Payments",
    brique: "42",
    description: "Payment intents, charges, refunds & real-time dashboard",
    version: "1.0.0",
    status: "operational",
  });
});

app.get("/healthz", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: "connected",
    });
  } catch (e: any) {
    res.status(503).json({
      status: "unhealthy",
      error: e.message,
      database: "disconnected",
    });
  }
});

// Protected routes
app.use("/api", auth);
app.use("/api/connect/intents", intentsRouter);
app.use("/api/connect/refunds", refundsRouter);
app.use("/api/connect/webhooks", webhooksRouter);

// Error handling
app.use((req, res) => {
  res.status(404).json({
    error: "not_found",
    message: `Route ${req.method} ${req.path} not found`,
  });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("[Error]", err);
  const status = err.status || 500;
  const message = err.message || "Internal server error";
  res.status(status).json({
    error: "server_error",
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   Molam Connect Payments (Brique 42) - STARTED           ║
║                                                           ║
║   Port: ${PORT.toString().padEnd(48)}║
║   Environment: ${(process.env.NODE_ENV || "development").padEnd(40)}║
║   Database: ${(process.env.DATABASE_URL ? "✓ Connected" : "✗ Not configured").padEnd(42)}║
║                                                           ║
║   API Endpoints:                                          ║
║   - POST   /api/connect/intents                          ║
║   - POST   /api/connect/intents/:id/confirm              ║
║   - POST   /api/connect/intents/:id/capture              ║
║   - POST   /api/connect/intents/:id/cancel               ║
║   - GET    /api/connect/intents/:id                      ║
║   - GET    /api/connect/intents                          ║
║                                                           ║
║   - POST   /api/connect/refunds                          ║
║   - GET    /api/connect/refunds/:id                      ║
║   - GET    /api/connect/refunds                          ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  server.close(async () => {
    console.log("HTTP server closed");
    await pool.end();
    console.log("Database connections closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully...");
  server.close(async () => {
    console.log("HTTP server closed");
    await pool.end();
    console.log("Database connections closed");
    process.exit(0);
  });
});

export default app;
