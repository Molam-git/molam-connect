import { Router } from "express";
import express from "express";
import { pool } from "../utils/db";
import { verifyHmac } from "../utils/authz";
import { publishEvent } from "../utils/kafka";

export const webhooksRouter = Router();

webhooksRouter.post("/:partnerCode", express.raw({ type: "application/json" }), async (req: any, res: any) => {
    try {
        const { partnerCode } = req.params;
        const { rows: pr } = await pool.query(`SELECT id FROM bank_partners WHERE code=$1`, [partnerCode]);
        if (!pr.length) return res.status(404).json({ error: "unknown_partner" });
        const partner_id = pr[0].id;

        const { rows: keys } = await pool.query(
            `SELECT hmac_secret FROM bank_partner_keys WHERE partner_id=$1 AND active=true ORDER BY id DESC LIMIT 1`,
            [partner_id]
        );
        if (!keys.length) return res.status(403).json({ error: "no_active_key" });

        const signature = req.headers["x-signature"] as string;
        const rawBody = req.body.toString("utf8");
        const ok = verifyHmac(signature, rawBody, keys[0].hmac_secret);

        const eventId = (req.headers["x-event-id"] as string) || "";
        const eventType = (req.headers["x-event-type"] as string) || "";

        const ins = `INSERT INTO bank_webhook_events(partner_id,event_id,event_type,payload,signature_ok)
                 VALUES($1,$2,$3,$4,$5) RETURNING id`;
        const { rows: ev } = await pool.query(ins, [partner_id, eventId, eventType, JSON.parse(rawBody), ok]);

        if (!ok) return res.status(400).json({ error: "bad_signature", event_id: ev[0].id });

        const payload = JSON.parse(rawBody);
        const extRef = payload.transfer_ref || payload.id;
        const newStatus = mapPartnerStatus(payload.status);

        if (extRef) {
            await pool.query(`UPDATE bank_transfers SET status=$1, external_ref=$2, processed_at=now()
                        WHERE external_ref=$2 OR (metadata->>'partner_req_id')=$2`, [newStatus, extRef]);
            await publishEvent("bank_transfer_updated", { external_ref: extRef, status: newStatus, partner_id });
        }

        res.status(200).json({ ok: true });
    } catch (e: any) {
        res.status(500).json({ error: "server_error", detail: e.message });
    }
});

function mapPartnerStatus(s: string) {
    switch (s) {
        case "completed": return "succeeded";
        case "processing":
        case "pending": return "processing";
        case "failed": return "failed";
        case "reversed": return "reversed";
        default: return "processing";
    }
}