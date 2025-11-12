/**
 * Brique 42 - Connect Payments
 * Payment Intents API routes
 */

import { Router } from "express";
import { pool } from "../db";
import crypto from "crypto";
import { emitEvent, EventTypes } from "../services/events";
import { scoreWithSira, shouldBlockTransaction } from "../services/sira";
import { requireRole } from "../rbac";

export const intentsRouter = Router();

/**
 * POST /api/connect/intents
 * Create a payment intent
 */
intentsRouter.post(
  "/",
  requireRole(["merchant_admin", "connect_platform", "pay_admin"]),
  async (req: any, res) => {
    try {
      const {
        connect_account_id,
        external_key,
        amount,
        currency,
        capture_method,
        description,
        metadata,
        customer_ref,
      } = req.body;

      // Validation
      if (!connect_account_id || !amount || !currency) {
        return res.status(400).json({
          error: "missing_required_fields",
          required: ["connect_account_id", "amount", "currency"],
        });
      }

      // Generate client secret
      const client_secret = crypto.randomBytes(24).toString("base64url");

      // Idempotency check
      if (external_key) {
        const { rows: existing } = await pool.query(
          `SELECT * FROM connect_payment_intents WHERE external_key = $1`,
          [external_key]
        );
        if (existing.length > 0) {
          return res.json(existing[0]);
        }
      }

      // Create intent
      const { rows } = await pool.query(
        `INSERT INTO connect_payment_intents (
          connect_account_id, external_key, amount, currency, capture_method,
          description, metadata, customer_ref, client_secret
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          connect_account_id,
          external_key || null,
          amount,
          currency,
          capture_method || "automatic",
          description || null,
          metadata || {},
          customer_ref || null,
          client_secret,
        ]
      );

      const intent = rows[0];

      // Emit event
      await emitEvent(connect_account_id, EventTypes.INTENT_CREATED, {
        intent_id: intent.id,
        amount,
        currency,
      });

      res.status(201).json(intent);
    } catch (e: any) {
      console.error("[Intents] Create error:", e);
      res.status(500).json({ error: "server_error", detail: e.message });
    }
  }
);

/**
 * POST /api/connect/intents/:id/confirm
 * Confirm and charge the intent
 */
intentsRouter.post(
  "/:id/confirm",
  requireRole(["merchant_admin", "connect_platform"]),
  async (req: any, res) => {
    try {
      const { payment_method } = req.body; // {type:'wallet'|'card'|'bank', details:{...}}
      const intentId = req.params.id;

      if (!payment_method || !payment_method.type) {
        return res.status(400).json({
          error: "missing_payment_method",
          required: "payment_method.type",
        });
      }

      // Get intent
      const { rows: intentRows } = await pool.query(
        `SELECT * FROM connect_payment_intents WHERE id = $1`,
        [intentId]
      );

      if (!intentRows.length) {
        return res.status(404).json({ error: "intent_not_found" });
      }

      const intent = intentRows[0];

      // Check status
      if (!["requires_confirmation", "processing"].includes(intent.status)) {
        return res.json({ intent, message: "already_processed" });
      }

      // Update to processing
      await pool.query(
        `UPDATE connect_payment_intents SET status = 'processing', updated_at = now() WHERE id = $1`,
        [intentId]
      );

      // Fraud/Risk scoring
      const siraScore = await scoreWithSira({
        amount: Number(intent.amount),
        method: payment_method.type,
        country: "N/A", // Should be from account or customer
      });

      // Block if too risky
      if (shouldBlockTransaction(siraScore.score)) {
        await pool.query(
          `UPDATE connect_payment_intents SET status = 'failed', updated_at = now() WHERE id = $1`,
          [intentId]
        );
        await emitEvent(intent.connect_account_id, EventTypes.INTENT_FAILED, {
          intent_id: intent.id,
          reason: "fraud_blocked",
          score: siraScore.score,
        });
        return res.status(403).json({
          error: "transaction_blocked",
          reason: "fraud_risk_too_high",
          score: siraScore.score,
        });
      }

      // Create charge
      const { rows: chargeRows } = await pool.query(
        `INSERT INTO connect_charges (
          intent_id, connect_account_id, method, amount_authorized, currency,
          status, fraud_score, risk_label, metadata
        ) VALUES ($1, $2, $3, $4, $5, 'authorized', $6, $7, $8)
        RETURNING *`,
        [
          intent.id,
          intent.connect_account_id,
          payment_method.type,
          intent.amount,
          intent.currency,
          siraScore.score,
          siraScore.label,
          payment_method.details || {},
        ]
      );

      const charge = chargeRows[0];

      // Auto-capture?
      if (intent.capture_method === "automatic") {
        const { rows: captured } = await pool.query(
          `UPDATE connect_charges
           SET status = 'captured', amount_captured = amount_authorized, updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [charge.id]
        );

        await pool.query(
          `UPDATE connect_payment_intents SET status = 'succeeded', updated_at = now() WHERE id = $1`,
          [intent.id]
        );

        await emitEvent(intent.connect_account_id, EventTypes.CHARGE_CAPTURED, {
          charge_id: charge.id,
          intent_id: intent.id,
          amount: intent.amount,
        });

        res.json({
          intent_status: "succeeded",
          charge: captured[0],
        });
      } else {
        // Manual capture required
        await pool.query(
          `UPDATE connect_payment_intents SET status = 'requires_capture', updated_at = now() WHERE id = $1`,
          [intent.id]
        );

        await emitEvent(intent.connect_account_id, EventTypes.CHARGE_AUTHORIZED, {
          charge_id: charge.id,
          intent_id: intent.id,
        });

        res.json({
          intent_status: "requires_capture",
          charge,
        });
      }
    } catch (e: any) {
      console.error("[Intents] Confirm error:", e);
      res.status(500).json({ error: "server_error", detail: e.message });
    }
  }
);

/**
 * POST /api/connect/intents/:id/capture
 * Manually capture an authorized charge
 */
intentsRouter.post(
  "/:id/capture",
  requireRole(["merchant_admin", "connect_platform"]),
  async (req: any, res) => {
    try {
      const intentId = req.params.id;

      // Get intent
      const { rows: intentRows } = await pool.query(
        `SELECT * FROM connect_payment_intents WHERE id = $1`,
        [intentId]
      );

      if (!intentRows.length) {
        return res.status(404).json({ error: "intent_not_found" });
      }

      const intent = intentRows[0];

      if (intent.status !== "requires_capture") {
        return res.status(400).json({
          error: "not_in_requires_capture",
          current_status: intent.status,
        });
      }

      // Capture the charge
      const { rows: chargeRows } = await pool.query(
        `UPDATE connect_charges
         SET status = 'captured', amount_captured = amount_authorized, updated_at = now()
         WHERE intent_id = $1
         RETURNING *`,
        [intentId]
      );

      if (!chargeRows.length) {
        return res.status(404).json({ error: "charge_not_found" });
      }

      // Update intent
      await pool.query(
        `UPDATE connect_payment_intents SET status = 'succeeded', updated_at = now() WHERE id = $1`,
        [intentId]
      );

      await emitEvent(intent.connect_account_id, EventTypes.CHARGE_CAPTURED, {
        intent_id: intent.id,
        charge_id: chargeRows[0].id,
      });

      res.json({
        ok: true,
        charge: chargeRows[0],
      });
    } catch (e: any) {
      console.error("[Intents] Capture error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * POST /api/connect/intents/:id/cancel
 * Cancel an intent
 */
intentsRouter.post(
  "/:id/cancel",
  requireRole(["merchant_admin", "connect_platform"]),
  async (req: any, res) => {
    try {
      const intentId = req.params.id;

      const { rows } = await pool.query(
        `UPDATE connect_payment_intents
         SET status = 'canceled', updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [intentId]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "intent_not_found" });
      }

      await emitEvent(rows[0].connect_account_id, EventTypes.INTENT_CANCELED, {
        intent_id: intentId,
      });

      res.json({ ok: true, intent: rows[0] });
    } catch (e: any) {
      console.error("[Intents] Cancel error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * GET /api/connect/intents/:id
 * Get intent details
 */
intentsRouter.get(
  "/:id",
  requireRole(["merchant_admin", "merchant_finance", "pay_admin"]),
  async (req: any, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM connect_payment_intents WHERE id = $1`,
        [req.params.id]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "intent_not_found" });
      }

      res.json(rows[0]);
    } catch (e: any) {
      console.error("[Intents] Get error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * GET /api/connect/intents
 * List intents for account
 */
intentsRouter.get(
  "/",
  requireRole(["merchant_admin", "merchant_finance", "pay_admin"]),
  async (req: any, res) => {
    try {
      const { connect_account_id, limit = 50, offset = 0 } = req.query;

      if (!connect_account_id) {
        return res.status(400).json({ error: "connect_account_id_required" });
      }

      const { rows } = await pool.query(
        `SELECT * FROM connect_payment_intents
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
      console.error("[Intents] List error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);
