import express from "express";
import cors from "cors";
import { pool } from "./db";
import { opsRouter } from "./routes/ops";
import { authzMiddleware } from "./utils/authz";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Molam ID authentication middleware
app.use(authzMiddleware);

// Routes
app.use("/api/ops", opsRouter);

// Health check
app.get("/health", async (req, res) => {
    try {
        await pool.query("SELECT 1");
        res.json({ status: "ok", timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(503).json({ status: "error", error: "Database unavailable" });
    }
});

app.listen(PORT, () => {
    console.log(`Ops API server running on port ${PORT}`);
});