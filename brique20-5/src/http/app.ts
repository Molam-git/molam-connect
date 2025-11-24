import express from "express";
import helmet from "helmet";
import { router as p2pRouter } from "./routes.p2p.js";
import { registry } from "../infra/metrics.js";
import { config } from "../config/env.js";
import { log } from "../infra/logger.js";

const app = express();

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "same-site" }
}));

// Body parsing middleware
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        log.info('HTTP request', {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration_ms: duration,
            user_agent: req.get('User-Agent'),
            ip: req.ip
        });
    });
    next();
});

// Routes
app.use(p2pRouter);

// Health check endpoint
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
        service: "molam-pay-p2p"
    });
});

// Metrics endpoint
app.get("/metrics", async (req, res) => {
    try {
        res.set("Content-Type", registry.contentType);
        const metrics = await registry.metrics();
        res.send(metrics);
    } catch (error) {
        res.status(500).send("Error generating metrics");
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: "endpoint_not_found" });
});

// Error handler
app.use((error: any, req: any, res: any, next: any) => {
    log.error("Unhandled error", {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
    });

    res.status(500).json({ error: "internal_server_error" });
});

// Start server
const PORT = config.port;
app.listen(PORT, () => {
    log.info("Molam P2P service started", {
        port: PORT,
        node_env: config.nodeEnv
    });
});

export { app };