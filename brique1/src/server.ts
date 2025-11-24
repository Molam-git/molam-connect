import express from "express";
import helmet from "helmet";
import cors from "cors";
import { walletsRouter } from "./routes/wallets";

const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.use("/api/pay/wallets", walletsRouter);

const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`molam-pay-wallets listening on :${port}`);
});