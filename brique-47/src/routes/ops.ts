/**
 * Brique 47 - Ops Routes
 * Operations dashboard endpoints
 */

import { Router, Request, Response } from "express";
import { pool } from "../utils/db.js";
import { requireRole } from "../utils/authz.js";

const router = Router();

/**
 * GET /api/ops/disputes/queue
 * Get disputes queue for ops investigation
 */
router.get("/queue", requireRole("ops_disputes", "pay_admin"), async (req: Request, res: Response) => {
  try {
    const { priority, status, limit = 50, offset = 0 } = req.query;

    let query = `SELECT da.*, d.external_dispute_id, d.amount, d.currency, d.reason_code, d.sira_score
                 FROM dispute_assignments da
                 JOIN disputes d ON da.dispute_id = d.id
                 WHERE 1=1`;
    const params: any[] = [];

    if (priority) {
      query += ` AND da.priority = $${params.length + 1}`;
      params.push(priority);
    }

    if (status) {
      query += ` AND da.status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY da.priority DESC, da.created_at ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    res.json({ data: rows });
  } catch (err: any) {
    console.error("Error fetching queue:", err);
    res.status(500).json({ error: { message: "Failed to fetch queue", type: "database_error" } });
  }
});

/**
 * POST /api/ops/disputes/:id/assign
 * Assign dispute to ops agent
 */
router.post("/:id/assign", requireRole("ops_disputes", "pay_admin"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { agent_id, priority = "normal" } = req.body;

    const { rows: [dispute] } = await pool.query(
      `SELECT id FROM disputes WHERE id = $1`,
      [id]
    );

    if (!dispute) {
      return res.status(404).json({ error: { message: "Dispute not found", type: "not_found" } });
    }

    // Create or update assignment
    const { rows: [assignment] } = await pool.query(
      `INSERT INTO dispute_assignments(dispute_id, assigned_to, priority, status)
       VALUES ($1, $2, $3, 'open')
       ON CONFLICT (dispute_id)
       DO UPDATE SET assigned_to=$2, priority=$3, updated_at=now()
       RETURNING *`,
      [id, agent_id, priority]
    );

    // Log investigation
    await pool.query(
      `INSERT INTO dispute_investigations(dispute_id, action, actor, actor_id, details)
       VALUES ($1, 'assign', 'ops', $2, $3)`,
      [id, req.user?.id, { agent_id, priority }]
    );

    res.json(assignment);
  } catch (err: any) {
    console.error("Error assigning dispute:", err);
    res.status(500).json({ error: { message: "Failed to assign dispute", type: "server_error" } });
  }
});

/**
 * POST /api/ops/disputes/:id/escalate
 * Escalate dispute to SIRA or Legal
 */
router.post("/:id/escalate", requireRole("ops_disputes", "pay_admin"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { escalate_to, reason } = req.body;

    if (!["sira", "legal"].includes(escalate_to)) {
      return res.status(400).json({ error: { message: "Invalid escalate_to", type: "validation_error" } });
    }

    const { rows: [dispute] } = await pool.query(
      `SELECT id FROM disputes WHERE id = $1`,
      [id]
    );

    if (!dispute) {
      return res.status(404).json({ error: { message: "Dispute not found", type: "not_found" } });
    }

    // Log escalation
    await pool.query(
      `INSERT INTO dispute_investigations(dispute_id, action, actor, actor_id, details)
       VALUES ($1, 'escalate', 'ops', $2, $3)`,
      [id, req.user?.id, { escalate_to, reason }]
    );

    // Update dispute status
    await pool.query(
      `UPDATE disputes SET status='escalated', updated_at=now() WHERE id=$1`,
      [id]
    );

    res.json({ message: "Dispute escalated", dispute_id: id, escalate_to });
  } catch (err: any) {
    console.error("Error escalating dispute:", err);
    res.status(500).json({ error: { message: "Failed to escalate dispute", type: "server_error" } });
  }
});

/**
 * GET /api/ops/disputes/stats
 * Dispute statistics
 */
router.get("/stats", requireRole("ops_disputes", "pay_admin"), async (req: Request, res: Response) => {
  try {
    const { rows: [disputeStats] } = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='received') as received_count,
        COUNT(*) FILTER (WHERE status='under_review') as under_review_count,
        COUNT(*) FILTER (WHERE status='decided') as decided_count,
        COUNT(*) FILTER (WHERE outcome='merchant_won') as merchant_won_count,
        COUNT(*) FILTER (WHERE outcome='cardholder_won') as cardholder_won_count,
        AVG(sira_score) as avg_sira_score
      FROM disputes
    `);

    const { rows: [queueStats] } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE priority='high') as high_priority_count,
        COUNT(*) FILTER (WHERE priority='critical') as critical_priority_count,
        COUNT(*) FILTER (WHERE status='open') as open_count,
        COUNT(*) FILTER (WHERE status='in_progress') as in_progress_count
      FROM dispute_assignments
    `);

    res.json({
      disputes: disputeStats,
      queue: queueStats,
    });
  } catch (err: any) {
    console.error("Error fetching stats:", err);
    res.status(500).json({ error: { message: "Failed to fetch stats", type: "database_error" } });
  }
});

export default router;
