/**
 * Brique 51 - Refunds & Reversals
 * API Routes
 */

import { Router, Request, Response } from "express";
import { requireRole } from "../utils/authz.js";
import {
  createRefund,
  getRefundById,
  listRefunds,
  approveRefund,
  rejectRefund,
} from "../services/refundService.js";
import { pool } from "../utils/db.js";

export const refundRouter = Router();

/**
 * Merchant initiates refund (Connect/Shop)
 * POST /api/refunds
 */
refundRouter.post("/refunds", requireRole("merchant_admin", "pay_admin"), async (req: any, res: Response) => {
  try {
    const input = {
      ...req.body,
      initiator: "merchant" as const,
      initiatorId: req.user.merchantId || req.user.id,
    };

    const refund = await createRefund(input);
    res.json(refund);
  } catch (e: any) {
    console.error("Create refund error:", e);
    res.status(400).json({ error: e.message });
  }
});

/**
 * Customer requests refund via app
 * POST /api/customer/refund
 */
refundRouter.post("/customer/refund", requireRole("user"), async (req: any, res: Response) => {
  try {
    const input = {
      ...req.body,
      initiator: "customer" as const,
      initiatorId: req.user.id,
    };

    const refund = await createRefund(input);
    res.json(refund);
  } catch (e: any) {
    console.error("Customer refund error:", e);
    res.status(400).json({ error: e.message });
  }
});

/**
 * List refunds
 * GET /api/refunds
 */
refundRouter.get("/refunds", requireRole("merchant_admin", "pay_admin", "ops_refund"), async (req: any, res: Response) => {
  try {
    const filters = {
      status: req.query.status as string,
      initiator: req.query.initiator as string,
      paymentId: req.query.payment_id as string,
    };

    const refunds = await listRefunds(filters);
    res.json(refunds);
  } catch (e: any) {
    console.error("List refunds error:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Get refund by ID
 * GET /api/refunds/:id
 */
refundRouter.get("/refunds/:id", requireRole("merchant_admin", "pay_admin", "ops_refund"), async (req: any, res: Response) => {
  try {
    const refund = await getRefundById(req.params.id);
    res.json(refund);
  } catch (e: any) {
    console.error("Get refund error:", e);
    res.status(404).json({ error: e.message });
  }
});

/**
 * Ops: List pending approvals
 * GET /api/ops/refunds/pending
 */
refundRouter.get("/ops/refunds/pending", requireRole("pay_admin", "ops_refund"), async (req: any, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM refunds WHERE status = 'requires_approval' ORDER BY created_at DESC LIMIT 200`
    );
    res.json(rows);
  } catch (e: any) {
    console.error("List pending refunds error:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Ops: Approve refund
 * POST /api/ops/refunds/:id/approve
 */
refundRouter.post("/ops/refunds/:id/approve", requireRole("pay_admin", "ops_refund"), async (req: any, res: Response) => {
  try {
    const refundId = req.params.id;
    const { note } = req.body;

    await approveRefund(refundId, req.user.id, req.user.roles[0], note);

    res.json({ success: true });
  } catch (e: any) {
    console.error("Approve refund error:", e);
    res.status(400).json({ error: e.message });
  }
});

/**
 * Ops: Reject refund
 * POST /api/ops/refunds/:id/reject
 */
refundRouter.post("/ops/refunds/:id/reject", requireRole("pay_admin", "ops_refund"), async (req: any, res: Response) => {
  try {
    const refundId = req.params.id;
    const { note } = req.body;

    await rejectRefund(refundId, req.user.id, req.user.roles[0], note);

    res.json({ success: true });
  } catch (e: any) {
    console.error("Reject refund error:", e);
    res.status(400).json({ error: e.message });
  }
});

/**
 * Get refund events history
 * GET /api/refunds/:id/events
 */
refundRouter.get("/refunds/:id/events", requireRole("merchant_admin", "pay_admin", "ops_refund"), async (req: any, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM refund_events WHERE refund_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );

    res.json(rows);
  } catch (e: any) {
    console.error("Get refund events error:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Create refund dispute
 * POST /api/refunds/:id/dispute
 */
refundRouter.post("/refunds/:id/dispute", requireRole("user", "merchant_admin"), async (req: any, res: Response) => {
  try {
    const { dispute_reason, evidence } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO refund_disputes(refund_id, customer_id, dispute_reason, evidence, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'open', now(), now())
       RETURNING *`,
      [req.params.id, req.user.id, dispute_reason, evidence || {}]
    );

    res.json(rows[0]);
  } catch (e: any) {
    console.error("Create dispute error:", e);
    res.status(400).json({ error: e.message });
  }
});
