import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { authz } from "./shared/authz.js";
import rewards from "./rewards/routes.js";
import webhooks from "./rewards/webhooks.js";
import admin from "./rewards/admin.js";
import { errorHandler } from "./shared/errors.js";

const app = express();
app.use(helmet());
app.use(express.json({ limit: "1mb" }));

app.use(rateLimit({ windowMs: 60_000, max: 600 }));

app.use(authz());

app.use("/api/pay/rewards", rewards);
app.use("/api/pay/rewards/admin", admin);
app.use("/api/internal/webhooks", webhooks);

app.use(errorHandler);

app.listen(process.env.PORT || 8080, () => {
    console.log(`Rewards service running on port ${process.env.PORT || 8080}`);
});

export default app;