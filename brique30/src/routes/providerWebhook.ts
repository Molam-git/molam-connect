// src/routes/providerWebhook.ts
import { Router } from "express";
import { verifySignature } from "../lib/hmac";
import { pool } from "../db";
import { publishKafka } from "../lib/kafka";

export const providerWebhookRouter = Router();

providerWebhookRouter.post("/tts/callback", async (req: any, res) => {
    const sig = req.headers['x-provider-signature'] as string;
    if (!verifySignature(JSON.stringify(req.body), sig, process.env.TTS_SHARED_SECRET!)) {
        return res.status(403).send("invalid_sig");
    }

    const { request_id, status, cost_usd, delivered_at, fail_reason } = req.body;

    await pool.query(
        `UPDATE notification_delivery SET status=$1, delivered_at=$2, cost_usd=$3, 
     fail_reason=$4, updated_at=now() WHERE provider_request_id = $5`,
        [status, delivered_at ? new Date(delivered_at) : null, cost_usd || 0, fail_reason || null, request_id]
    );

    await publishKafka("notification_events", {
        type: status === "delivered" ? "voice_delivered" : "voice_failed",
        provider_request_id: request_id,
        fail_reason
    });

    res.json({ ok: true });
});