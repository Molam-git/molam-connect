/**
 * Brique 41 - Molam Connect
 * Main server - Merchant accounts & payment gateway orchestration
 */

import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { auth } from "./auth";
import { accountsRouter } from "./routes/accounts";
import { externalAccountsRouter } from "./routes/externalAccounts";
import { onboardingRouter } from "./routes/onboarding";
import { webhooksRouter } from "./routes/webhooks";
import { pool } from "./db";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8041;

// ============================================================================
// Middleware
// ============================================================================

// Security headers
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 600, // 600 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsing with raw body capture (for webhook signatures)
app.use(
  express.json({
    limit: "1mb",
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// CORS (customize as needed)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// Public routes (no auth required)
// ============================================================================

app.get("/", (req, res) => {
  res.json({
    service: "Molam Connect",
    brique: "41",
    description: "Merchant accounts & payment gateway orchestration",
    version: "1.0.0",
    status: "operational",
  });
});

app.get("/healthz", async (req, res) => {
  try {
    // Check database connection
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

// ============================================================================
// Protected routes (require auth)
// ============================================================================

// Apply auth middleware to all API routes
app.use("/api", auth);

// Connect Accounts
app.use("/api/connect/accounts", accountsRouter);

// External Accounts (payout destinations)
app.use("/api/connect/accounts/:id/external_accounts", externalAccountsRouter);

// Onboarding tasks
app.use("/api/connect/accounts/:id/onboarding", onboardingRouter);

// Webhooks
app.use("/api/connect/accounts/:id/webhooks", webhooksRouter);

// ============================================================================
// Error handling
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "not_found",
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Global error handler
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

// ============================================================================
// Start server
// ============================================================================

const server = app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   Molam Connect (Brique 41) - STARTED                    ║
║                                                           ║
║   Port: ${PORT.toString().padEnd(48)}║
║   Environment: ${(process.env.NODE_ENV || "development").padEnd(40)}║
║   Database: ${(process.env.DATABASE_URL ? "✓ Connected" : "✗ Not configured").padEnd(42)}║
║                                                           ║
║   API Endpoints:                                          ║
║   - POST   /api/connect/accounts                         ║
║   - GET    /api/connect/accounts                         ║
║   - GET    /api/connect/accounts/:id                     ║
║   - PATCH  /api/connect/accounts/:id                     ║
║   - POST   /api/connect/accounts/:id/capabilities        ║
║   - POST   /api/connect/accounts/:id/fee_profile         ║
║   - POST   /api/connect/accounts/:id/refresh_verification║
║   - POST   /api/connect/accounts/:id/approve             ║
║   - POST   /api/connect/accounts/:id/reject              ║
║                                                           ║
║   External Accounts:                                      ║
║   - POST   /api/connect/accounts/:id/external_accounts   ║
║   - GET    /api/connect/accounts/:id/external_accounts   ║
║                                                           ║
║   Onboarding:                                             ║
║   - GET    /api/connect/accounts/:id/onboarding/tasks    ║
║   - POST   /api/connect/accounts/:id/onboarding/tasks    ║
║                                                           ║
║   Webhooks:                                               ║
║   - POST   /api/connect/accounts/:id/webhooks            ║
║   - GET    /api/connect/accounts/:id/webhooks            ║
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
