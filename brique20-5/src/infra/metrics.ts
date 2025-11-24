import client from "prom-client";

export const registry = new client.Registry();

export const p2pLatency = new client.Histogram({
    name: "p2p_transfer_latency_ms",
    help: "P2P transfer end-to-end latency",
    buckets: [10, 20, 50, 100, 200, 500, 1000],
    registers: [registry]
});

export const p2pFailures = new client.Counter({
    name: "p2p_transfer_failures_total",
    help: "P2P failures by reason",
    labelNames: ["reason"],
    registers: [registry]
});

export const p2pSuccess = new client.Counter({
    name: "p2p_transfer_success_total",
    help: "P2P successful transfers",
    registers: [registry]
});

export const p2pPendingReview = new client.Counter({
    name: "p2p_transfer_pending_review_total",
    help: "P2P transfers pending review",
    registers: [registry]
});

// Register default metrics
client.collectDefaultMetrics({ register: registry });