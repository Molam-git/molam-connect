// ============================================================================
// Risk-Aware Approval Routes
// ============================================================================

import { Router, Request, Response } from "express";
import { logger } from "../logger";
import {
  createApproval,
  submitApprovalVote,
  overrideApproval,
} from "../services/approvalOrchestrator";
import { verifyAndConsumeToken } from "../services/tokenService";
import { pool } from "../db";
import axios from "axios";

export const approvalsRouter = Router();

const MULTICHANNEL_SERVICE_URL =
  process.env.MULTICHANNEL_SERVICE_URL || "http://multichannel-service:3000";
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || "";

// ============================================================================
// POST /api/approvals - Create approval request with SIRA scoring
// ============================================================================
approvalsRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      action_type,
      origin_module,
      origin_entity_id,
      payload,
      created_by,
      expires_in_minutes,
    } = req.body;

    // Validation
    if (!action_type || !origin_module || !payload || !created_by) {
      res.status(400).json({ error: "missing_required_fields" });
      return;
    }

    // Create approval with SIRA scoring
    const result = await createApproval({
      action_type,
      origin_module,
      origin_entity_id,
      payload,
      created_by,
      expires_in_minutes,
    });

    // If auto-approved, return immediately
    if (result.status === "auto_approved") {
      res.json({
        ok: true,
        approval_id: result.approval_id,
        status: result.status,
        sira_score: result.sira_score,
        required_approvals: result.required_approvals,
        approvers: [],
      });
      return;
    }

    // Send multi-channel notifications to all approvers
    const notificationPromises = result.approvers.map(async (approver) => {
      try {
        await axios.post(
          `${MULTICHANNEL_SERVICE_URL}/api/multichannel/send`,
          {
            approval_request_id: result.approval_id,
            ops_log_id: origin_entity_id || result.approval_id,
            action_type,
            description: payload.description || `${action_type} action`,
            amount: payload.amount,
            currency: payload.currency || "XOF",
            quorum: result.required_approvals,
            recipient_id: approver.id,
            recipient_email: approver.email,
            expires_at: new Date(Date.now() + (expires_in_minutes || 60) * 60 * 1000).toISOString(),
          },
          {
            headers: {
              Authorization: `Bearer ${SERVICE_TOKEN}`,
              "Content-Type": "application/json",
            },
            timeout: 10000,
          }
        );

        logger.info("Notification sent to approver", {
          approval_id: result.approval_id,
          approver_id: approver.id,
          approver_email: approver.email,
        });
      } catch (error: any) {
        logger.error("Failed to send notification to approver", {
          approval_id: result.approval_id,
          approver_id: approver.id,
          error: error.message,
        });
      }
    });

    await Promise.allSettled(notificationPromises);

    res.json({
      ok: true,
      approval_id: result.approval_id,
      status: result.status,
      sira_score: result.sira_score,
      required_approvals: result.required_approvals,
      approvers: result.approvers.map((a) => ({
        id: a.id,
        email: a.email,
      })),
    });
  } catch (error: any) {
    logger.error("Failed to create approval", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});

// ============================================================================
// POST /api/approvals/:id/consume - Consume one-click token
// ============================================================================
approvalsRouter.post("/:id/consume", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: approvalId } = req.params;
    const { token, evidence } = req.body;
    const ipAddress = req.ip;

    if (!token) {
      res.status(400).json({ error: "missing_token" });
      return;
    }

    // Verify and consume token
    const { approver_id, decision } = await verifyAndConsumeToken(
      approvalId,
      token,
      ipAddress
    );

    // Submit vote
    const result = await submitApprovalVote(approvalId, approver_id, decision as any, evidence);

    logger.info("Token consumed and vote submitted", {
      approval_id: approvalId,
      approver_id,
      decision,
      status: result.status,
    });

    res.json({
      ok: true,
      status: result.status,
      approved_count: result.approved_count,
      required_approvals: result.required_approvals,
      decision,
    });
  } catch (error: any) {
    logger.error("Failed to consume token", { error: error.message });

    if (
      error.message === "token_not_found" ||
      error.message === "token_already_used" ||
      error.message === "token_expired"
    ) {
      res.status(400).json({ error: error.message });
    } else if (error.message === "approval_not_found") {
      res.status(404).json({ error: "approval_not_found" });
    } else if (
      error.message === "approval_already_decided" ||
      error.message === "already_voted" ||
      error.message === "evidence_required" ||
      error.message === "approval_expired"
    ) {
      res.status(409).json({ error: error.message });
    } else {
      res.status(500).json({ error: "internal_error" });
    }
  }
});

// ============================================================================
// POST /api/approvals/:id/override - Super admin override
// ============================================================================
approvalsRouter.post("/:id/override", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: approvalId } = req.params;
    const { decision, reason } = req.body;

    // TODO: Validate admin JWT from Molam ID
    const adminId = req.headers["x-user-id"] as string;

    if (!adminId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    if (!decision || !reason) {
      res.status(400).json({ error: "missing_required_fields" });
      return;
    }

    if (decision !== "approve" && decision !== "reject") {
      res.status(400).json({ error: "invalid_decision" });
      return;
    }

    await overrideApproval(approvalId, adminId, decision, reason);

    logger.info("Approval overridden", { approval_id: approvalId, admin_id: adminId, decision });

    res.json({ ok: true });
  } catch (error: any) {
    logger.error("Failed to override approval", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});

// ============================================================================
// GET /api/approvals - List approvals with filters
// ============================================================================
approvalsRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, origin_module, created_by, limit = "50", offset = "0" } = req.query;

    let query = `SELECT * FROM approvals_action WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (origin_module) {
      query += ` AND origin_module = $${paramIndex}`;
      params.push(origin_module);
      paramIndex++;
    }

    if (created_by) {
      query += ` AND created_by = $${paramIndex}`;
      params.push(created_by);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

    const { rows } = await pool.query(query, params);

    res.json({ ok: true, approvals: rows });
  } catch (error: any) {
    logger.error("Failed to list approvals", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});

// ============================================================================
// GET /api/approvals/:id - Get approval details
// ============================================================================
approvalsRouter.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { rows: actions } = await pool.query(
      `SELECT * FROM approvals_action WHERE id = $1`,
      [id]
    );

    if (actions.length === 0) {
      res.status(404).json({ error: "approval_not_found" });
      return;
    }

    const approval = actions[0];

    // Get votes
    const { rows: votes } = await pool.query(
      `SELECT approver_id, decision, comment, voted_at FROM approvals_vote
       WHERE approval_id = $1 ORDER BY voted_at DESC`,
      [id]
    );

    // Get evidence if any
    const { rows: evidence } = await pool.query(
      `SELECT * FROM approvals_evidence WHERE approval_id = $1 ORDER BY uploaded_at DESC`,
      [id]
    );

    res.json({
      ok: true,
      approval,
      votes,
      evidence,
    });
  } catch (error: any) {
    logger.error("Failed to get approval", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});

// ============================================================================
// GET /api/approvals/:id/votes - Get approval votes
// ============================================================================
approvalsRouter.get("/:id/votes", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT * FROM approvals_vote WHERE approval_id = $1 ORDER BY voted_at DESC`,
      [id]
    );

    res.json({ ok: true, votes: rows });
  } catch (error: any) {
    logger.error("Failed to get votes", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});
