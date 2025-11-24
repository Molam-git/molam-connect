import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { authzMiddleware, requireRole, idemMiddleware, antiReplay } from "./utils/authz";
import { i18nMiddleware } from "./utils/i18n";
import { banksRouter } from "./routes/banks";
import { webhooksRouter } from "./routes/webhooks";
import { payoutsRouter } from "./routes/payouts";
import { depositsRouter } from "./routes/deposits";
import { metricsRouter, initMetrics } from "./utils/metrics";

const app = express();
app.use(helmet());
app.use(express.json({ limit: "1mb" }));

app.use(rateLimit({ windowMs: 60_000, max: 800 }));
app.use(i18nMiddleware);
app.use(authzMiddleware);
app.use(antiReplay);

initMetrics(app);
app.use("/metrics", metricsRouter);

app.use("/api/banks", requireRole(["pay_admin", "finance_ops", "auditor"]), banksRouter);
app.use("/api/bank/deposits", idemMiddleware, depositsRouter);
app.use("/api/bank/payouts", idemMiddleware, payoutsRouter);
app.use("/api/banks/webhooks", webhooksRouter);

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.listen(process.env.PORT || 8082, () => {
    console.log("Bank Interop Service up");
});