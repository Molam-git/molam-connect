// src/routes/admin.ts
import { Router } from "express";
import { pool } from "../db";

export const adminRouter = Router();

interface ZoneUpdateRequest {
    prefer_sms?: boolean;
    prefer_email?: boolean;
    max_backoff_sec?: number;
    max_retries?: number;
    min_fee?: number;
    max_fee?: number;
    pricing_markup_pct?: number;
}

/**
 * PATCH /api/admin/zones/:zone_code
 * Body: { prefer_sms?, max_backoff_sec?, max_retries?, min_fee?, max_fee?, pricing_markup_pct? }
 * Role: pay_admin or agent_ops
 */
adminRouter.patch("/zones/:zone_code", async (req, res) => {
    try {
        const actor = req.user!;
        const { zone_code } = req.params;
        const { prefer_sms, prefer_email, max_backoff_sec, max_retries, min_fee, max_fee, pricing_markup_pct }: ZoneUpdateRequest = req.body;

        const existing = await pool.query(`SELECT zone_code FROM notification_zones WHERE zone_code=$1`, [zone_code]);
        if (existing.rowCount === 0) {
            await pool.query(
                `INSERT INTO notification_zones(zone_code, prefer_sms, prefer_email, max_backoff_sec, max_retries, min_fee, max_fee, pricing_markup_pct, updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())`,
                [zone_code, prefer_sms || false, prefer_email || false, max_backoff_sec || 300, max_retries || 5, min_fee || 0.01, max_fee || 5.0, pricing_markup_pct || 0.0]
            );
        } else {
            await pool.query(
                `UPDATE notification_zones SET prefer_sms=$1, prefer_email=$2, max_backoff_sec=$3, max_retries=$4, min_fee=$5, max_fee=$6, pricing_markup_pct=$7, updated_at=now()
         WHERE zone_code=$8`,
                [prefer_sms || false, prefer_email || false, max_backoff_sec || 300, max_retries || 5, min_fee || 0.01, max_fee || 5.0, pricing_markup_pct || 0.0, zone_code]
            );
        }

        await pool.query(
            `INSERT INTO notification_audit(notification_id, actor, action, details) VALUES($1,$2,'update_zone',$3)`,
            [null, `agent_ops:${actor.id}`, { zone_code, changes: req.body }]
        );

        const q = await pool.query(`SELECT * FROM notification_zones WHERE zone_code=$1`, [zone_code]);
        return res.json(q.rows[0]);
    } catch (e: any) {
        return res.status(500).json({ error: "server_error", detail: e.message });
    }
});

/**
 * POST /api/admin/notifications/:id/requeue
 */
adminRouter.post("/notifications/:id/requeue", async (req, res) => {
    try {
        const { id } = req.params;
        const actor = req.user!;
        // mark for immediate requeue: clear attempts and set status pending
        await pool.query(`UPDATE notifications SET status='pending', next_attempt_at=NULL, updated_at=now() WHERE id=$1`, [id]);
        await pool.query(`INSERT INTO notification_audit(notification_id, actor, action, details) VALUES($1,$2,'requeue', $3)`, [id, `agent_ops:${actor.id}`, { reason: req.body.reason || null }]);
        return res.json({ id, status: "requeued" });
    } catch (e: any) {
        return res.status(500).json({ error: "server_error", detail: e.message });
    }
});

/**
 * POST /api/admin/notifications/:id/abort
 */
adminRouter.post("/notifications/:id/abort", async (req, res) => {
    try {
        const { id } = req.params;
        const actor = req.user!;
        await pool.query(`UPDATE notifications SET status='aborted', updated_at=now() WHERE id=$1`, [id]);
        await pool.query(`INSERT INTO notification_audit(notification_id, actor, action, details) VALUES($1,$2,'abort',$3)`, [id, `agent_ops:${actor.id}`, { reason: req.body.reason || null }]);
        return res.json({ id, status: "aborted" });
    } catch (e: any) {
        return res.status(500).json({ error: "server_error", detail: e.message });
    }
});

/**
 * GET /api/admin/notifications/ops
 * lists pending/failed notifications for ops dashboard
 */
adminRouter.get("/notifications/ops", async (req, res) => {
    try {
        const actor = req.user!;
        // Agent partners can only see their agent_id notifications
        let q = `SELECT id, channel, zone_code, language, currency, payload, provider_attempts, status, agent_id FROM notifications WHERE status IN ('pending','failed') ORDER BY created_at DESC LIMIT 200`;
        const params: any[] = [];
        if (actor.roles.includes("agent_partner") && actor.agentId) {
            q = `SELECT id, channel, zone_code, language, currency, payload, provider_attempts, status, agent_id FROM notifications WHERE status IN ('pending','failed') AND agent_id=$1 ORDER BY created_at DESC LIMIT 200`;
            params.push(actor.agentId);
        }
        const { rows } = await pool.query(q, params);
        return res.json({ rows });
    } catch (e: any) {
        return res.status(500).json({ error: "server_error", detail: e.message });
    }
});

export default adminRouter;