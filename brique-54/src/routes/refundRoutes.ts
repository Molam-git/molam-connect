/**
 * Refund API Routes
 */
import { Router, Response } from "express";
import { AuthRequest, requireRole } from "../utils/authz.js";
import {
  createRefund,
  processRefund,
  approveRefund,
  cancelRefund,
  logRefundAudit,
} from "../services/refundService.js";
import { pool } from "../utils/db.js";

export const refundRouter = Router();

// Create refund
refundRouter.post(
  "/refunds",
  requireRole("merchant_admin", "pay_admin", "finance_ops"),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        idempotency_key,
        payment_id,
        merchant_id,
        amount,
        currency,
        reason,
        initiated_by = "merchant",
      } = req.body;

      if (!idempotency_key || !payment_id || !amount || !currency) {
        res.status(400).json({
          error: { message: "Missing required fields", type: "validation_error" },
        });
        return;
      }

      const effectiveMerchantId = merchant_id || req.user?.merchantId;
      if (!effectiveMerchantId) {
        res.status(400).json({
          error: { message: "merchant_id required", type: "validation_error" },
        });
        return;
      }

      // Check authorization
      if (
        effectiveMerchantId !== req.user?.merchantId &&
        !req.user?.roles.includes("pay_admin")
      ) {
        res.status(403).json({ error: { message: "Forbidden", type: "forbidden" } });
        return;
      }

      const refund = await createRefund(
        {
          idempotencyKey: idempotency_key,
          paymentId: payment_id,
          merchantId: effectiveMerchantId,
          amount: Number(amount),
          currency,
          reason,
          initiatedBy: initiated_by,
        },
        req.user?.id
      );

      res.status(201).json(refund);
    } catch (err: any) {
      console.error("Create refund error:", err);
      const status = err.message.includes("not_found") ? 404 : 400;
      res.status(status).json({
        error: { message: err.message || "Failed to create refund", type: "server_error" },
      });
    }
  }
);

// Get refund by ID
refundRouter.get("/refunds/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query("SELECT * FROM refunds WHERE id = $1", [id]);

    if (!rows.length) {
      res.status(404).json({ error: { message: "Refund not found", type: "not_found" } });
      return;
    }

    const refund = rows[0];

    // Check authorization
    if (
      refund.merchant_id !== req.user?.merchantId &&
      !req.user?.roles.includes("pay_admin")
    ) {
      res.status(403).json({ error: { message: "Forbidden", type: "forbidden" } });
      return;
    }

    res.json(refund);
  } catch (err: any) {
    console.error("Get refund error:", err);
    res.status(500).json({
      error: { message: err.message || "Failed to get refund", type: "server_error" },
    });
  }
});

// List merchant refunds
refundRouter.get("/merchant/:merchantId/refunds", async (req: AuthRequest, res: Response) => {
  try {
    const { merchantId } = req.params;
    const { status, limit = "100", offset = "0" } = req.query;

    // Check authorization
    if (merchantId !== req.user?.merchantId && !req.user?.roles.includes("pay_admin")) {
      res.status(403).json({ error: { message: "Forbidden", type: "forbidden" } });
      return;
    }

    let query = "SELECT * FROM refunds WHERE merchant_id = $1";
    const params: any[] = [merchantId];

    if (status) {
      query += " AND status = $2";
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const { rows } = await pool.query(query, params);

    // Get total count
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM refunds WHERE merchant_id = $1${status ? " AND status = $2" : ""}`,
      status ? [merchantId, status] : [merchantId]
    );

    res.json({
      data: rows,
      total: parseInt(countRows[0].count),
      has_more: rows.length === parseInt(limit as string),
    });
  } catch (err: any) {
    console.error("List refunds error:", err);
    res.status(500).json({
      error: { message: err.message || "Failed to list refunds", type: "server_error" },
    });
  }
});

// Approve refund (ops only)
refundRouter.post(
  "/refunds/:id/approve",
  requireRole("pay_admin", "finance_ops"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const refund = await approveRefund(id, req.user!.id);

      res.json(refund);
    } catch (err: any) {
      console.error("Approve refund error:", err);
      res.status(400).json({
        error: { message: err.message || "Failed to approve refund", type: "server_error" },
      });
    }
  }
);

// Cancel refund (ops only)
refundRouter.post(
  "/refunds/:id/cancel",
  requireRole("pay_admin", "finance_ops"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const refund = await cancelRefund(id, req.user!.id, reason);

      res.json(refund);
    } catch (err: any) {
      console.error("Cancel refund error:", err);
      res.status(400).json({
        error: { message: err.message || "Failed to cancel refund", type: "server_error" },
      });
    }
  }
);

// Process refund (internal/ops)
refundRouter.post(
  "/refunds/:id/process",
  requireRole("pay_admin", "finance_ops"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const refund = await processRefund(id);

      res.json(refund);
    } catch (err: any) {
      console.error("Process refund error:", err);
      res.status(400).json({
        error: { message: err.message || "Failed to process refund", type: "server_error" },
      });
    }
  }
);

// Get refund audit log
refundRouter.get("/refunds/:id/audit", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Check refund exists and user has access
    const { rows: refundRows } = await pool.query("SELECT * FROM refunds WHERE id = $1", [id]);
    if (!refundRows.length) {
      res.status(404).json({ error: { message: "Refund not found", type: "not_found" } });
      return;
    }

    if (
      refundRows[0].merchant_id !== req.user?.merchantId &&
      !req.user?.roles.includes("pay_admin")
    ) {
      res.status(403).json({ error: { message: "Forbidden", type: "forbidden" } });
      return;
    }

    const { rows } = await pool.query(
      "SELECT * FROM refund_audit_logs WHERE refund_id = $1 ORDER BY created_at DESC",
      [id]
    );

    res.json({ data: rows });
  } catch (err: any) {
    console.error("Get refund audit error:", err);
    res.status(500).json({
      error: { message: err.message || "Failed to get audit log", type: "server_error" },
    });
  }
});

// Get/Update refund rules (ops only)
refundRouter.get("/refund-rules", requireRole("pay_admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { merchant_id } = req.query;

    let query = "SELECT * FROM refund_rules WHERE is_active = true";
    const params: any[] = [];

    if (merchant_id) {
      query += " AND merchant_id = $1";
      params.push(merchant_id);
    } else {
      query += " AND merchant_id IS NULL"; // Global rules
    }

    const { rows } = await pool.query(query, params);

    res.json({ data: rows });
  } catch (err: any) {
    console.error("Get refund rules error:", err);
    res.status(500).json({
      error: { message: err.message || "Failed to get refund rules", type: "server_error" },
    });
  }
});

refundRouter.post("/refund-rules", requireRole("pay_admin"), async (req: AuthRequest, res: Response) => {
  try {
    const {
      merchant_id,
      max_refund_days,
      max_amount_without_approval,
      require_ops_approval_above,
      auto_refund_enabled,
      max_refund_percentage,
      sira_threshold,
    } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO refund_rules (
        merchant_id, max_refund_days, max_amount_without_approval,
        require_ops_approval_above, auto_refund_enabled, max_refund_percentage, sira_threshold
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (merchant_id) DO UPDATE SET
        max_refund_days = EXCLUDED.max_refund_days,
        max_amount_without_approval = EXCLUDED.max_amount_without_approval,
        require_ops_approval_above = EXCLUDED.require_ops_approval_above,
        auto_refund_enabled = EXCLUDED.auto_refund_enabled,
        max_refund_percentage = EXCLUDED.max_refund_percentage,
        sira_threshold = EXCLUDED.sira_threshold,
        updated_at = now()
      RETURNING *`,
      [
        merchant_id || null,
        max_refund_days,
        max_amount_without_approval,
        require_ops_approval_above,
        auto_refund_enabled,
        max_refund_percentage,
        sira_threshold,
      ]
    );

    res.json(rows[0]);
  } catch (err: any) {
    console.error("Update refund rules error:", err);
    res.status(500).json({
      error: { message: err.message || "Failed to update refund rules", type: "server_error" },
    });
  }
});
