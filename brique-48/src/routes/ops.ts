/**
 * Brique 48 - Ops Routes
 * Risk operations and rule management
 */

import { Router, Request, Response } from "express";
import { pool } from "../utils/db.js";
import { requireRole } from "../utils/authz.js";

const router = Router();

/**
 * GET /api/ops/radar/rules
 * List all risk rules
 */
router.get("/rules", requireRole("risk_ops", "pay_admin"), async (req: Request, res: Response) => {
  try {
    const { status } = req.query;

    let query = `SELECT * FROM risk_rules WHERE 1=1`;
    const params: any[] = [];

    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY priority ASC`;

    const { rows } = await pool.query(query, params);

    res.json({ data: rows });
  } catch (err: any) {
    console.error("Error fetching rules:", err);
    res.status(500).json({ error: { message: "Failed to fetch rules", type: "database_error" } });
  }
});

/**
 * POST /api/ops/radar/rules
 * Create a new risk rule
 */
router.post("/rules", requireRole("risk_ops"), async (req: Request, res: Response) => {
  try {
    const { name, description, expression, priority, scope } = req.body;

    if (!name || !expression) {
      return res.status(400).json({ error: { message: "Missing required fields", type: "validation_error" } });
    }

    const { rows: [rule] } = await pool.query(
      `INSERT INTO risk_rules(name, description, expression, priority, scope, status, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, 'active', $6, now())
       RETURNING *`,
      [name, description, expression, priority || 100, scope || "all", req.user?.id]
    );

    res.status(201).json(rule);
  } catch (err: any) {
    console.error("Error creating rule:", err);
    if (err.code === "23505") {
      res.status(409).json({ error: { message: "Rule name already exists", type: "conflict" } });
    } else {
      res.status(500).json({ error: { message: "Failed to create rule", type: "database_error" } });
    }
  }
});

/**
 * PUT /api/ops/radar/rules/:id
 * Update a risk rule
 */
router.put("/rules/:id", requireRole("risk_ops"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, expression, priority, status, scope } = req.body;

    const { rows: [rule] } = await pool.query(
      `UPDATE risk_rules
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           expression = COALESCE($4, expression),
           priority = COALESCE($5, priority),
           status = COALESCE($6, status),
           scope = COALESCE($7, scope),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, name, description, expression, priority, status, scope]
    );

    if (!rule) {
      return res.status(404).json({ error: { message: "Rule not found", type: "not_found" } });
    }

    res.json(rule);
  } catch (err: any) {
    console.error("Error updating rule:", err);
    res.status(500).json({ error: { message: "Failed to update rule", type: "database_error" } });
  }
});

/**
 * DELETE /api/ops/radar/rules/:id
 * Delete a risk rule
 */
router.delete("/rules/:id", requireRole("risk_ops"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { rowCount } = await pool.query(`DELETE FROM risk_rules WHERE id = $1`, [id]);

    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Rule not found", type: "not_found" } });
    }

    res.json({ message: "Rule deleted" });
  } catch (err: any) {
    console.error("Error deleting rule:", err);
    res.status(500).json({ error: { message: "Failed to delete rule", type: "database_error" } });
  }
});

/**
 * GET /api/ops/radar/alerts
 * List risk alerts
 */
router.get("/alerts", requireRole("risk_ops", "pay_admin"), async (req: Request, res: Response) => {
  try {
    const { severity, status, limit = 50, offset = 0 } = req.query;

    let query = `SELECT a.*, d.transaction_id, d.merchant_id, d.amount, d.currency
                 FROM risk_alerts a
                 JOIN risk_decisions d ON a.decision_id = d.id
                 WHERE 1=1`;
    const params: any[] = [];

    if (severity) {
      query += ` AND a.severity = $${params.length + 1}`;
      params.push(severity);
    }

    if (status) {
      query += ` AND a.status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY a.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    res.json({ data: rows });
  } catch (err: any) {
    console.error("Error fetching alerts:", err);
    res.status(500).json({ error: { message: "Failed to fetch alerts", type: "database_error" } });
  }
});

/**
 * POST /api/ops/radar/alerts/:id/acknowledge
 * Acknowledge an alert
 */
router.post("/alerts/:id/acknowledge", requireRole("risk_ops", "pay_admin"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { rows: [alert] } = await pool.query(
      `UPDATE risk_alerts SET status='acknowledged', acknowledged_at=now(), acknowledged_by=$2 WHERE id=$1 RETURNING *`,
      [id, req.user?.id]
    );

    if (!alert) {
      return res.status(404).json({ error: { message: "Alert not found", type: "not_found" } });
    }

    res.json(alert);
  } catch (err: any) {
    console.error("Error acknowledging alert:", err);
    res.status(500).json({ error: { message: "Failed to acknowledge alert", type: "database_error" } });
  }
});

/**
 * POST /api/ops/radar/alerts/:id/resolve
 * Resolve an alert
 */
router.post("/alerts/:id/resolve", requireRole("risk_ops", "pay_admin"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { resolution_note } = req.body;

    const { rows: [alert] } = await pool.query(
      `UPDATE risk_alerts SET status='resolved', resolved_at=now(), resolved_by=$2, resolution_note=$3 WHERE id=$1 RETURNING *`,
      [id, req.user?.id, resolution_note]
    );

    if (!alert) {
      return res.status(404).json({ error: { message: "Alert not found", type: "not_found" } });
    }

    res.json(alert);
  } catch (err: any) {
    console.error("Error resolving alert:", err);
    res.status(500).json({ error: { message: "Failed to resolve alert", type: "database_error" } });
  }
});

/**
 * GET /api/ops/radar/stats
 * Get radar statistics
 */
router.get("/stats", requireRole("risk_ops", "pay_admin"), async (req: Request, res: Response) => {
  try {
    const { rows: [decisionStats] } = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE decision='allow') as allowed_count,
        COUNT(*) FILTER (WHERE decision='review') as reviewed_count,
        COUNT(*) FILTER (WHERE decision='block') as blocked_count,
        AVG(ml_score) as avg_ml_score,
        AVG(processing_time_ms) as avg_processing_time_ms
      FROM risk_decisions
      WHERE created_at >= now() - interval '24 hours'
    `);

    const { rows: [alertStats] } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE severity='critical') as critical_count,
        COUNT(*) FILTER (WHERE severity='high') as high_count,
        COUNT(*) FILTER (WHERE severity='medium') as medium_count,
        COUNT(*) FILTER (WHERE status='open') as open_count,
        COUNT(*) FILTER (WHERE status='acknowledged') as acknowledged_count
      FROM risk_alerts
      WHERE created_at >= now() - interval '24 hours'
    `);

    const { rows: [ruleStats] } = await pool.query(`
      SELECT
        COUNT(*) as total_rules,
        COUNT(*) FILTER (WHERE status='active') as active_rules,
        COUNT(*) FILTER (WHERE status='disabled') as disabled_rules
      FROM risk_rules
    `);

    res.json({
      decisions: decisionStats,
      alerts: alertStats,
      rules: ruleStats,
    });
  } catch (err: any) {
    console.error("Error fetching stats:", err);
    res.status(500).json({ error: { message: "Failed to fetch stats", type: "database_error" } });
  }
});

export default router;
