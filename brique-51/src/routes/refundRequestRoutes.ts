/**
 * Brique 51bis - Merchant Refund Policies & Zones
 * Refund Request API Routes
 */

import { Router, Request, Response } from "express";
import { requireRole } from "../utils/authz.js";
import { evaluateAndApplyPolicy, applyPolicyDecision } from "../services/policy/policyService.js";
import { pool } from "../utils/db.js";

export const refundRequestRouter = Router();

/**
 * Create refund request (idempotent)
 * POST /api/refund-requests
 */
refundRequestRouter.post("/refund-requests", async (req: any, res: Response) => {
  try {
    const {
      idempotency_key,
      payment_id,
      merchant_id,
      sub_account_id,
      customer_id,
      customer_country,
      amount,
      currency,
      reason,
    } = req.body;

    // Validation
    if (!idempotency_key) {
      res.status(400).json({ error: "idempotency_key_required" });
      return;
    }

    if (!payment_id || !merchant_id || !customer_id || !amount || !currency) {
      res.status(400).json({ error: "missing_required_fields" });
      return;
    }

    // Check idempotency
    const { rows: existing } = await pool.query(
      `SELECT * FROM refund_requests WHERE idempotency_key = $1`,
      [idempotency_key]
    );

    if (existing.length) {
      console.log(`[RefundRequest] Idempotency key ${idempotency_key} already exists`);
      res.json(existing[0]);
      return;
    }

    // Create refund request
    const { rows } = await pool.query(
      `INSERT INTO refund_requests(
        idempotency_key, payment_id, merchant_id, sub_account_id, customer_id,
        customer_country, amount, currency, reason, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'requested', now(), now())
      RETURNING *`,
      [
        idempotency_key,
        payment_id,
        merchant_id,
        sub_account_id || null,
        customer_id,
        customer_country || null,
        amount,
        currency,
        reason || null,
      ]
    );

    const refundRequest = rows[0];

    // Log action
    await pool.query(
      `INSERT INTO refund_actions(refund_request_id, actor_type, actor_id, action, details, ip_address, user_agent, created_at)
       VALUES ($1, 'customer', $2, 'request_created', $3, $4, $5, now())`,
      [refundRequest.id, customer_id, { reason }, req.ip, req.headers["user-agent"]]
    );

    // Evaluate policy synchronously
    const decision = await evaluateAndApplyPolicy(refundRequest);
    await applyPolicyDecision(refundRequest.id, decision);

    // If auto-approved, update status and enqueue processing
    if (decision.action === "auto_approve") {
      await pool.query(
        `UPDATE refund_requests SET status = 'auto_approved', updated_at = now() WHERE id = $1`,
        [refundRequest.id]
      );

      await pool.query(
        `INSERT INTO refund_actions(refund_request_id, actor_type, action, details, created_at)
         VALUES ($1, 'system', 'auto_approve', $2, now())`,
        [refundRequest.id, { decision }]
      );

      // TODO: Enqueue refund processing job
    }

    // Get updated refund request
    const { rows: updated } = await pool.query(`SELECT * FROM refund_requests WHERE id = $1`, [refundRequest.id]);

    res.json({
      refund_request: updated[0],
      decision,
    });
  } catch (e: any) {
    console.error("Create refund request error:", e);
    res.status(400).json({ error: e.message });
  }
});

/**
 * Get refund request by ID
 * GET /api/refund-requests/:id
 */
refundRequestRouter.get("/refund-requests/:id", requireRole("merchant_admin", "pay_admin", "user"), async (req: any, res: Response) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM refund_requests WHERE id = $1`, [req.params.id]);

    if (!rows[0]) {
      res.status(404).json({ error: "refund_request_not_found" });
      return;
    }

    const refundRequest = rows[0];

    // Authorization check
    if (req.user.roles.includes("user") && refundRequest.customer_id !== req.user.id) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    if (req.user.roles.includes("merchant_admin") && refundRequest.merchant_id !== req.user.merchantId) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    res.json(refundRequest);
  } catch (e: any) {
    console.error("Get refund request error:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * List refund requests
 * GET /api/refund-requests?status=requested&merchant_id=uuid
 */
refundRequestRouter.get("/refund-requests", requireRole("merchant_admin", "pay_admin"), async (req: any, res: Response) => {
  try {
    let query = `SELECT * FROM refund_requests WHERE 1=1`;
    const params: any[] = [];

    if (req.query.status) {
      params.push(req.query.status);
      query += ` AND status = $${params.length}`;
    }

    if (req.query.merchant_id) {
      params.push(req.query.merchant_id);
      query += ` AND merchant_id = $${params.length}`;
    }

    // Merchants can only see their own requests
    if (req.user.roles.includes("merchant_admin") && !req.user.roles.includes("pay_admin")) {
      params.push(req.user.merchantId);
      query += ` AND merchant_id = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT 200`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) {
    console.error("List refund requests error:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Merchant approve refund request
 * POST /api/refund-requests/:id/merchant-approve
 */
refundRequestRouter.post("/refund-requests/:id/merchant-approve", requireRole("merchant_admin"), async (req: any, res: Response) => {
  try {
    const { rows: [refundRequest] } = await pool.query(
      `SELECT * FROM refund_requests WHERE id = $1`,
      [req.params.id]
    );

    if (!refundRequest) {
      res.status(404).json({ error: "refund_request_not_found" });
      return;
    }

    // Check merchant ownership
    if (refundRequest.merchant_id !== req.user.merchantId) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    // Check status
    if (refundRequest.status !== "requested") {
      res.status(400).json({ error: "invalid_status", message: "Can only approve requests in 'requested' status" });
      return;
    }

    // Update status
    await pool.query(
      `UPDATE refund_requests SET status = 'merchant_approved', updated_at = now() WHERE id = $1`,
      [req.params.id]
    );

    // Log action
    await pool.query(
      `INSERT INTO refund_actions(refund_request_id, actor_type, actor_id, action, details, created_at)
       VALUES ($1, 'merchant', $2, 'merchant_approve', $3, now())`,
      [req.params.id, req.user.id, { approver: req.user.id }]
    );

    // TODO: Enqueue refund processing job

    res.json({ success: true });
  } catch (e: any) {
    console.error("Merchant approve error:", e);
    res.status(400).json({ error: e.message });
  }
});

/**
 * Ops approve refund request
 * POST /api/refund-requests/:id/ops-approve
 */
refundRequestRouter.post("/refund-requests/:id/ops-approve", requireRole("finance_ops", "pay_admin"), async (req: any, res: Response) => {
  try {
    const { rows: [refundRequest] } = await pool.query(
      `SELECT * FROM refund_requests WHERE id = $1`,
      [req.params.id]
    );

    if (!refundRequest) {
      res.status(404).json({ error: "refund_request_not_found" });
      return;
    }

    // Update status
    await pool.query(
      `UPDATE refund_requests SET status = 'ops_approved', updated_at = now() WHERE id = $1`,
      [req.params.id]
    );

    // Log action
    await pool.query(
      `INSERT INTO refund_actions(refund_request_id, actor_type, actor_id, action, details, created_at)
       VALUES ($1, 'ops', $2, 'ops_approve', $3, now())`,
      [req.params.id, req.user.id, { approver: req.user.id }]
    );

    // TODO: Enqueue refund processing job

    res.json({ success: true });
  } catch (e: any) {
    console.error("Ops approve error:", e);
    res.status(400).json({ error: e.message });
  }
});

/**
 * Deny refund request
 * POST /api/refund-requests/:id/deny
 */
refundRequestRouter.post("/refund-requests/:id/deny", requireRole("merchant_admin", "pay_admin"), async (req: any, res: Response) => {
  try {
    const { reason } = req.body;

    const { rows: [refundRequest] } = await pool.query(
      `SELECT * FROM refund_requests WHERE id = $1`,
      [req.params.id]
    );

    if (!refundRequest) {
      res.status(404).json({ error: "refund_request_not_found" });
      return;
    }

    // Check authorization
    if (req.user.roles.includes("merchant_admin") && refundRequest.merchant_id !== req.user.merchantId) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    // Update status
    await pool.query(
      `UPDATE refund_requests SET status = 'denied', updated_at = now() WHERE id = $1`,
      [req.params.id]
    );

    // Log action
    await pool.query(
      `INSERT INTO refund_actions(refund_request_id, actor_type, actor_id, action, details, created_at)
       VALUES ($1, $2, $3, 'deny', $4, now())`,
      [
        req.params.id,
        req.user.roles.includes("pay_admin") ? "ops" : "merchant",
        req.user.id,
        { reason, denied_by: req.user.id }
      ]
    );

    res.json({ success: true });
  } catch (e: any) {
    console.error("Deny refund request error:", e);
    res.status(400).json({ error: e.message });
  }
});

/**
 * Get refund request actions (audit trail)
 * GET /api/refund-requests/:id/actions
 */
refundRequestRouter.get("/refund-requests/:id/actions", requireRole("merchant_admin", "pay_admin", "auditor"), async (req: any, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM refund_actions WHERE refund_request_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );

    res.json(rows);
  } catch (e: any) {
    console.error("Get refund actions error:", e);
    res.status(500).json({ error: e.message });
  }
});
