// src/routes/fraud_ops.ts
import express from "express";
import { pool } from "../db";
import { publish } from "../utils/kafka";

const router = express.Router();

// Create case (auto or manual)
router.post("/cases", async (req: any, res: any) => {
    try {
        const { correlation_id, origin_module, entity_type, entity_id, score, suggested_action, severity, context } = req.body;
        const { rows } = await pool.query(
            `INSERT INTO fraud_cases (correlation_id, origin_module, entity_type, entity_id, score, suggested_action, severity, context) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [correlation_id, origin_module, entity_type, entity_id, score, suggested_action, severity, context || {}]
        );
        const caseRec = rows[0];
        await publish("fraud.case.created", caseRec);
        res.json(caseRec);
    } catch (err: any) {
        res.status(500).json({ error: "server_error", detail: err.message });
    }
});

// Execute playbook on case (idempotent)
router.post("/cases/:id/execute_playbook", async (req: any, res: any) => {
    try {
        const idempotency = req.headers["idempotency-key"] || req.body.idempotency_key;
        if (!idempotency) return res.status(400).json({ error: "idempotency_required" });
        const caseId = req.params.id;
        const { playbook_id } = req.body;
        const { rows: pbrows } = await pool.query(`SELECT * FROM fraud_playbooks WHERE id=$1 AND is_active=true`, [playbook_id]);
        if (!pbrows.length) return res.status(404).json({ error: "playbook_not_found" });
        const pb = pbrows[0];
        await pool.query(
            `INSERT INTO fraud_case_actions (fraud_case_id, actor_id, action_type, payload, idempotency_key) VALUES ($1,$2,$3,$4,$5)`,
            [caseId, req.user?.id || null, "execute_playbook", pb.dsl, idempotency]
        );
        await publish("fraud.playbook.execute", { caseId, playbook: pb, idempotency, triggered_by: req.user?.id || "system" });
        res.json({ ok: true, caseId, playbook_id, idempotency });
    } catch (err: any) {
        res.status(500).json({ error: "server_error", detail: err.message });
    }
});

// Approve (append approval)
router.post("/cases/:caseId/approvals/:approvalId/approve", async (req: any, res: any) => {
    try {
        const { caseId, approvalId } = req.params;
        const user = req.user;
        await pool.query(`UPDATE fraud_approvals SET approvals = COALESCE(approvals,'[]'::jsonb) || $1 WHERE id=$2`, [JSON.stringify([{ user_id: user.id, roles: user.roles, ts: new Date() }]), approvalId]);
        const { rows } = await pool.query(`SELECT * FROM fraud_approvals WHERE id=$1`, [approvalId]);
        const approv = rows[0];
        const approvals = JSON.parse(approv.approvals || "[]");
        const required = JSON.parse(approv.required_signers || "[]");
        const done = approvals.length;
        if (required.length && done >= required.length) {
            await pool.query(`UPDATE fraud_approvals SET status='approved' WHERE id=$1`, [approvalId]);
            await publish("fraud.approval.completed", { approvalId, fraud_case_id: approv.fraud_case_id });
        }
        res.json({ ok: true });
    } catch (err: any) {
        res.status(500).json({ error: "server_error", detail: err.message });
    }
});

export default router;