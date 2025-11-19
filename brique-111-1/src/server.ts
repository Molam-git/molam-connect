/**
 * Brique 111-1 - Self-Healing Plugins (SIRA)
 * Express Server
 */

import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pluginsRouter from "./routes/plugins";
import opsRouter from "./routes/ops";
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
const PORT = process.env.PORT || 8112;

app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: "Too many requests"
});
app.use("/api/", limiter);

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "brique-111-1-self-healing-sira" });
  } catch (error) {
    res.status(503).json({ status: "error" });
  }
});

app.use("/api/plugins", pluginsRouter);
app.use("/api/ops", opsRouter);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err }, "Request error");
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  logger.info(`🚀 Brique 111-1 - Self-Healing Plugins (SIRA) running on port ${PORT}`);
});

process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down...");
  await pool.end();
  process.exit(0);
});

export default app;



