// ============================================================================
// Ops Control Routes
// ============================================================================

import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db";
import { logger } from "../logger";
import { jwtMiddleware, requireRole } from "../middleware/auth";
import { generatePlan, PlanParams } from "../sira/client";

export const opsRouter = Router();

// Apply auth middleware to all routes
opsRouter.use(jwtMiddleware);

// ============================================================================
// POST /api/ops/freeze-payouts
// ============================================================================
opsRouter.post(
  "/freeze-payouts",
  requireRole("pay_admin", "finance_ops"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { scope, reason } = req.body;
      const idempotencyKey = req.headers["idempotency-key"] as string;

      if (!idempotencyKey) {
        res.status(400).json({ error: "idempotency_key_required" });
        return;
      }

      if (!scope || !reason) {
        res.status(400).json({ error: "scope_and_reason_required" });
        return;
      }

      // Check idempotency
      const { rows: existing } = await pool.query(
        `SELECT * FROM ops_actions_log WHERE idempotency_key = $1 LIMIT 1`,
        [idempotencyKey]
      );

      if (existing.length > 0) {
        res.json({ ok: true, log: existing[0] });
        return;
      }

      // Create action log
      const logId = uuidv4();
      const target =
        scope === "global" ? { scope: "global" } : { bank_profile_id: scope };

      await pool.query(
        `INSERT INTO ops_actions_log(id, actor_id, actor_role, action_type, target, idempotency_key, status, details, ip_address, user_agent)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          logId,
          req.user!.sub,
          req.user!.roles[0],
          "freeze_payouts",
          JSON.stringify(target),
          idempotencyKey,
          "accepted",
          JSON.stringify({ reason }),
          req.ip,
          req.headers["user-agent"],
        ]
      );

      // Set treasury control
      const controlKey =
        scope === "global" ? "freeze_global" : `freeze_bank_${scope}`;

      await pool.query(
        `INSERT INTO treasury_controls(key, value, enabled, created_by)
         VALUES($1, $2, $3, $4)
         ON CONFLICT (key) DO UPDATE SET value = $2, enabled = $3, created_by = $4`,
        [
          controlKey,
          JSON.stringify({ reason, frozen_at: new Date().toISOString() }),
          true,
          req.user!.sub,
        ]
      );

      logger.info("Payouts frozen", {
        scope,
        reason,
        actor: req.user!.sub,
      });

      const { rows: logs } = await pool.query(
        `SELECT * FROM ops_actions_log WHERE id = $1`,
        [logId]
      );

      res.json({ ok: true, log: logs[0] });
    } catch (error: any) {
      logger.error("Freeze payouts failed", { error: error.message });
      res.status(500).json({ error: "internal_error" });
    }
  }
);

// ============================================================================
// POST /api/ops/unfreeze-payouts
// ============================================================================
opsRouter.post(
  "/unfreeze-payouts",
  requireRole("pay_admin", "finance_ops"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { scope } = req.body;
      const idempotencyKey = req.headers["idempotency-key"] as string;

      if (!idempotencyKey) {
        res.status(400).json({ error: "idempotency_key_required" });
        return;
      }

      if (!scope) {
        res.status(400).json({ error: "scope_required" });
        return;
      }

      // Check idempotency
      const { rows: existing } = await pool.query(
        `SELECT * FROM ops_actions_log WHERE idempotency_key = $1 LIMIT 1`,
        [idempotencyKey]
      );

      if (existing.length > 0) {
        res.json({ ok: true, log: existing[0] });
        return;
      }

      // Create action log
      const logId = uuidv4();
      const target =
        scope === "global" ? { scope: "global" } : { bank_profile_id: scope };

      await pool.query(
        `INSERT INTO ops_actions_log(id, actor_id, actor_role, action_type, target, idempotency_key, status, ip_address, user_agent)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          logId,
          req.user!.sub,
          req.user!.roles[0],
          "unfreeze_payouts",
          JSON.stringify(target),
          idempotencyKey,
          "accepted",
          req.ip,
          req.headers["user-agent"],
        ]
      );

      // Remove treasury control
      const controlKey =
        scope === "global" ? "freeze_global" : `freeze_bank_${scope}`;

      await pool.query(
        `UPDATE treasury_controls SET enabled = false WHERE key = $1`,
        [controlKey]
      );

      logger.info("Payouts unfrozen", {
        scope,
        actor: req.user!.sub,
      });

      const { rows: logs } = await pool.query(
        `SELECT * FROM ops_actions_log WHERE id = $1`,
        [logId]
      );

      res.json({ ok: true, log: logs[0] });
    } catch (error: any) {
      logger.error("Unfreeze payouts failed", { error: error.message });
      res.status(500).json({ error: "internal_error" });
    }
  }
);

// ============================================================================
// POST /api/ops/generate-plan
// ============================================================================
opsRouter.post(
  "/generate-plan",
  requireRole("pay_admin", "ops"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { plan_params } = req.body;
      const idempotencyKey = req.headers["idempotency-key"] as string;

      if (!idempotencyKey) {
        res.status(400).json({ error: "idempotency_key_required" });
        return;
      }

      if (!plan_params || !plan_params.type) {
        res.status(400).json({ error: "plan_params_required" });
        return;
      }

      // Check idempotency
      const { rows: existing } = await pool.query(
        `SELECT * FROM ops_actions_log WHERE idempotency_key = $1 LIMIT 1`,
        [idempotencyKey]
      );

      if (existing.length > 0) {
        res.json({ ok: true, log: existing[0] });
        return;
      }

      // Generate plan via SIRA
      const plan = await generatePlan(plan_params as PlanParams);

      if (!plan) {
        res.status(500).json({ error: "plan_generation_failed" });
        return;
      }

      // Store plan
      const planId = uuidv4();
      await pool.query(
        `INSERT INTO sira_plans(id, plan_type, generated_by, plan_data, approval_required)
         VALUES($1, $2, $3, $4, $5)`,
        [
          planId,
          plan_params.type,
          req.user!.sub,
          JSON.stringify(plan),
          plan.approval_required,
        ]
      );

      // Create action log
      const logId = uuidv4();
      await pool.query(
        `INSERT INTO ops_actions_log(id, actor_id, actor_role, action_type, target, idempotency_key, status, details, ip_address, user_agent)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          logId,
          req.user!.sub,
          req.user!.roles[0],
          "generate_plan",
          JSON.stringify({ plan_id: planId }),
          idempotencyKey,
          "accepted",
          JSON.stringify({ plan_type: plan_params.type }),
          req.ip,
          req.headers["user-agent"],
        ]
      );

      logger.info("Plan generated", {
        plan_id: planId,
        plan_type: plan_params.type,
        actor: req.user!.sub,
      });

      const { rows: logs } = await pool.query(
        `SELECT * FROM ops_actions_log WHERE id = $1`,
        [logId]
      );

      res.json({
        ok: true,
        log: logs[0],
        plan: { id: planId, ...plan },
      });
    } catch (error: any) {
      logger.error("Generate plan failed", { error: error.message });
      res.status(500).json({ error: "internal_error" });
    }
  }
);

// ============================================================================
// POST /api/ops/execute-plan
// ============================================================================
opsRouter.post(
  "/execute-plan",
  requireRole("pay_admin", "finance_ops"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { plan_id, approval_token } = req.body;
      const idempotencyKey = req.headers["idempotency-key"] as string;

      if (!idempotencyKey) {
        res.status(400).json({ error: "idempotency_key_required" });
        return;
      }

      if (!plan_id) {
        res.status(400).json({ error: "plan_id_required" });
        return;
      }

      // Check idempotency
      const { rows: existing } = await pool.query(
        `SELECT * FROM ops_actions_log WHERE idempotency_key = $1 LIMIT 1`,
        [idempotencyKey]
      );

      if (existing.length > 0) {
        res.json({ ok: true, log: existing[0] });
        return;
      }

      // Get plan
      const { rows: plans } = await pool.query(
        `SELECT * FROM sira_plans WHERE id = $1 LIMIT 1`,
        [plan_id]
      );

      if (plans.length === 0) {
        res.status(404).json({ error: "plan_not_found" });
        return;
      }

      const plan = plans[0];

      // Check if approval required
      if (plan.approval_required && !approval_token) {
        res.status(400).json({ error: "approval_token_required" });
        return;
      }

      // Update plan status
      await pool.query(
        `UPDATE sira_plans SET status = 'approved', executed_by = $1, executed_at = now() WHERE id = $2`,
        [req.user!.sub, plan_id]
      );

      // Create action log
      const logId = uuidv4();
      await pool.query(
        `INSERT INTO ops_actions_log(id, actor_id, actor_role, action_type, target, idempotency_key, status, details, ip_address, user_agent)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          logId,
          req.user!.sub,
          req.user!.roles[0],
          "execute_plan",
          JSON.stringify({ plan_id }),
          idempotencyKey,
          "executed",
          JSON.stringify({ plan_type: plan.plan_type }),
          req.ip,
          req.headers["user-agent"],
        ]
      );

      logger.info("Plan executed", {
        plan_id,
        actor: req.user!.sub,
      });

      const { rows: logs } = await pool.query(
        `SELECT * FROM ops_actions_log WHERE id = $1`,
        [logId]
      );

      res.json({ ok: true, log: logs[0] });
    } catch (error: any) {
      logger.error("Execute plan failed", { error: error.message });
      res.status(500).json({ error: "internal_error" });
    }
  }
);

// ============================================================================
// POST /api/ops/retry-payout
// ============================================================================
opsRouter.post(
  "/retry-payout",
  requireRole("pay_admin", "ops"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { payout_id } = req.body;
      const idempotencyKey = req.headers["idempotency-key"] as string;

      if (!idempotencyKey) {
        res.status(400).json({ error: "idempotency_key_required" });
        return;
      }

      if (!payout_id) {
        res.status(400).json({ error: "payout_id_required" });
        return;
      }

      // Check idempotency
      const { rows: existing } = await pool.query(
        `SELECT * FROM ops_actions_log WHERE idempotency_key = $1 LIMIT 1`,
        [idempotencyKey]
      );

      if (existing.length > 0) {
        res.json({ ok: true, log: existing[0] });
        return;
      }

      // Create action log
      const logId = uuidv4();
      await pool.query(
        `INSERT INTO ops_actions_log(id, actor_id, actor_role, action_type, target, idempotency_key, status, ip_address, user_agent)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          logId,
          req.user!.sub,
          req.user!.roles[0],
          "retry_payout",
          JSON.stringify({ payout_id }),
          idempotencyKey,
          "accepted",
          req.ip,
          req.headers["user-agent"],
        ]
      );

      logger.info("Payout retry initiated", {
        payout_id,
        actor: req.user!.sub,
      });

      const { rows: logs } = await pool.query(
        `SELECT * FROM ops_actions_log WHERE id = $1`,
        [logId]
      );

      res.json({ ok: true, log: logs[0] });
    } catch (error: any) {
      logger.error("Retry payout failed", { error: error.message });
      res.status(500).json({ error: "internal_error" });
    }
  }
);

// ============================================================================
// GET /api/ops/actions
// ============================================================================
opsRouter.get(
  "/actions",
  requireRole("pay_admin", "finance_ops", "ops"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { actor_id, action_type, status, from, to, limit = 50, offset = 0 } = req.query;

      let query = `SELECT * FROM ops_actions_log WHERE 1=1`;
      const params: any[] = [];
      let paramIndex = 1;

      if (actor_id) {
        query += ` AND actor_id = $${paramIndex++}`;
        params.push(actor_id);
      }

      if (action_type) {
        query += ` AND action_type = $${paramIndex++}`;
        params.push(action_type);
      }

      if (status) {
        query += ` AND status = $${paramIndex++}`;
        params.push(status);
      }

      if (from) {
        query += ` AND created_at >= $${paramIndex++}`;
        params.push(from);
      }

      if (to) {
        query += ` AND created_at <= $${paramIndex++}`;
        params.push(to);
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);

      const { rows } = await pool.query(query, params);

      res.json({ ok: true, actions: rows });
    } catch (error: any) {
      logger.error("Get actions failed", { error: error.message });
      res.status(500).json({ error: "internal_error" });
    }
  }
);

// ============================================================================
// GET /api/ops/controls
// ============================================================================
opsRouter.get(
  "/controls",
  requireRole("pay_admin", "finance_ops", "ops"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM treasury_controls WHERE enabled = true ORDER BY created_at DESC`
      );

      res.json({ ok: true, controls: rows });
    } catch (error: any) {
      logger.error("Get controls failed", { error: error.message });
      res.status(500).json({ error: "internal_error" });
    }
  }
);

// ============================================================================
// GET /api/ops/plans
// ============================================================================
opsRouter.get(
  "/plans",
  requireRole("pay_admin", "finance_ops", "ops"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, limit = 50, offset = 0 } = req.query;

      let query = `SELECT * FROM sira_plans WHERE 1=1`;
      const params: any[] = [];
      let paramIndex = 1;

      if (status) {
        query += ` AND status = $${paramIndex++}`;
        params.push(status);
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);

      const { rows } = await pool.query(query, params);

      res.json({ ok: true, plans: rows });
    } catch (error: any) {
      logger.error("Get plans failed", { error: error.message });
      res.status(500).json({ error: "internal_error" });
    }
  }
);
