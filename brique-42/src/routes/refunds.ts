/**
 * Brique 42 - Connect Payments
 * Refunds API routes
 */

import { Router } from "express";
import { pool } from "../db";
import { emitEvent, EventTypes } from "../services/events";
import { requireRole } from "../rbac";

export const refundsRouter = Router();

/**
 * POST /api/connect/refunds
 * Create a refund for a charge
 */
refundsRouter.post(
  "/",
  requireRole(["merchant_admin", "merchant_finance", "pay_admin"]),
  async (req: any, res) => {
    try {
      const { charge_id, amount, reason } = req.body;

      if (!charge_id || !amount) {
        return res.status(400).json({
          error: "missing_required_fields",
          required: ["charge_id", "amount"],
        });
      }

      // Get charge
      const { rows: chargeRows } = await pool.query(
        `SELECT * FROM connect_charges WHERE id = $1`,
        [charge_id]
      );

      if (!chargeRows.length) {
        return res.status(404).json({ error: "charge_not_found" });
      }

      const charge = chargeRows[0];

      if (charge.status !== "captured") {
        return res.status(400).json({
          error: "charge_not_captured",
          current_status: charge.status,
        });
      }

      // Check refund amount
      if (Number(amount) > Number(charge.amount_captured)) {
        return res.status(400).json({
          error: "amount_exceeds_captured",
          max_refundable: charge.amount_captured,
        });
      }

      // Create refund
      const { rows: refundRows } = await pool.query(
        `INSERT INTO connect_refunds (
          charge_id, connect_account_id, amount, currency, reason, status
        ) VALUES ($1, $2, $3, $4, $5, 'pending')
        RETURNING *`,
        [charge_id, charge.connect_account_id, amount, charge.currency, reason || null]
      );

      const refund = refundRows[0];

      // Simulate immediate success (in prod, would call payment provider)
      await pool.query(
        `UPDATE connect_refunds SET status = 'succeeded', updated_at = now() WHERE id = $1`,
        [refund.id]
      );

      // Update charge status
      const isFullRefund = Number(amount) === Number(charge.amount_captured);
      const newStatus = isFullRefund ? "refunded" : "partially_refunded";

      await pool.query(
        `UPDATE connect_charges SET status = $1, updated_at = now() WHERE id = $2`,
        [newStatus, charge_id]
      );

      // Emit event
      await emitEvent(charge.connect_account_id, EventTypes.REFUND_SUCCEEDED, {
        refund_id: refund.id,
        charge_id,
        amount,
        full_refund: isFullRefund,
      });

      res.status(201).json({
        ...refund,
        status: "succeeded",
      });
    } catch (e: any) {
      console.error("[Refunds] Create error:", e);
      res.status(500).json({ error: "server_error", detail: e.message });
    }
  }
);

/**
 * GET /api/connect/refunds/:id
 * Get refund details
 */
refundsRouter.get(
  "/:id",
  requireRole(["merchant_admin", "merchant_finance", "pay_admin"]),
  async (req: any, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM connect_refunds WHERE id = $1`,
        [req.params.id]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "refund_not_found" });
      }

      res.json(rows[0]);
    } catch (e: any) {
      console.error("[Refunds] Get error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * GET /api/connect/refunds
 * List refunds for account
 */
refundsRouter.get(
  "/",
  requireRole(["merchant_admin", "merchant_finance", "pay_admin"]),
  async (req: any, res) => {
    try {
      const { connect_account_id, limit = 50, offset = 0 } = req.query;

      if (!connect_account_id) {
        return res.status(400).json({ error: "connect_account_id_required" });
      }

      const { rows } = await pool.query(
        `SELECT * FROM connect_refunds
         WHERE connect_account_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [connect_account_id, Math.min(Number(limit), 100), Number(offset)]
      );

      res.json({
        data: rows,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          count: rows.length,
        },
      });
    } catch (e: any) {
      console.error("[Refunds] List error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);
