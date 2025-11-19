// ============================================================================
// Approval Routes
// ============================================================================

import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db";
import { logger } from "../logger";
import { jwtMiddleware, requireRole } from "../middleware/auth";
import { evaluateQuorum } from "../services/quorumEvaluator";
import axios from "axios";

export const approvalsRouter = Router();

// Apply auth middleware to all routes
approvalsRouter.use(jwtMiddleware);

const EVENT_BUS_URL = process.env.EVENT_BUS_URL || "";

// ============================================================================
// POST /api/approvals/requests - Create approval request
// ============================================================================
approvalsRouter.post(
  "/requests",
  requireRole("pay_admin", "ops", "finance_ops"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = req.user!;
      const { ops_log_id, policy_id, payload, target, metadata } = req.body;

      if (!ops_log_id || !policy_id || !payload) {
        res.status(400).json({ error: "ops_log_id, policy_id, and payload are required" });
        return;
      }

      // Get policy to compute expiry
      const { rows: policies } = await pool.query(
        `SELECT * FROM approval_policies WHERE id = $1 LIMIT 1`,
        [policy_id]
      );

      if (policies.length === 0) {
        res.status(404).json({ error: "policy_not_found" });
        return;
      }

      const policy = policies[0];
      const ttlHours = policy.ttl_hours || 72;
      const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

      // Create request
      const requestId = uuidv4();
      await pool.query(
        `INSERT INTO approval_requests(id, ops_log_id, policy_id, payload, target, created_by, expires_at, metadata)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          requestId,
          ops_log_id,
          policy_id,
          JSON.stringify(payload),
          JSON.stringify(target || {}),
          actor.sub,
          expiresAt,
          JSON.stringify(metadata || {}),
        ]
      );

      // Audit log
      await pool.query(
        `INSERT INTO approval_audit(request_id, actor_id, action, details)
         VALUES($1, $2, 'create_request', $3)`,
        [requestId, actor.sub, JSON.stringify({ policy_id, ops_log_id })]
      );

      // Notify approvers via event bus
      try {
        await axios.post(
          `${EVENT_BUS_URL}/events`,
          {
            type: "approval.request.created",
            data: {
              request_id: requestId,
              policy_id,
              required_roles: policy.required_roles,
              ops_log_id,
            },
          },
          { timeout: 2000 }
        );
      } catch (err) {
        logger.warn("Event bus notification failed (non-blocking)", { error: (err as Error).message });
      }

      const { rows: created } = await pool.query(
        `SELECT * FROM approval_requests WHERE id = $1`,
        [requestId]
      );

      logger.info("Approval request created", {
        request_id: requestId,
        policy_id,
        created_by: actor.sub,
      });

      res.status(201).json(created[0]);
    } catch (error: any) {
      logger.error("Create approval request failed", { error: error.message });
      res.status(500).json({ error: "internal_error" });
    }
  }
);

// ============================================================================
// GET /api/approvals/requests - List approval requests
// ============================================================================
approvalsRouter.get(
  "/requests",
  requireRole("pay_admin", "ops", "finance_ops", "compliance", "auditor"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { status = "pending", limit = 50, offset = 0 } = req.query;

      const { rows } = await pool.query(
        `SELECT
          r.*,
          p.name as policy_name,
          p.quorum,
          p.required_roles
        FROM approval_requests r
        LEFT JOIN approval_policies p ON r.policy_id = p.id
        WHERE r.status = $1
        ORDER BY r.created_at DESC
        LIMIT $2 OFFSET $3`,
        [status, limit, offset]
      );

      res.json({ ok: true, requests: rows });
    } catch (error: any) {
      logger.error("List approval requests failed", { error: error.message });
      res.status(500).json({ error: "internal_error" });
    }
  }
);

// ============================================================================
// GET /api/approvals/requests/:id - Get specific request
// ============================================================================
approvalsRouter.get(
  "/requests/:id",
  requireRole("pay_admin", "ops", "finance_ops", "compliance", "auditor"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const { rows: requests } = await pool.query(
        `SELECT
          r.*,
          p.name as policy_name,
          p.quorum,
          p.required_roles,
          p.veto_roles
        FROM approval_requests r
        LEFT JOIN approval_policies p ON r.policy_id = p.id
        WHERE r.id = $1`,
        [id]
      );

      if (requests.length === 0) {
        res.status(404).json({ error: "request_not_found" });
        return;
      }

      // Get votes
      const { rows: votes } = await pool.query(
        `SELECT * FROM approval_votes WHERE request_id = $1 ORDER BY created_at DESC`,
        [id]
      );

      // Get audit trail
      const { rows: audit } = await pool.query(
        `SELECT * FROM approval_audit WHERE request_id = $1 ORDER BY created_at DESC`,
        [id]
      );

      res.json({
        ok: true,
        request: requests[0],
        votes,
        audit,
      });
    } catch (error: any) {
      logger.error("Get approval request failed", { error: error.message });
      res.status(500).json({ error: "internal_error" });
    }
  }
);

// ============================================================================
// POST /api/approvals/requests/:id/vote - Submit vote
// ============================================================================
approvalsRouter.post(
  "/requests/:id/vote",
  requireRole("pay_admin", "ops", "finance_ops", "compliance"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = req.user!;
      const { id } = req.params;
      const { vote, comment } = req.body;

      if (!vote || !["approve", "reject", "abstain"].includes(vote)) {
        res.status(400).json({ error: "invalid_vote", valid_values: ["approve", "reject", "abstain"] });
        return;
      }

      // Check request exists and is pending
      const { rows: requests } = await pool.query(
        `SELECT status FROM approval_requests WHERE id = $1`,
        [id]
      );

      if (requests.length === 0) {
        res.status(404).json({ error: "request_not_found" });
        return;
      }

      if (!["pending", "partially_approved"].includes(requests[0].status)) {
        res.status(400).json({ error: "request_not_pending", current_status: requests[0].status });
        return;
      }

      // Idempotent upsert vote
      await pool.query(
        `INSERT INTO approval_votes(request_id, approver_id, approver_role, vote, comment)
         VALUES($1, $2, $3, $4, $5)
         ON CONFLICT (request_id, approver_id)
         DO UPDATE SET vote = EXCLUDED.vote, comment = EXCLUDED.comment, created_at = now()`,
        [id, actor.sub, actor.roles[0] || "unknown", vote, comment || null]
      );

      // Audit log
      await pool.query(
        `INSERT INTO approval_audit(request_id, actor_id, action, details)
         VALUES($1, $2, 'vote', $3)`,
        [id, actor.sub, JSON.stringify({ vote, comment })]
      );

      logger.info("Vote submitted", {
        request_id: id,
        approver: actor.sub,
        vote,
      });

      // Evaluate quorum (async, don't wait)
      evaluateQuorum(id).catch((err) =>
        logger.error("Quorum evaluation error", { error: err.message })
      );

      res.json({ ok: true });
    } catch (error: any) {
      logger.error("Submit vote failed", { error: error.message });
      res.status(500).json({ error: "internal_error" });
    }
  }
);

// ============================================================================
// GET /api/approvals/policies - List policies
// ============================================================================
approvalsRouter.get(
  "/policies",
  requireRole("pay_admin", "ops", "finance_ops", "auditor"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM approval_policies ORDER BY created_at DESC`
      );

      res.json({ ok: true, policies: rows });
    } catch (error: any) {
      logger.error("List policies failed", { error: error.message });
      res.status(500).json({ error: "internal_error" });
    }
  }
);

// ============================================================================
// GET /api/approvals/audit/:request_id - Get audit trail
// ============================================================================
approvalsRouter.get(
  "/audit/:request_id",
  requireRole("pay_admin", "auditor", "compliance"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { request_id } = req.params;

      const { rows } = await pool.query(
        `SELECT * FROM approval_audit WHERE request_id = $1 ORDER BY created_at DESC`,
        [request_id]
      );

      res.json({ ok: true, audit: rows });
    } catch (error: any) {
      logger.error("Get audit trail failed", { error: error.message });
      res.status(500).json({ error: "internal_error" });
    }
  }
);
