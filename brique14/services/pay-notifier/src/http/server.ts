import express from "express";
import routes from "./routes.js";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: "256kb" }));
app.use("/api/pay/notif", routes);

app.get("/healthz", (_, res) => {
    res.json({
        status: "ok",
        service: "pay-notifier",
        timestamp: new Date().toISOString()
    });
});

app.get("/metrics", async (_, res) => {
    // TODO: Implement Prometheus metrics endpoint
    res.set('Content-Type', 'text/plain');
    res.send('# Metrics endpoint - TODO: Implement Prometheus exporter\n');
});

app.listen(PORT, () => {
    console.log(`Pay Notifier service running on port ${PORT}`);
});