// ============================================================================
// Brique 45 - Webhooks Industriels
// Ops API Routes (Retry Manual, Requeue DLQ, Monitoring)
// ============================================================================

import { Router, Request, Response } from "express";
import { pool } from "../utils/db";
import { requireRole } from "../utils/authz";

export const webhooksOpsRouter = Router();

// ============================================================================
// GET /api/ops/webhooks/deliveries - List deliveries (monitoring)
// ============================================================================
webhooksOpsRouter.get(
  "/deliveries",
  requireRole("pay_admin", "ops_webhooks", "auditor"),
  async (req: Request, res: Response) => {
    try {
      const { tenantType, tenantId, status, limit = 100 } = req.query;

      let query = `
        SELECT
          d.*,
          e.url,
          ev.type,
          ev.created_at as event_created_at
        FROM webhook_deliveries d
        JOIN webhook_endpoints e ON e.id=d.endpoint_id
        JOIN webhook_events ev ON ev.id=d.event_id
        WHERE 1=1
      `;

      const values: any[] = [];
      let paramIndex = 1;

      if (tenantType && tenantId) {
        query += ` AND ev.tenant_type=$${paramIndex} AND ev.tenant_id=$${paramIndex + 1}`;
        values.push(tenantType, tenantId);
        paramIndex += 2;
      }

      if (status) {
        query += ` AND d.status=$${paramIndex}`;
        values.push(status);
        paramIndex++;
      }

      query += ` ORDER BY d.updated_at DESC LIMIT $${paramIndex}`;
      values.push(limit);

      const { rows } = await pool.query(query, values);

      res.status(200).json(rows);
    } catch (error: any) {
      console.error("List deliveries error:", error);
      res.status(500).json({ error: "list_deliveries_failed", details: error.message });
    }
  }
);

// ============================================================================
// GET /api/ops/webhooks/deliveries/:id - Get delivery details
// ============================================================================
webhooksOpsRouter.get(
  "/deliveries/:id",
  requireRole("pay_admin", "ops_webhooks", "auditor"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const { rows: [delivery] } = await pool.query(
        `SELECT
          d.*,
          e.url,
          e.status as endpoint_status,
          ev.type,
          ev.data as event_data,
          ev.created_at as event_created_at
         FROM webhook_deliveries d
         JOIN webhook_endpoints e ON e.id=d.endpoint_id
         JOIN webhook_events ev ON ev.id=d.event_id
         WHERE d.id=$1`,
        [id]
      );

      if (!delivery) {
        res.status(404).json({ error: "delivery_not_found" });
        return;
      }

      // Get attempts history
      const { rows: attempts } = await pool.query(
        `SELECT * FROM webhook_delivery_attempts
         WHERE delivery_id=$1 ORDER BY attempted_at ASC`,
        [id]
      );

      res.status(200).json({ ...delivery, attempts });
    } catch (error: any) {
      console.error("Get delivery error:", error);
      res.status(500).json({ error: "get_delivery_failed", details: error.message });
    }
  }
);

// ============================================================================
// POST /api/ops/webhooks/deliveries/:id/retry - Manual retry
// ============================================================================
webhooksOpsRouter.post(
  "/deliveries/:id/retry",
  requireRole("pay_admin", "ops_webhooks"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const { rows: [delivery] } = await pool.query(
        `UPDATE webhook_deliveries
         SET status='failed', next_attempt_at=now(), updated_at=now()
         WHERE id=$1
         RETURNING *`,
        [id]
      );

      if (!delivery) {
        res.status(404).json({ error: "delivery_not_found" });
        return;
      }

      res.status(200).json({
        ok: true,
        message: "Delivery scheduled for immediate retry",
        delivery,
      });
    } catch (error: any) {
      console.error("Retry delivery error:", error);
      res.status(500).json({ error: "retry_delivery_failed", details: error.message });
    }
  }
);

// ============================================================================
// POST /api/ops/webhooks/deliveries/:id/requeue - Requeue from DLQ
// ============================================================================
webhooksOpsRouter.post(
  "/deliveries/:id/requeue",
  requireRole("pay_admin", "ops_webhooks"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        // Remove from DLQ
        await client.query(`DELETE FROM webhook_deadletters WHERE delivery_id=$1`, [id]);

        // Reset delivery status
        const { rows: [delivery] } = await client.query(
          `UPDATE webhook_deliveries
           SET status='failed', attempts=0, next_attempt_at=now(), updated_at=now()
           WHERE id=$1
           RETURNING *`,
          [id]
        );

        if (!delivery) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "delivery_not_found" });
          return;
        }

        await client.query("COMMIT");

        res.status(200).json({
          ok: true,
          message: "Delivery removed from DLQ and scheduled for retry",
          delivery,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error("Requeue delivery error:", error);
      res.status(500).json({ error: "requeue_delivery_failed", details: error.message });
    }
  }
);

// ============================================================================
// GET /api/ops/webhooks/deadletters - List DLQ entries
// ============================================================================
webhooksOpsRouter.get(
  "/deadletters",
  requireRole("pay_admin", "ops_webhooks", "auditor"),
  async (req: Request, res: Response) => {
    try {
      const { limit = 100 } = req.query;

      const { rows } = await pool.query(
        `SELECT
          dl.*,
          d.status as delivery_status,
          e.url,
          ev.type,
          ev.tenant_type,
          ev.tenant_id
         FROM webhook_deadletters dl
         JOIN webhook_deliveries d ON d.id=dl.delivery_id
         JOIN webhook_endpoints e ON e.id=dl.endpoint_id
         JOIN webhook_events ev ON ev.id=dl.event_id
         ORDER BY dl.created_at DESC
         LIMIT $1`,
        [limit]
      );

      res.status(200).json(rows);
    } catch (error: any) {
      console.error("List deadletters error:", error);
      res.status(500).json({ error: "list_deadletters_failed", details: error.message });
    }
  }
);

// ============================================================================
// GET /api/ops/webhooks/stats - Dashboard statistics
// ============================================================================
webhooksOpsRouter.get(
  "/stats",
  requireRole("pay_admin", "ops_webhooks", "auditor"),
  async (req: Request, res: Response) => {
    try {
      const { tenantType, tenantId } = req.query;

      let whereClause = "WHERE 1=1";
      const values: any[] = [];
      let paramIndex = 1;

      if (tenantType && tenantId) {
        whereClause += ` AND ev.tenant_type=$${paramIndex} AND ev.tenant_id=$${paramIndex + 1}`;
        values.push(tenantType, tenantId);
        paramIndex += 2;
      }

      const { rows: [stats] } = await pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE d.status='pending') as pending,
          COUNT(*) FILTER (WHERE d.status='delivering') as delivering,
          COUNT(*) FILTER (WHERE d.status='succeeded') as succeeded,
          COUNT(*) FILTER (WHERE d.status='failed') as failed,
          COUNT(*) FILTER (WHERE d.status='quarantined') as quarantined,
          AVG(CASE WHEN d.status='succeeded' THEN d.attempts END) as avg_attempts_success,
          COUNT(DISTINCT d.endpoint_id) as active_endpoints,
          COUNT(DISTINCT ev.type) as event_types
         FROM webhook_deliveries d
         JOIN webhook_events ev ON ev.id=d.event_id
         ${whereClause}
         AND d.created_at >= now() - interval '24 hours'`,
        values
      );

      const { rows: [dlqStats] } = await pool.query(
        `SELECT COUNT(*) as dlq_count FROM webhook_deadletters
         WHERE created_at >= now() - interval '24 hours'`
      );

      res.status(200).json({
        ...stats,
        dlq_count: dlqStats.dlq_count,
        success_rate:
          Number(stats.succeeded) > 0
            ? ((Number(stats.succeeded) / (Number(stats.succeeded) + Number(stats.failed) + Number(stats.quarantined))) * 100).toFixed(2)
            : "0.00",
      });
    } catch (error: any) {
      console.error("Get stats error:", error);
      res.status(500).json({ error: "get_stats_failed", details: error.message });
    }
  }
);

// ============================================================================
// GET /api/ops/webhooks/events - List recent events
// ============================================================================
webhooksOpsRouter.get(
  "/events",
  requireRole("pay_admin", "ops_webhooks", "auditor"),
  async (req: Request, res: Response) => {
    try {
      const { tenantType, tenantId, type, limit = 100 } = req.query;

      let query = `SELECT * FROM webhook_events WHERE 1=1`;
      const values: any[] = [];
      let paramIndex = 1;

      if (tenantType) {
        query += ` AND tenant_type=$${paramIndex}`;
        values.push(tenantType);
        paramIndex++;
      }

      if (tenantId) {
        query += ` AND tenant_id=$${paramIndex}`;
        values.push(tenantId);
        paramIndex++;
      }

      if (type) {
        query += ` AND type=$${paramIndex}`;
        values.push(type);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
      values.push(limit);

      const { rows } = await pool.query(query, values);

      res.status(200).json(rows);
    } catch (error: any) {
      console.error("List events error:", error);
      res.status(500).json({ error: "list_events_failed", details: error.message });
    }
  }
);
