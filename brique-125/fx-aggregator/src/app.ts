// ============================================================================
// Express App Configuration
// ============================================================================

import express from "express";
import { fxAggregatorRouter } from "./routes/fx";
import { authzMiddleware } from "./utils/authz";

const app = express();

// Middleware
app.use(express.json({ limit: "1mb" }));
app.use(authzMiddleware);

// Routes
app.use("/api/fx-agg", fxAggregatorRouter);

// Health check
app.get("/healthz", (_req, res) => res.json({ ok: true, service: "fx-aggregator" }));

export default app;
