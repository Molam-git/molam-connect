/**
 * Brique 43 - Checkout & Payment Methods Orchestration
 * Main Server
 */

import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { authzMiddleware, requireMerchantScope } from "./utils/authz";
import { i18nMiddleware } from "./utils/i18n";
import { initMetrics, metricsHandler } from "./utils/metrics";

const app = express();

// Security
app.use(helmet());
app.use(express.json({ limit: "1.5mb" }));

// Rate limiting
app.use(
  rateLimit({
    windowMs: 60_000, // 1 minute
    max: 800, // 800 requests per minute
  })
);

// Core middlewares
app.use(i18nMiddleware);
app.use(authzMiddleware);

// Metrics
initMetrics(app);

// Routes (will be imported)
// app.use("/api/connect/intents", require MerchantScope(["payments:write","payments:read"]), intentsRouter);
// app.use("/api/connect/methods", requireMerchantScope(["payments:write","payments:read"]), methodsRouter);
// app.use("/api/connect/webhooks", requireMerchantScope(["webhooks:write","webhooks:read"]), webhooksRouter);
// app.use("/api/connect/sse", requireMerchantScope(["payments:read"]), sseRouter);

// Health & metrics
app.get("/healthz", (_req, res) => res.json({ ok: true, service: "brique-43-checkout" }));
app.get("/metrics", metricsHandler);

const PORT = process.env.PORT || 8043;

app.listen(PORT, () => {
  console.log(`[Brique 43] Checkout Orchestration API running on port ${PORT}`);
});

export default app;
