// ============================================================================
// Brique 45 - Webhooks Industriels
// Administration API Routes
// ============================================================================

import { Router, Request, Response } from "express";
import { pool } from "../utils/db";
import { requireRole } from "../utils/authz";
import { generateSecret, encryptSecret, rotateSecret } from "./secrets";

export const webhooksRouter = Router();

// ============================================================================
// POST /api/webhooks/endpoints - Create endpoint
// ============================================================================
webhooksRouter.post(
  "/endpoints",
  requireRole("merchant_admin", "pay_admin"),
  async (req: Request, res: Response) => {
    try {
      const { tenantType, tenantId, url, description, region, apiVersion, events } = req.body;

      // Validate required fields
      if (!tenantType || !tenantId || !url) {
        res.status(400).json({
          error: "missing_required_fields",
          required: ["tenantType", "tenantId", "url"],
        });
        return;
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        // Create endpoint
        const { rows: [endpoint] } = await client.query(
          `INSERT INTO webhook_endpoints(tenant_type, tenant_id, url, description, region, api_version, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [tenantType, tenantId, url, description, region, apiVersion || "2025-01", req.user?.id]
        );

        // Generate initial secret (version 1)
        const secret = generateSecret();
        await client.query(
          `INSERT INTO webhook_secrets(endpoint_id, version, status, secret_ciphertext)
           VALUES ($1,1,'active',$2)`,
          [endpoint.id, await encryptSecret(secret)]
        );

        // Subscribe to events
        if (Array.isArray(events) && events.length > 0) {
          const values = events.map((e, i) => `($1,$${i + 2})`).join(",");
          await client.query(
            `INSERT INTO webhook_subscriptions(endpoint_id,event_type) VALUES ${values}`,
            [endpoint.id, ...events]
          );
        }

        await client.query("COMMIT");

        res.status(201).json({
          endpoint,
          secret_preview: secret.slice(0, 6) + "… (copy once - will not be shown again)",
          secret_full: secret, // Only returned on creation
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error("Create endpoint error:", error);
      res.status(500).json({ error: "create_endpoint_failed", details: error.message });
    }
  }
);

// ============================================================================
// GET /api/webhooks/endpoints - List endpoints
// ============================================================================
webhooksRouter.get(
  "/endpoints",
  requireRole("merchant_admin", "pay_admin", "auditor"),
  async (req: Request, res: Response) => {
    try {
      const { tenantType, tenantId } = req.query;

      if (!tenantType || !tenantId) {
        res.status(400).json({
          error: "missing_required_params",
          required: ["tenantType", "tenantId"],
        });
        return;
      }

      const { rows } = await pool.query(
        `SELECT e.*, array_agg(s.event_type) AS events
         FROM webhook_endpoints e
         LEFT JOIN webhook_subscriptions s ON s.endpoint_id=e.id
         WHERE e.tenant_type=$1 AND e.tenant_id=$2
         GROUP BY e.id
         ORDER BY e.created_at DESC`,
        [tenantType, tenantId]
      );

      res.status(200).json(rows);
    } catch (error: any) {
      console.error("List endpoints error:", error);
      res.status(500).json({ error: "list_endpoints_failed", details: error.message });
    }
  }
);

// ============================================================================
// GET /api/webhooks/endpoints/:id - Get endpoint details
// ============================================================================
webhooksRouter.get(
  "/endpoints/:id",
  requireRole("merchant_admin", "pay_admin", "auditor"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const { rows: [endpoint] } = await pool.query(
        `SELECT e.*, array_agg(s.event_type) AS events
         FROM webhook_endpoints e
         LEFT JOIN webhook_subscriptions s ON s.endpoint_id=e.id
         WHERE e.id=$1
         GROUP BY e.id`,
        [id]
      );

      if (!endpoint) {
        res.status(404).json({ error: "endpoint_not_found" });
        return;
      }

      // Get secret versions (without revealing secrets)
      const { rows: secrets } = await pool.query(
        `SELECT version, status, created_at FROM webhook_secrets
         WHERE endpoint_id=$1 ORDER BY version DESC`,
        [id]
      );

      res.status(200).json({ ...endpoint, secrets });
    } catch (error: any) {
      console.error("Get endpoint error:", error);
      res.status(500).json({ error: "get_endpoint_failed", details: error.message });
    }
  }
);

// ============================================================================
// POST /api/webhooks/endpoints/:id/rotate - Rotate secret (grace period)
// ============================================================================
webhooksRouter.post(
  "/endpoints/:id/rotate",
  requireRole("merchant_admin", "pay_admin"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Verify endpoint exists
      const { rows: [endpoint] } = await pool.query(
        `SELECT * FROM webhook_endpoints WHERE id=$1`,
        [id]
      );

      if (!endpoint) {
        res.status(404).json({ error: "endpoint_not_found" });
        return;
      }

      // Rotate secret
      const { kid, secret } = await rotateSecret(id);

      res.status(200).json({
        kid,
        secret_preview: secret.slice(0, 6) + "… (copy once - will not be shown again)",
        secret_full: secret, // Only returned on rotation
        message: "Previous secret marked as 'retiring' and remains valid during grace period",
      });
    } catch (error: any) {
      console.error("Rotate secret error:", error);
      res.status(500).json({ error: "rotate_secret_failed", details: error.message });
    }
  }
);

// ============================================================================
// POST /api/webhooks/endpoints/:id/status - Pause/Activate/Disable endpoint
// ============================================================================
webhooksRouter.post(
  "/endpoints/:id/status",
  requireRole("merchant_admin", "pay_admin"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      // Validate status
      if (!["active", "paused", "disabled"].includes(status)) {
        res.status(400).json({
          error: "invalid_status",
          allowed: ["active", "paused", "disabled"],
        });
        return;
      }

      const { rows: [endpoint] } = await pool.query(
        `UPDATE webhook_endpoints SET status=$2, updated_at=now() WHERE id=$1 RETURNING *`,
        [id, status]
      );

      if (!endpoint) {
        res.status(404).json({ error: "endpoint_not_found" });
        return;
      }

      res.status(200).json({ ok: true, endpoint });
    } catch (error: any) {
      console.error("Update status error:", error);
      res.status(500).json({ error: "update_status_failed", details: error.message });
    }
  }
);

// ============================================================================
// PUT /api/webhooks/endpoints/:id/subscriptions - Update event subscriptions
// ============================================================================
webhooksRouter.put(
  "/endpoints/:id/subscriptions",
  requireRole("merchant_admin", "pay_admin"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { events } = req.body;

      if (!Array.isArray(events)) {
        res.status(400).json({ error: "events_must_be_array" });
        return;
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        // Delete existing subscriptions
        await client.query(`DELETE FROM webhook_subscriptions WHERE endpoint_id=$1`, [id]);

        // Add new subscriptions
        if (events.length > 0) {
          const values = events.map((e, i) => `($1,$${i + 2})`).join(",");
          await client.query(
            `INSERT INTO webhook_subscriptions(endpoint_id,event_type) VALUES ${values}`,
            [id, ...events]
          );
        }

        await client.query("COMMIT");

        res.status(200).json({ ok: true, events });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error("Update subscriptions error:", error);
      res.status(500).json({ error: "update_subscriptions_failed", details: error.message });
    }
  }
);

// ============================================================================
// DELETE /api/webhooks/endpoints/:id - Delete endpoint
// ============================================================================
webhooksRouter.delete(
  "/endpoints/:id",
  requireRole("merchant_admin", "pay_admin"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const { rows: [endpoint] } = await pool.query(
        `DELETE FROM webhook_endpoints WHERE id=$1 RETURNING *`,
        [id]
      );

      if (!endpoint) {
        res.status(404).json({ error: "endpoint_not_found" });
        return;
      }

      res.status(200).json({ ok: true, deleted: endpoint });
    } catch (error: any) {
      console.error("Delete endpoint error:", error);
      res.status(500).json({ error: "delete_endpoint_failed", details: error.message });
    }
  }
);
