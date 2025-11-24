// src/routes/notifications.ts
import { Router } from "express";
import { pool } from "../db";
import { v4 as uuidv4 } from "uuid";

export const notifyRouter = Router();

interface SendNotificationRequest {
    user_id?: string;
    agent_id?: number;
    channel: string;
    payload: any;
    priority?: number;
    zone_code?: string;
}

/**
 * POST /api/notifications/send
 * Body: { user_id?, agent_id?, channel, payload, priority?, zone_code? }
 * Language & currency MUST come from Molam ID (JWT) and are enforced here.
 */
notifyRouter.post("/send", async (req, res) => {
    try {
        const user = req.user!;
        const {
            user_id,
            agent_id,
            channel,
            payload,
            priority = 100,
            zone_code,
        }: SendNotificationRequest = req.body;

        if (!channel || !payload) return res.status(400).json({ error: "missing_channel_or_payload" });

        const zone = zone_code || user.country || "US";
        const language = user.lang || "en";
        const currency = user.currency || "USD";

        const id = uuidv4();
        const q = `INSERT INTO notifications(id,user_id,agent_id,channel,zone_code,language,currency,payload,priority,created_at,updated_at)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now())`;
        await pool.query(q, [id, user_id || null, agent_id || null, channel, zone, language, currency, payload, priority]);

        // Audit creation
        await pool.query(
            `INSERT INTO notification_audit(notification_id, actor, action, details) VALUES($1,$2,'create',$3)`,
            [id, `user:${user.id}`, { channel, zone, priority }]
        );

        return res.status(202).json({ id, status: "queued" });
    } catch (e: any) {
        return res.status(500).json({ error: "server_error", detail: e.message });
    }
});

notifyRouter.get("/:id/status", async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await pool.query(`SELECT id, status, provider_attempts, created_at, updated_at FROM notifications WHERE id=$1`, [id]);
        if (!rows[0]) return res.status(404).json({ error: "not_found" });
        const row = rows[0];

        // RBAC: if agent, ensure belongs to agent
        const user = req.user!;
        if (user.roles.includes("agent_partner") && row.agent_id && String(row.agent_id) !== String(user.agentId)) {
            return res.status(403).json({ error: "forbidden" });
        }
        return res.json(row);
    } catch (e: any) {
        return res.status(500).json({ error: "server_error", detail: e.message });
    }
});

export default notifyRouter;