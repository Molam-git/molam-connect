import express from "express";
import helmet from "helmet";
import bodyParser from "body-parser";
import { authzMiddleware, requireRole } from "./utils/authz";
import { createPayoutHandler, getPayoutHandler, cancelPayoutHandler } from "./handlers/payouts";
import { approvePayoutHandler } from "./handlers/approval";
import { batchPayoutHandler } from "./handlers/batch";
import { initQueues } from "./queues";
import { initMetrics } from "./utils/metrics";

export const app = express();
app.use(helmet());
app.use(bodyParser.json({ limit: "10mb" }));

// Health check
app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "payouts-engine" });
});

// Metrics endpoint
app.get("/metrics", async (req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send(await initMetrics());
});

// Payouts API
app.post("/api/treasury/payouts",
    authzMiddleware,
    requireRole(["pay_module", "finance_ops", "pay_admin"]),
    createPayoutHandler
);

app.get("/api/treasury/payouts/:id",
    authzMiddleware,
    requireRole(["pay_module", "finance_ops", "pay_admin"]),
    getPayoutHandler
);

app.post("/api/treasury/payouts/:id/cancel",
    authzMiddleware,
    requireRole(["finance_ops", "pay_admin"]),
    cancelPayoutHandler
);

app.post("/api/treasury/payouts/:id/approve",
    authzMiddleware,
    requireRole(["pay_admin", "compliance"]),
    approvePayoutHandler
);

app.post("/api/treasury/payouts/batch",
    authzMiddleware,
    requireRole(["finance_ops", "pay_admin"]),
    batchPayoutHandler
);

// Initialize queues and start server
async function startServer() {
    try {
        await initQueues();
        console.log("✅ Payouts queues initialized");

        const PORT = process.env.PORT || 8081;
        app.listen(PORT, () => {
            console.log(`🚀 Payouts service listening on port ${PORT}`);
        });
    } catch (error) {
        console.error("❌ Failed to start server:", error);
        process.exit(1);
    }
}

startServer();