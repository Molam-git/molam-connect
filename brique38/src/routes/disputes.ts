import express from "express";
import { pool } from "../db";
import { publishEvent } from "../events";
import { authzMiddleware, requireRole } from "../utils/authz";

const router = express.Router();
router.use(authzMiddleware);

// Créer un litige
router.post("/", async (req: any, res: any) => {
    try {
        const { external_ref, origin, origin_id, transaction_id, amount, currency, dispute_type, metadata } = req.body;

        if (external_ref) {
            const existing = await pool.query("SELECT * FROM disputes WHERE external_ref=$1", [external_ref]);
            if (existing.rowCount) return res.json(existing.rows[0]);
        }

        const slaHours = (req.body.priority === 'critical') ? 24 : 72;
        const slaDue = new Date(Date.now() + slaHours * 3600 * 1000);

        const { rows } = await pool.query(
            `INSERT INTO disputes (external_ref, origin, origin_id, transaction_id, amount, currency, dispute_type, sla_due, metadata) 
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [external_ref, origin, origin_id, transaction_id, amount, currency, dispute_type, slaDue.toISOString(), metadata || {}]
        );

        const dispute = rows[0];

        await pool.query(
            `INSERT INTO dispute_history (dispute_id, actor, action, details) VALUES ($1,$2,'submitted',$3)`,
            [dispute.id, origin_id, { source: req.ip }]
        );

        await publishEvent("dispute.created", { disputeId: dispute.id });
        return res.json(dispute);
    } catch (e: any) {
        console.error(e);
        return res.status(500).json({ error: "server_error", detail: e.message });
    }
});

// Upload de preuve
router.post("/:id/evidence", async (req: any, res: any) => {
    try {
        const { s3_key, evidence_type, hash } = req.body;
        const disputeId = req.params.id;
        const uploader = req.user.id;

        await pool.query(
            `INSERT INTO dispute_evidences (dispute_id, uploader_id, evidence_type, s3_key, hash) VALUES ($1,$2,$3,$4,$5)`,
            [disputeId, uploader, evidence_type, s3_key, hash]
        );

        await pool.query(
            `INSERT INTO dispute_history (dispute_id, actor, action, details) VALUES ($1,$2,'evidence_uploaded',$3)`,
            [disputeId, uploader, { s3_key }]
        );

        await publishEvent("dispute.evidence_added", { disputeId });
        res.json({ ok: true });
    } catch (e: any) {
        console.error(e);
        return res.status(500).json({ error: "server_error", detail: e.message });
    }
});

// Résolution de litige
router.post("/:id/resolve", requireRole(["pay_admin", "arbiter", "finance_ops"]), async (req: any, res: any) => {
    try {
        const disputeId = req.params.id;
        const { action, details } = req.body;

        await pool.query(
            `UPDATE disputes SET status=$1, resolution=$2, assigned_to=$3, updated_at=now() WHERE id=$4`,
            [action === 'dismiss' ? 'dismissed' : 'resolved', JSON.stringify({ action, details }), req.user.id, disputeId]
        );

        await pool.query(
            `INSERT INTO dispute_history (dispute_id, actor, action, details) VALUES ($1,$2,'status_changed',$3)`,
            [disputeId, req.user.id, { action, details }]
        );

        if (action === 'refund') {
            await publishEvent("dispute.refund.requested", {
                disputeId,
                amount: details.amount,
                txnId: details.txnId
            });
        }

        res.json({ ok: true });
    } catch (e: any) {
        console.error(e);
        return res.status(500).json({ error: "server_error", detail: e.message });
    }
});

export default router;