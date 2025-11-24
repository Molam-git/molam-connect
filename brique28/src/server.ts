// src/server.ts
import express from "express";
import { authzMiddleware, requireRole } from "./utils/authz";
import notifyRouter from "./routes/notifications";
import adminRouter from "./routes/admin";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(authzMiddleware);

app.use("/api/notifications", notifyRouter);
app.use("/api/admin/notifications", requireRole(["pay_admin", "agent_ops"]), adminRouter);

// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "molam-notifications" });
});

export default app;