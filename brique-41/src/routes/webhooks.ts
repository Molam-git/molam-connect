/**
 * Brique 41 - Molam Connect
 * Webhooks API routes
 */

import { Router } from "express";
import { pool } from "../db";
import { requireRole, scopeMerchant } from "../rbac";
import { audit, AuditActions } from "../utils/audit";
import { isValidUrl, isValidWebhookEvent, validateRequired } from "../utils/validate";
import { verifySignature } from "../services/events";
import crypto from "crypto";

export const webhooksRouter = Router({ mergeParams: true });

/**
 * POST /api/connect/accounts/:id/webhooks
 * Create webhook endpoint
 */
webhooksRouter.post(
  "/",
  requireRole(["merchant_admin", "pay_admin"]),
  scopeMerchant,
  async (req: any, res) => {
    try {
      const user = req.user;
      const connectAccountId = req.params.id;
      const { url, events, enabled } = req.body;

      // Validation
      const validation = validateRequired(req.body, ["url"]);

      if (!validation.valid) {
        return res.status(400).json({
          error: "missing_required_fields",
          missing: validation.missing,
        });
      }

      if (!isValidUrl(url)) {
        return res.status(400).json({ error: "invalid_url" });
      }

      if (events && events.length > 0) {
        for (const event of events) {
          if (!isValidWebhookEvent(event)) {
            return res.status(400).json({
              error: "invalid_event",
              event,
            });
          }
        }
      }

      // Generate webhook secret
      const secret = crypto.randomBytes(32).toString("hex");

      const { rows } = await pool.query(
        `INSERT INTO connect_webhooks (
          connect_account_id, url, secret, enabled, events
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
        [
          connectAccountId,
          url,
          secret,
          enabled !== undefined ? enabled : true,
          events || [
            "payment.succeeded",
            "payment.failed",
            "payout.sent",
            "payout.settled",
          ],
        ]
      );

      await audit(connectAccountId, user.id, AuditActions.WEBHOOK_CREATED, { url });

      res.status(201).json(rows[0]);
    } catch (e: any) {
      console.error("[Webhooks] Create error:", e);
      res.status(500).json({ error: "server_error", detail: e.message });
    }
  }
);

/**
 * GET /api/connect/accounts/:id/webhooks
 * List webhooks for account
 */
webhooksRouter.get(
  "/",
  requireRole(["merchant_admin", "pay_admin"]),
  scopeMerchant,
  async (req: any, res) => {
    try {
      const connectAccountId = req.params.id;

      const { rows } = await pool.query(
        `SELECT * FROM connect_webhooks
         WHERE connect_account_id = $1
         ORDER BY created_at DESC`,
        [connectAccountId]
      );

      res.json(rows);
    } catch (e: any) {
      console.error("[Webhooks] List error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * GET /api/connect/accounts/:id/webhooks/:webhookId
 * Get specific webhook
 */
webhooksRouter.get(
  "/:webhookId",
  requireRole(["merchant_admin", "pay_admin"]),
  scopeMerchant,
  async (req: any, res) => {
    try {
      const { id: connectAccountId, webhookId } = req.params;

      const { rows } = await pool.query(
        `SELECT * FROM connect_webhooks
         WHERE id = $1 AND connect_account_id = $2`,
        [webhookId, connectAccountId]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "not_found" });
      }

      res.json(rows[0]);
    } catch (e: any) {
      console.error("[Webhooks] Get error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * PATCH /api/connect/accounts/:id/webhooks/:webhookId
 * Update webhook
 */
webhooksRouter.patch(
  "/:webhookId",
  requireRole(["merchant_admin", "pay_admin"]),
  scopeMerchant,
  async (req: any, res) => {
    try {
      const user = req.user;
      const { id: connectAccountId, webhookId } = req.params;
      const { url, events, enabled } = req.body;

      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (url) {
        if (!isValidUrl(url)) {
          return res.status(400).json({ error: "invalid_url" });
        }
        updates.push(`url = $${paramIndex++}`);
        values.push(url);
      }

      if (events) {
        for (const event of events) {
          if (!isValidWebhookEvent(event)) {
            return res.status(400).json({ error: "invalid_event", event });
          }
        }
        updates.push(`events = $${paramIndex++}`);
        values.push(events);
      }

      if (enabled !== undefined) {
        updates.push(`enabled = $${paramIndex++}`);
        values.push(enabled);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "no_fields_to_update" });
      }

      updates.push(`updated_at = now()`);
      values.push(webhookId, connectAccountId);

      const { rows } = await pool.query(
        `UPDATE connect_webhooks
         SET ${updates.join(", ")}
         WHERE id = $${paramIndex} AND connect_account_id = $${paramIndex + 1}
         RETURNING *`,
        values
      );

      if (!rows.length) {
        return res.status(404).json({ error: "not_found" });
      }

      await audit(connectAccountId, user.id, AuditActions.WEBHOOK_UPDATED, req.body);

      res.json(rows[0]);
    } catch (e: any) {
      console.error("[Webhooks] Update error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * DELETE /api/connect/accounts/:id/webhooks/:webhookId
 * Delete webhook
 */
webhooksRouter.delete(
  "/:webhookId",
  requireRole(["merchant_admin", "pay_admin"]),
  scopeMerchant,
  async (req: any, res) => {
    try {
      const user = req.user;
      const { id: connectAccountId, webhookId } = req.params;

      const { rows } = await pool.query(
        `DELETE FROM connect_webhooks
         WHERE id = $1 AND connect_account_id = $2
         RETURNING *`,
        [webhookId, connectAccountId]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "not_found" });
      }

      await audit(connectAccountId, user.id, AuditActions.WEBHOOK_DELETED, {
        webhook_id: webhookId,
      });

      res.json({ success: true, deleted: rows[0] });
    } catch (e: any) {
      console.error("[Webhooks] Delete error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * POST /api/connect/accounts/:id/webhooks/:webhookId/rotate_secret
 * Rotate webhook secret
 */
webhooksRouter.post(
  "/:webhookId/rotate_secret",
  requireRole(["merchant_admin", "pay_admin"]),
  scopeMerchant,
  async (req: any, res) => {
    try {
      const user = req.user;
      const { id: connectAccountId, webhookId } = req.params;

      // Generate new secret
      const newSecret = crypto.randomBytes(32).toString("hex");

      const { rows } = await pool.query(
        `UPDATE connect_webhooks
         SET secret = $1, updated_at = now()
         WHERE id = $2 AND connect_account_id = $3
         RETURNING *`,
        [newSecret, webhookId, connectAccountId]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "not_found" });
      }

      await audit(connectAccountId, user.id, "webhook.secret_rotated", {
        webhook_id: webhookId,
      });

      res.json(rows[0]);
    } catch (e: any) {
      console.error("[Webhooks] Rotate secret error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * POST /api/connect/accounts/:id/webhooks/:webhookId/test
 * Send test webhook
 */
webhooksRouter.post(
  "/:webhookId/test",
  requireRole(["merchant_admin", "pay_admin"]),
  scopeMerchant,
  async (req: any, res) => {
    try {
      const { id: connectAccountId, webhookId } = req.params;

      // Get webhook
      const { rows } = await pool.query(
        `SELECT * FROM connect_webhooks
         WHERE id = $1 AND connect_account_id = $2`,
        [webhookId, connectAccountId]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "not_found" });
      }

      const webhook = rows[0];

      // Send test event
      const testEvent = {
        type: "webhook.test",
        account_id: connectAccountId,
        data: {
          message: "This is a test webhook from Molam Connect",
          timestamp: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
      };

      const body = JSON.stringify(testEvent);
      const signature = crypto
        .createHmac("sha256", webhook.secret)
        .update(body)
        .digest("hex");

      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Molam-Signature": signature,
          "X-Molam-Event": "webhook.test",
        },
        body,
      });

      res.json({
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
      });
    } catch (e: any) {
      console.error("[Webhooks] Test error:", e);
      res.status(500).json({ error: "server_error", detail: e.message });
    }
  }
);
