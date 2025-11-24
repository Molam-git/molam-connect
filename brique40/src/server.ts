// src/server.ts
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { authMiddleware } from "./middlewares/auth";
import fraudOpsRouter from "./routes/fraud_ops";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(authMiddleware);

// Routes
app.use("/api/fraud", fraudOpsRouter);

// Health check
app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "fraud-ops" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Fraud Ops API listening on port ${PORT}`);
});