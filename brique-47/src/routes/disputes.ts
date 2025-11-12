/**
 * Brique 47 - Disputes Routes
 * Network ingestion and merchant endpoints
 */

import { Router, Request, Response } from "express";
import { pool } from "../utils/db.js";
import { authenticateJWT, requireRole } from "../utils/authz.js";
import { verifyIP, verifySignature } from "../utils/security.js";
import { disputesTotal } from "../server.js";

const router = Router();

/**
 * POST /api/connect/disputes/ingest
 * Ingest dispute from card network/acquirer (mTLS required)
 */
router.post("/ingest", async (req: Request, res: Response) => {
  try {
    const clientIP = req.ip || req.socket.remoteAddress || "";

    // Verify IP whitelist
    if (!verifyIP(clientIP)) {
      return res.status(403).json({ error: { message: "IP not whitelisted", type: "forbidden" } });
    }

    // Verify signature
    const signature = req.headers["x-molam-signature"] as string;
    const acquirer = req.headers["x-acquirer"] as string;

    if (!signature || !acquirer) {
      return res.status(400).json({ error: { message: "Missing signature or acquirer header", type: "validation_error" } });
    }

    const payload = JSON.stringify(req.body);
    if (!verifySignature(payload, signature, acquirer)) {
      return res.status(401).json({ error: { message: "Invalid signature", type: "unauthorized" } });
    }

    const {
      external_dispute_id,
      payment_reference,
      merchant_id,
      amount,
      currency,
      reason_code,
      occurred_at,
      metadata,
    } = req.body;

    // Check idempotence
    const { rows: [existing] } = await pool.query(
      `SELECT id FROM disputes WHERE external_dispute_id = $1`,
      [external_dispute_id]
    );

    if (existing) {
      return res.json({ dispute_id: existing.id, status: "already_exists" });
    }

    // Create dispute
    const { rows: [dispute] } = await pool.query(
      `INSERT INTO disputes(external_dispute_id, payment_id, merchant_id, amount, currency, reason_code, status, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'received', $7, now())
       RETURNING *`,
      [external_dispute_id, payment_reference, merchant_id, amount, currency, reason_code, metadata || {}]
    );

    disputesTotal.labels(acquirer, reason_code || "unknown").inc();

    // TODO: Trigger background processor
    // await queueDisputeForProcessing(dispute.id);

    // TODO: Emit webhook
    // await publishEvent("merchant", merchant_id, "dispute.received", dispute);

    res.status(201).json({ dispute_id: dispute.id, status: "received" });
  } catch (err: any) {
    console.error("Error ingesting dispute:", err);
    res.status(500).json({ error: { message: "Failed to ingest dispute", type: "server_error" } });
  }
});

/**
 * GET /api/connect/merchants/:merchantId/disputes
 * List disputes for a merchant
 */
router.get("/merchants/:merchantId/disputes", authenticateJWT, requireRole("merchant_admin", "pay_admin"), async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    const { status, limit = 50, offset = 0 } = req.query;

    // Verify access
    if (req.user && req.user.roles.includes("merchant_admin") && req.user.merchantId !== merchantId) {
      return res.status(403).json({ error: { message: "Access denied", type: "forbidden" } });
    }

    let query = `SELECT id, external_dispute_id, payment_id, amount, currency, reason_code, status, outcome, sira_score, evidence_deadline, created_at
                 FROM disputes
                 WHERE merchant_id = $1`;
    const params: any[] = [merchantId];

    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    res.json({ data: rows });
  } catch (err: any) {
    console.error("Error fetching disputes:", err);
    res.status(500).json({ error: { message: "Failed to fetch disputes", type: "database_error" } });
  }
});

/**
 * GET /api/connect/disputes/:id
 * Get dispute details
 */
router.get("/:id", authenticateJWT, requireRole("merchant_admin", "pay_admin", "ops_disputes"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { rows: [dispute] } = await pool.query(
      `SELECT * FROM disputes WHERE id = $1`,
      [id]
    );

    if (!dispute) {
      return res.status(404).json({ error: { message: "Dispute not found", type: "not_found" } });
    }

    // Verify access
    if (req.user && req.user.roles.includes("merchant_admin") && req.user.merchantId !== dispute.merchant_id) {
      return res.status(403).json({ error: { message: "Access denied", type: "forbidden" } });
    }

    // Get evidence and investigation timeline
    const { rows: evidence } = await pool.query(
      `SELECT id, doc_type, uploaded_by, created_at FROM dispute_evidence WHERE dispute_id = $1 ORDER BY created_at`,
      [id]
    );

    const { rows: timeline } = await pool.query(
      `SELECT * FROM dispute_investigations WHERE dispute_id = $1 ORDER BY created_at`,
      [id]
    );

    res.json({ ...dispute, evidence, timeline });
  } catch (err: any) {
    console.error("Error fetching dispute:", err);
    res.status(500).json({ error: { message: "Failed to fetch dispute", type: "database_error" } });
  }
});

/**
 * POST /api/connect/disputes/:id/decision
 * Post dispute decision (ops only)
 */
router.post("/:id/decision", authenticateJWT, requireRole("pay_admin", "ops_disputes"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { outcome, outcome_amount, note } = req.body;

    if (!["merchant_won", "cardholder_won", "partial"].includes(outcome)) {
      return res.status(400).json({ error: { message: "Invalid outcome", type: "validation_error" } });
    }

    const { rows: [dispute] } = await pool.query(
      `SELECT * FROM disputes WHERE id = $1`,
      [id]
    );

    if (!dispute) {
      return res.status(404).json({ error: { message: "Dispute not found", type: "not_found" } });
    }

    await pool.query("BEGIN");

    // Update dispute
    await pool.query(
      `UPDATE disputes SET outcome=$1, outcome_amount=$2, status='decided', updated_at=now() WHERE id=$3`,
      [outcome, outcome_amount || dispute.amount, id]
    );

    // Log investigation
    await pool.query(
      `INSERT INTO dispute_investigations(dispute_id, action, actor, actor_id, details)
       VALUES ($1, 'decision', $2, $3, $4)`,
      [id, "ops", req.user?.id, { outcome, outcome_amount, note }]
    );

    // Execute settlement
    if (outcome === "cardholder_won" || outcome === "partial") {
      // Create chargeback
      await pool.query(
        `INSERT INTO chargebacks(dispute_id, merchant_id, amount, currency, status)
         VALUES ($1, $2, $3, $4, 'posted')`,
        [id, dispute.merchant_id, outcome_amount || dispute.amount, dispute.currency]
      );

      // TODO: Call Billing API for credit note
      // TODO: Call Treasury API for ledger entries
      // TODO: Emit webhooks
    }

    await pool.query("COMMIT");

    res.json({ message: "Decision posted", dispute_id: id, outcome });
  } catch (err: any) {
    await pool.query("ROLLBACK");
    console.error("Error posting decision:", err);
    res.status(500).json({ error: { message: "Failed to post decision", type: "server_error" } });
  }
});

export default router;
