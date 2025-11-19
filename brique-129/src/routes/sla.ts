// ============================================================================
// SLA Alerts API Routes
// ============================================================================

import { Router } from "express";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const slaRouter = Router();

/**
 * GET /api/sla/alerts - List alerts
 */
slaRouter.get("/alerts", async (req: any, res) => {
  const status = req.query.status || "open";
  const limit = Number(req.query.limit) || 50;

  try {
    const { rows } = await pool.query(
      `SELECT a.*, p.metric, p.rail, bp.name as bank_name
       FROM settlement_sla_alerts a
       JOIN settlement_sla_policies p ON p.id = a.sla_policy_id
       LEFT JOIN bank_profiles bp ON bp.id = a.bank_profile_id
       WHERE a.status = $1
       ORDER BY a.created_at DESC
       LIMIT $2`,
      [status, limit]
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/sla/alerts/:id - Get alert details
 */
slaRouter.get("/alerts/:id", async (req: any, res) => {
  const { id } = req.params;

  try {
    const { rows: [alert] } = await pool.query(
      `SELECT a.*, p.metric, p.rail, bp.name as bank_name
       FROM settlement_sla_alerts a
       JOIN settlement_sla_policies p ON p.id = a.sla_policy_id
       LEFT JOIN bank_profiles bp ON bp.id = a.bank_profile_id
       WHERE a.id = $1`,
      [id]
    );

    if (!alert) {
      return res.status(404).json({ error: "alert_not_found" });
    }

    res.json(alert);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/sla/alerts/:id/ack - Acknowledge alert
 */
slaRouter.post("/alerts/:id/ack", async (req: any, res) => {
  const { id } = req.params;
  const userId = req.user?.id || "system";

  try {
    const { rows: [alert] } = await pool.query(
      `UPDATE settlement_sla_alerts
       SET status='acknowledged', acknowledged_by=$2, acknowledged_at=now()
       WHERE id=$1 RETURNING *`,
      [id, userId]
    );

    res.json(alert);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/sla/alerts/:id/resolve - Resolve alert
 */
slaRouter.post("/alerts/:id/resolve", async (req: any, res) => {
  const { id } = req.params;
  const userId = req.user?.id || "system";

  try {
    const { rows: [alert] } = await pool.query(
      `UPDATE settlement_sla_alerts
       SET status='resolved', resolved_by=$2, resolved_at=now()
       WHERE id=$1 RETURNING *`,
      [id, userId]
    );

    res.json(alert);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/sla/policies - List SLA policies
 */
slaRouter.get("/policies", async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, bp.name as bank_name
       FROM settlement_sla_policies p
       LEFT JOIN bank_profiles bp ON bp.id = p.bank_profile_id
       ORDER BY p.created_at DESC`
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/sla/policies - Create SLA policy
 */
slaRouter.post("/policies", async (req: any, res) => {
  const { bank_profile_id, rail, country, currency, metric, threshold, operator, severity } = req.body;

  try {
    const { rows: [policy] } = await pool.query(
      `INSERT INTO settlement_sla_policies(
        bank_profile_id, rail, country, currency, metric, threshold, operator, severity
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [bank_profile_id, rail, country, currency, metric, threshold, operator, severity]
    );

    res.json(policy);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * PUT /api/sla/policies/:id - Update SLA policy
 */
slaRouter.put("/policies/:id", async (req: any, res) => {
  const { id } = req.params;
  const { threshold, enabled } = req.body;

  try {
    const { rows: [policy] } = await pool.query(
      `UPDATE settlement_sla_policies
       SET threshold=$2, enabled=$3, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [id, threshold, enabled]
    );

    res.json(policy);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/sla/stats - Get SLA statistics
 */
slaRouter.get("/stats", async (req: any, res) => {
  try {
    const { rows: [stats] } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='open') as open_alerts,
        COUNT(*) FILTER (WHERE status='acknowledged') as acknowledged_alerts,
        COUNT(*) FILTER (WHERE status='resolved') as resolved_alerts,
        COUNT(*) FILTER (WHERE severity='critical') as critical_alerts,
        COUNT(*) FILTER (WHERE severity='warning') as warning_alerts
      FROM settlement_sla_alerts
      WHERE created_at > now() - interval '24 hours'
    `);

    res.json(stats);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
