// api/src/routes/kyc.ts
import { Router } from "express";
import { pool } from "../db";
import { requireRole, authzMiddleware } from "../middleware/authz";
import { createPresignedPut } from "../services/s3-service";
import { enqueueVerification } from "../workers/queue";

const router = Router();

router.post("/upload", authzMiddleware, async (req: any, res) => {
    const user = req.user;
    const { document_type_code, filename, country } = req.body;

    const dt = await pool.query("SELECT id FROM document_types WHERE code=$1", [document_type_code]);
    if (dt.rowCount === 0) return res.status(400).json({ error: "invalid_document_type" });

    const docId = crypto.randomUUID();
    const s3Key = `kyc/${user.id}/${docId}/${Date.now()}_${filename}`;
    const presigned = await createPresignedPut(s3Key, { contentType: req.body.contentType });

    await pool.query(
        `INSERT INTO wallet_documents (id, user_id, document_type_id, filename, s3_key, metadata, uploaded_via, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [docId, user.id, dt.rows[0].id, filename, s3Key, JSON.stringify({ country }), 'web', user.id]
    );

    await pool.query(
        `INSERT INTO molam_audit_logs (actor, action, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5)`,
        [user.id, 'kyc_upload_started', 'wallet_document', docId, JSON.stringify({ filename, country })]
    );

    res.json({ docId, presignedUrl: presigned.url, fields: presigned.fields });
});

router.post("/finish", authzMiddleware, async (req: any, res) => {
    const { docId, checksum } = req.body;

    await pool.query(
        `UPDATE wallet_documents SET status='processing', checksum=$1, updated_at=now() WHERE id=$2`,
        [checksum, docId]
    );

    await enqueueVerification(docId);
    res.json({ status: "queued" });
});

router.get("/status", authzMiddleware, async (req: any, res) => {
    const user = req.user;

    const v = await pool.query(`SELECT * FROM wallet_verifications WHERE user_id=$1`, [user.id]);
    const docs = await pool.query(
        `SELECT id, document_type_id, filename, status, metadata, created_at FROM wallet_documents WHERE user_id=$1`,
        [user.id]
    );

    res.json({ verification: v.rows[0] || null, documents: docs.rows });
});

router.get("/policies", authzMiddleware, async (req: any, res) => {
    const { country, account_type } = req.query;

    const policies = await pool.query(
        `SELECT code, display_name, required_for FROM document_types WHERE required_for @> $1`,
        [JSON.stringify([{ country, account_types: [account_type] }])]
    );

    res.json(policies.rows);
});

router.post("/internal/approve", authzMiddleware, requireRole(["kyc_officer", "pay_admin"]), async (req: any, res) => {
    const { user_id, doc_id, level_code } = req.body;

    const level = await pool.query("SELECT id FROM kyc_levels WHERE code=$1", [level_code]);
    if (level.rowCount === 0) return res.status(400).json({ error: "invalid_level" });

    await pool.query(
        `UPDATE wallet_verifications SET kyc_level_id=$1, status='verified', primary_document_id=$2, last_checked_at=now(), updated_at=now() WHERE user_id=$3`,
        [level.rows[0].id, doc_id, user_id]
    );

    await pool.query(
        `INSERT INTO molam_audit_logs (actor, action, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5)`,
        [req.user.id, 'kyc_approved', 'wallet_verification', user_id, JSON.stringify({ doc_id, level: level_code })]
    );

    res.json({ ok: true });
});

export default router;