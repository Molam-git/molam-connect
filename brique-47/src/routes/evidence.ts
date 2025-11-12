/**
 * Brique 47 - Evidence Routes
 * Upload and download dispute evidence
 */

import { Router, Request, Response } from "express";
import { UploadedFile } from "express-fileupload";
import { pool } from "../utils/db.js";
import { authenticateJWT, requireRole } from "../utils/authz.js";
import { putEvidence, getEvidenceURL, calculateHash } from "../utils/s3.js";

const router = Router();

/**
 * POST /api/connect/disputes/:disputeId/evidence
 * Upload evidence document
 */
router.post("/disputes/:disputeId/evidence", authenticateJWT, requireRole("merchant_admin", "pay_admin", "ops_disputes"), async (req: Request, res: Response) => {
  try {
    const { disputeId } = req.params;
    const { doc_type } = req.body;

    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: { message: "No file uploaded", type: "validation_error" } });
    }

    const file = req.files.file as UploadedFile;

    // Validate doc_type
    const validTypes = ["receipt", "delivery_proof", "communication_log", "photo", "video"];
    if (!validTypes.includes(doc_type)) {
      return res.status(400).json({ error: { message: "Invalid doc_type", type: "validation_error" } });
    }

    // Get dispute
    const { rows: [dispute] } = await pool.query(
      `SELECT merchant_id FROM disputes WHERE id = $1`,
      [disputeId]
    );

    if (!dispute) {
      return res.status(404).json({ error: { message: "Dispute not found", type: "not_found" } });
    }

    // Verify access
    if (req.user && req.user.roles.includes("merchant_admin") && req.user.merchantId !== dispute.merchant_id) {
      return res.status(403).json({ error: { message: "Access denied", type: "forbidden" } });
    }

    // Calculate hash and upload
    const fileBuffer = file.data;
    const hash = calculateHash(fileBuffer);
    const s3Key = `evidence/${disputeId}/${Date.now()}-${file.name}`;

    await putEvidence(s3Key, fileBuffer);

    // Store in database
    const { rows: [evidence] } = await pool.query(
      `INSERT INTO dispute_evidence(dispute_id, uploaded_by, uploader_id, doc_type, s3_key, hash, file_name, file_size, content_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [disputeId, req.user?.roles[0], req.user?.id, doc_type, s3Key, hash, file.name, file.size, file.mimetype]
    );

    // Log investigation
    await pool.query(
      `INSERT INTO dispute_investigations(dispute_id, action, actor, actor_id, details)
       VALUES ($1, 'evidence_uploaded', $2, $3, $4)`,
      [disputeId, req.user?.roles[0], req.user?.id, { doc_type, file_name: file.name, hash }]
    );

    // TODO: Emit webhook
    // await publishEvent("merchant", dispute.merchant_id, "dispute.evidence_submitted", evidence);

    res.status(201).json(evidence);
  } catch (err: any) {
    console.error("Error uploading evidence:", err);
    res.status(500).json({ error: { message: "Failed to upload evidence", type: "server_error" } });
  }
});

/**
 * GET /api/connect/disputes/:disputeId/evidence
 * List evidence for a dispute
 */
router.get("/disputes/:disputeId/evidence", authenticateJWT, requireRole("merchant_admin", "pay_admin", "ops_disputes"), async (req: Request, res: Response) => {
  try {
    const { disputeId } = req.params;

    const { rows: [dispute] } = await pool.query(
      `SELECT merchant_id FROM disputes WHERE id = $1`,
      [disputeId]
    );

    if (!dispute) {
      return res.status(404).json({ error: { message: "Dispute not found", type: "not_found" } });
    }

    // Verify access
    if (req.user && req.user.roles.includes("merchant_admin") && req.user.merchantId !== dispute.merchant_id) {
      return res.status(403).json({ error: { message: "Access denied", type: "forbidden" } });
    }

    const { rows } = await pool.query(
      `SELECT id, doc_type, uploaded_by, file_name, file_size, content_type, hash, created_at
       FROM dispute_evidence
       WHERE dispute_id = $1
       ORDER BY created_at`,
      [disputeId]
    );

    res.json({ data: rows });
  } catch (err: any) {
    console.error("Error fetching evidence:", err);
    res.status(500).json({ error: { message: "Failed to fetch evidence", type: "database_error" } });
  }
});

/**
 * GET /api/connect/evidence/:id/download
 * Download evidence (signed URL)
 */
router.get("/:id/download", authenticateJWT, requireRole("merchant_admin", "pay_admin", "ops_disputes", "auditor"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { rows: [evidence] } = await pool.query(
      `SELECT e.*, d.merchant_id
       FROM dispute_evidence e
       JOIN disputes d ON e.dispute_id = d.id
       WHERE e.id = $1`,
      [id]
    );

    if (!evidence) {
      return res.status(404).json({ error: { message: "Evidence not found", type: "not_found" } });
    }

    // Verify access
    if (req.user && req.user.roles.includes("merchant_admin") && req.user.merchantId !== evidence.merchant_id) {
      return res.status(403).json({ error: { message: "Access denied", type: "forbidden" } });
    }

    // Generate signed URL
    const url = await getEvidenceURL(evidence.s3_key, 300); // 5 minutes

    // Log access (audit trail)
    await pool.query(
      `INSERT INTO dispute_investigations(dispute_id, action, actor, actor_id, details)
       VALUES ($1, 'evidence_downloaded', $2, $3, $4)`,
      [evidence.dispute_id, req.user?.roles[0], req.user?.id, { evidence_id: id }]
    );

    res.json({ url, expires_in: 300 });
  } catch (err: any) {
    console.error("Error generating download URL:", err);
    res.status(500).json({ error: { message: "Failed to generate download URL", type: "server_error" } });
  }
});

export default router;
