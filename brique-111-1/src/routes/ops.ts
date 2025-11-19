/**
 * Brique 111-1 - Self-Healing Plugins (SIRA)
 * Ops API Routes: Incidents, approvals, manual actions
 */

import { Router, Request, Response } from "express";
import { pool } from "../db";
import { auth } from "../auth";
import { requireRole } from "../rbac";
import { logAudit, getAuditContext } from "../utils/audit";

const router = Router();

// All routes require Ops role
router.use(auth);
router.use(requireRole(["pay_admin", "compliance_ops"]));

/**
 * GET /api/ops/plugin-incidents
 * List all plugin incidents
 */
router.get("/plugin-incidents", async (req: Request, res: Response) => {
  try {
    const { status, severity, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT * FROM plugin_incidents_stats
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    if (severity) {
      query += ` AND severity = $${paramIndex++}`;
      params.push(severity);
    }

    query += ` ORDER BY detected_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error: any) {
    console.error("❌ Get incidents failed:", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * GET /api/ops/autopatch-attempts
 * List auto-patch attempts
 */
router.get("/autopatch-attempts", async (req: Request, res: Response) => {
  try {
    const { status, limit = 100 } = req.query;

    let query = `SELECT * FROM plugin_autopatch_attempts WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY executed_at DESC LIMIT $${paramIndex++}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error: any) {
    console.error("❌ Get autopatch attempts failed:", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * POST /api/ops/plugin-incidents/:id/approve
 * Approve auto-patch for incident
 */
router.post("/plugin-incidents/:id/approve", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user;

    // Get incident
    const { rows: [incident] } = await pool.query(
      `SELECT * FROM plugin_incidents WHERE id = $1`,
      [id]
    );

    if (!incident) {
      return res.status(404).json({ error: "incident_not_found" });
    }

    // Update incident status
    await pool.query(
      `UPDATE plugin_incidents SET status = 'in_progress', updated_at = now() WHERE id = $1`,
      [id]
    );

    // Audit log
    const auditCtx = getAuditContext(req);
    await logAudit({
      merchant_id: incident.merchant_plugin_id, // Would need to get merchant_id from plugin
      merchant_plugin_id: incident.merchant_plugin_id,
      ...auditCtx,
      action: "ops.incident.approved",
      details: { incident_id: id }
    });

    res.json({ ok: true });
  } catch (error: any) {
    console.error("❌ Approve incident failed:", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * POST /api/ops/plugin-incidents/:id/manual-action
 * Record manual action for incident
 */
router.post("/plugin-incidents/:id/manual-action", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action } = req.body;
    const user = req.user;

    // Update incident
    await pool.query(
      `UPDATE plugin_incidents 
       SET status = 'closed', 
           escalated_to_ops = true,
           escalation_reason = $1,
           updated_at = now()
       WHERE id = $2`,
      [action, id]
    );

    // Audit log
    const auditCtx = getAuditContext(req);
    await logAudit({
      merchant_id: "", // Would need merchant_id
      merchant_plugin_id: "", // Would need plugin_id
      ...auditCtx,
      action: "ops.incident.manual_action",
      details: { incident_id: id, action }
    });

    res.json({ ok: true });
  } catch (error: any) {
    console.error("❌ Manual action failed:", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

export default router;



