import express from "express";
import client from "prom-client";

const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics();

export const metricsRouter = express.Router();

metricsRouter.get("/", async (req, res) => {
    res.set("Content-Type", client.register.contentType);
    res.end(await client.register.metrics());
});

export function initMetrics(app: express.Application) {
    // Metrics initialization
}