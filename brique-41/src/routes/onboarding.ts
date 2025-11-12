/**
 * Brique 41 - Molam Connect
 * Onboarding tasks API routes
 */

import { Router } from "express";
import { pool } from "../db";
import { requireRole, scopeMerchant } from "../rbac";
import { audit, AuditActions } from "../utils/audit";
import { isValidTaskStatus, isValidSeverity, validateRequired } from "../utils/validate";

export const onboardingRouter = Router({ mergeParams: true });

/**
 * GET /api/connect/accounts/:id/onboarding/tasks
 * List onboarding tasks for account
 */
onboardingRouter.get(
  "/tasks",
  requireRole(["merchant_admin", "pay_admin", "compliance_ops"]),
  scopeMerchant,
  async (req: any, res) => {
    try {
      const connectAccountId = req.params.id;

      const { rows } = await pool.query(
        `SELECT * FROM connect_onboarding_tasks
         WHERE connect_account_id = $1
         ORDER BY severity DESC, created_at ASC`,
        [connectAccountId]
      );

      res.json(rows);
    } catch (e: any) {
      console.error("[Onboarding] List tasks error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * POST /api/connect/accounts/:id/onboarding/tasks
 * Create onboarding task (Ops only)
 */
onboardingRouter.post(
  "/tasks",
  requireRole(["pay_admin", "compliance_ops"]),
  async (req: any, res) => {
    try {
      const user = req.user;
      const connectAccountId = req.params.id;
      const { code, title, severity, details } = req.body;

      // Validation
      const validation = validateRequired(req.body, ["code", "title"]);

      if (!validation.valid) {
        return res.status(400).json({
          error: "missing_required_fields",
          missing: validation.missing,
        });
      }

      if (severity && !isValidSeverity(severity)) {
        return res.status(400).json({ error: "invalid_severity" });
      }

      const { rows } = await pool.query(
        `INSERT INTO connect_onboarding_tasks (
          connect_account_id, code, title, severity, details
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
        [connectAccountId, code, title, severity || "normal", details || {}]
      );

      await audit(connectAccountId, user.id, AuditActions.ONBOARDING_TASK_CREATED, {
        code,
        title,
      });

      res.status(201).json(rows[0]);
    } catch (e: any) {
      console.error("[Onboarding] Create task error:", e);
      res.status(500).json({ error: "server_error", detail: e.message });
    }
  }
);

/**
 * GET /api/connect/accounts/:id/onboarding/tasks/:taskId
 * Get specific task
 */
onboardingRouter.get(
  "/tasks/:taskId",
  requireRole(["merchant_admin", "pay_admin", "compliance_ops"]),
  scopeMerchant,
  async (req: any, res) => {
    try {
      const { id: connectAccountId, taskId } = req.params;

      const { rows } = await pool.query(
        `SELECT * FROM connect_onboarding_tasks
         WHERE id = $1 AND connect_account_id = $2`,
        [taskId, connectAccountId]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "not_found" });
      }

      res.json(rows[0]);
    } catch (e: any) {
      console.error("[Onboarding] Get task error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * PATCH /api/connect/accounts/:id/onboarding/tasks/:taskId
 * Update task details (Ops only)
 */
onboardingRouter.patch(
  "/tasks/:taskId",
  requireRole(["pay_admin", "compliance_ops"]),
  async (req: any, res) => {
    try {
      const user = req.user;
      const { id: connectAccountId, taskId } = req.params;
      const { title, severity, details } = req.body;

      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (title) {
        updates.push(`title = $${paramIndex++}`);
        values.push(title);
      }

      if (severity) {
        if (!isValidSeverity(severity)) {
          return res.status(400).json({ error: "invalid_severity" });
        }
        updates.push(`severity = $${paramIndex++}`);
        values.push(severity);
      }

      if (details) {
        updates.push(`details = $${paramIndex++}`);
        values.push(details);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "no_fields_to_update" });
      }

      updates.push(`updated_at = now()`);
      values.push(taskId, connectAccountId);

      const { rows } = await pool.query(
        `UPDATE connect_onboarding_tasks
         SET ${updates.join(", ")}
         WHERE id = $${paramIndex} AND connect_account_id = $${paramIndex + 1}
         RETURNING *`,
        values
      );

      if (!rows.length) {
        return res.status(404).json({ error: "not_found" });
      }

      await audit(connectAccountId, user.id, AuditActions.ONBOARDING_TASK_UPDATED, req.body);

      res.json(rows[0]);
    } catch (e: any) {
      console.error("[Onboarding] Update task error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * POST /api/connect/accounts/:id/onboarding/tasks/:taskId/resolve
 * Resolve onboarding task (Ops only)
 */
onboardingRouter.post(
  "/tasks/:taskId/resolve",
  requireRole(["pay_admin", "compliance_ops"]),
  async (req: any, res) => {
    try {
      const user = req.user;
      const { id: connectAccountId, taskId } = req.params;
      const { status, notes } = req.body;

      if (!status) {
        return res.status(400).json({ error: "status_required" });
      }

      if (!["done", "rejected", "waived"].includes(status)) {
        return res.status(400).json({
          error: "invalid_status",
          valid_values: ["done", "rejected", "waived"],
        });
      }

      const { rows } = await pool.query(
        `UPDATE connect_onboarding_tasks
         SET status = $1,
             details = details || $2::jsonb,
             updated_at = now()
         WHERE id = $3 AND connect_account_id = $4
         RETURNING *`,
        [status, JSON.stringify({ resolution_notes: notes }), taskId, connectAccountId]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "not_found" });
      }

      await audit(connectAccountId, user.id, AuditActions.ONBOARDING_TASK_RESOLVED, {
        task_id: taskId,
        status,
        notes,
      });

      res.json(rows[0]);
    } catch (e: any) {
      console.error("[Onboarding] Resolve task error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * DELETE /api/connect/accounts/:id/onboarding/tasks/:taskId
 * Delete task (Ops only)
 */
onboardingRouter.delete(
  "/tasks/:taskId",
  requireRole(["pay_admin", "compliance_ops"]),
  async (req: any, res) => {
    try {
      const user = req.user;
      const { id: connectAccountId, taskId } = req.params;

      const { rows } = await pool.query(
        `DELETE FROM connect_onboarding_tasks
         WHERE id = $1 AND connect_account_id = $2
         RETURNING *`,
        [taskId, connectAccountId]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "not_found" });
      }

      await audit(connectAccountId, user.id, "onboarding.task_deleted", { task_id: taskId });

      res.json({ success: true, deleted: rows[0] });
    } catch (e: any) {
      console.error("[Onboarding] Delete task error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * GET /api/connect/accounts/:id/onboarding/status
 * Get overall onboarding status
 */
onboardingRouter.get(
  "/status",
  requireRole(["merchant_admin", "pay_admin", "compliance_ops"]),
  scopeMerchant,
  async (req: any, res) => {
    try {
      const connectAccountId = req.params.id;

      // Get account status
      const { rows: accountRows } = await pool.query(
        `SELECT onboarding_status, verification_status FROM connect_accounts WHERE id = $1`,
        [connectAccountId]
      );

      if (!accountRows.length) {
        return res.status(404).json({ error: "account_not_found" });
      }

      // Get task statistics
      const { rows: taskStats } = await pool.query(
        `SELECT
          status,
          COUNT(*) as count
         FROM connect_onboarding_tasks
         WHERE connect_account_id = $1
         GROUP BY status`,
        [connectAccountId]
      );

      const stats: any = {};
      taskStats.forEach((row) => {
        stats[row.status] = parseInt(row.count);
      });

      res.json({
        account_status: accountRows[0].onboarding_status,
        verification_status: accountRows[0].verification_status,
        tasks: stats,
        all_tasks_completed:
          (stats.open || 0) === 0 && (stats.in_review || 0) === 0,
      });
    } catch (e: any) {
      console.error("[Onboarding] Get status error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);
