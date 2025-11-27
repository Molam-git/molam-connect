/**
 * Brique 42 - Connect Payments
 * Webhooks API Routes
 */

import { Router } from "express";
import { pool } from "../db";
import crypto from "crypto";

export const webhooksRouter = Router();

// ============================================================================
// List Webhooks
// ============================================================================

webhooksRouter.get("/", async (req, res, next) => {
  try {
    const { connect_account_id } = req.query;

    if (!connect_account_id) {
      return res.status(400).json({
        error: "missing_parameter",
        message: "connect_account_id is required",
      });
    }

    try {
      const result = await pool.query(
        `SELECT
          id, connect_account_id, url, secret, enabled, events,
          description, api_version, created_at, updated_at, last_triggered_at
        FROM connect_webhooks
        WHERE connect_account_id = $1
        ORDER BY created_at DESC`,
        [connect_account_id]
      );

      res.json({
        webhooks: result.rows,
        count: result.rows.length,
      });
    } catch (dbErr: any) {
      // If table doesn't exist, return empty list
      console.warn("Database error (table may not exist):", dbErr.message);
      res.json({
        webhooks: [],
        count: 0,
      });
    }
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Get Single Webhook
// ============================================================================

webhooksRouter.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
        id, connect_account_id, url, secret, enabled, events,
        description, api_version, created_at, updated_at, last_triggered_at
      FROM connect_webhooks
      WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "webhook_not_found",
        message: "Webhook not found",
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Create Webhook
// ============================================================================

webhooksRouter.post("/", async (req, res, next) => {
  try {
    const { connect_account_id, url, description, events, enabled = true } = req.body;

    if (!connect_account_id || !url) {
      return res.status(400).json({
        error: "missing_parameters",
        message: "connect_account_id and url are required",
      });
    }

    // Generate a secure secret for webhook signatures
    const secret = `whsec_${crypto.randomBytes(32).toString("hex")}`;

    const result = await pool.query(
      `INSERT INTO connect_webhooks
        (connect_account_id, url, secret, description, events, enabled)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id, connect_account_id, url, secret, enabled, events,
        description, api_version, created_at, updated_at, last_triggered_at`,
      [
        connect_account_id,
        url,
        secret,
        description || null,
        events || [
          "payment.intent.created",
          "payment.charge.authorized",
          "payment.charge.captured",
          "payment.intent.canceled",
          "payment.refund.succeeded",
          "payment.refund.failed",
        ],
        enabled,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === "23503") {
      return res.status(400).json({
        error: "invalid_account",
        message: "Invalid connect_account_id",
      });
    }
    next(err);
  }
});

// ============================================================================
// Update Webhook
// ============================================================================

webhooksRouter.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { url, description, events, enabled } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (url !== undefined) {
      updates.push(`url = $${paramIndex++}`);
      values.push(url);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (events !== undefined) {
      updates.push(`events = $${paramIndex++}`);
      values.push(events);
    }
    if (enabled !== undefined) {
      updates.push(`enabled = $${paramIndex++}`);
      values.push(enabled);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: "no_updates",
        message: "No fields to update",
      });
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE connect_webhooks
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING
        id, connect_account_id, url, secret, enabled, events,
        description, api_version, created_at, updated_at, last_triggered_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "webhook_not_found",
        message: "Webhook not found",
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Delete Webhook
// ============================================================================

webhooksRouter.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM connect_webhooks WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "webhook_not_found",
        message: "Webhook not found",
      });
    }

    res.json({
      success: true,
      message: "Webhook deleted",
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Test Webhook (sends a test event)
// ============================================================================

webhooksRouter.post("/:id/test", async (req, res, next) => {
  try {
    const { id } = req.params;

    const webhookResult = await pool.query(
      `SELECT id, url, secret, enabled FROM connect_webhooks WHERE id = $1`,
      [id]
    );

    if (webhookResult.rows.length === 0) {
      return res.status(404).json({
        error: "webhook_not_found",
        message: "Webhook not found",
      });
    }

    const webhook = webhookResult.rows[0];

    if (!webhook.enabled) {
      return res.status(400).json({
        error: "webhook_disabled",
        message: "Cannot test disabled webhook",
      });
    }

    // Create test payload
    const testPayload = {
      id: `evt_test_${crypto.randomBytes(16).toString("hex")}`,
      type: "webhook.test",
      created: Math.floor(Date.now() / 1000),
      data: {
        message: "This is a test webhook event from Molam Connect",
      },
    };

    // Calculate HMAC signature
    const signature = crypto
      .createHmac("sha256", webhook.secret)
      .update(JSON.stringify(testPayload))
      .digest("hex");

    // Send test webhook (fire and forget)
    fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Molam-Signature": `sha256=${signature}`,
        "User-Agent": "Molam-Connect-Webhooks/1.0",
      },
      body: JSON.stringify(testPayload),
    }).catch((err) => {
      console.error("Test webhook delivery failed:", err);
    });

    res.json({
      success: true,
      message: "Test webhook sent",
      test_event_id: testPayload.id,
    });
  } catch (err) {
    next(err);
  }
});