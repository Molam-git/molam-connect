// ============================================================================
// Quorum Evaluation Logic
// ============================================================================

import { pool } from "../db";
import { logger } from "../logger";
import axios from "axios";

const EVENT_BUS_URL = process.env.EVENT_BUS_URL || "";

export async function evaluateQuorum(requestId: string): Promise<void> {
  try {
    // Fetch request with policy (joined query)
    const { rows: requests } = await pool.query(
      `SELECT
        r.*,
        p.quorum,
        p.veto_roles,
        p.required_roles
      FROM approval_requests r
      LEFT JOIN approval_policies p ON r.policy_id = p.id
      WHERE r.id = $1`,
      [requestId]
    );

    if (requests.length === 0) {
      logger.warn("Request not found for quorum evaluation", { requestId });
      return;
    }

    const request = requests[0];

    // Skip if already terminal state
    if (!["pending", "partially_approved"].includes(request.status)) {
      return;
    }

    // Get all votes for this request
    const { rows: votes } = await pool.query(
      `SELECT vote, approver_role, approver_id, comment FROM approval_votes WHERE request_id = $1`,
      [requestId]
    );

    const vetoRoles = request.veto_roles || [];
    const quorumNeeded = Number(request.quorum) || 1;

    // Check for veto
    for (const v of votes) {
      if (v.vote === "reject" && vetoRoles.includes(v.approver_role)) {
        // Immediate rejection due to veto
        await pool.query(
          `UPDATE approval_requests SET status = 'rejected' WHERE id = $1`,
          [requestId]
        );

        await pool.query(
          `INSERT INTO approval_audit(request_id, action, details) VALUES ($1, 'veto', $2)`,
          [requestId, JSON.stringify({ veto_by: v.approver_id, role: v.approver_role, votes })]
        );

        // Update linked ops log
        await pool.query(
          `UPDATE ops_actions_log SET status = 'rejected' WHERE id = $1`,
          [request.ops_log_id]
        );

        logger.info("Approval request rejected via veto", {
          request_id: requestId,
          veto_role: v.approver_role,
        });

        // Publish event
        await publishEvent("approval.request.vetoed", { request_id: requestId, ops_log_id: request.ops_log_id });

        return;
      }
    }

    // Count approvals (distinct approvers)
    const approvals = votes.filter((v) => v.vote === "approve");
    const uniqueApprovers = new Set(approvals.map((v) => v.approver_id));

    if (uniqueApprovers.size >= quorumNeeded) {
      // Quorum met - approve
      await pool.query(
        `UPDATE approval_requests SET status = 'approved' WHERE id = $1`,
        [requestId]
      );

      await pool.query(
        `INSERT INTO approval_audit(request_id, action, details) VALUES ($1, 'auto_approved', $2)`,
        [requestId, JSON.stringify({ votes, quorum_met: uniqueApprovers.size })]
      );

      // Mark ops log as accepted
      await pool.query(
        `UPDATE ops_actions_log SET status = 'accepted' WHERE id = $1`,
        [request.ops_log_id]
      );

      logger.info("Approval request approved", {
        request_id: requestId,
        quorum: uniqueApprovers.size,
      });

      // Publish event for execution
      await publishEvent("approval.request.approved", {
        request_id: requestId,
        ops_log_id: request.ops_log_id,
      });
    } else if (uniqueApprovers.size > 0) {
      // Partially approved
      await pool.query(
        `UPDATE approval_requests SET status = 'partially_approved' WHERE id = $1`,
        [requestId]
      );

      logger.info("Approval request partially approved", {
        request_id: requestId,
        approvals: uniqueApprovers.size,
        needed: quorumNeeded,
      });
    }
  } catch (error: any) {
    logger.error("Quorum evaluation failed", {
      request_id: requestId,
      error: error.message,
    });
  }
}

async function publishEvent(type: string, data: any): Promise<void> {
  if (!EVENT_BUS_URL) {
    logger.warn("EVENT_BUS_URL not configured, skipping event publish");
    return;
  }

  try {
    await axios.post(
      `${EVENT_BUS_URL}/events`,
      { type, data },
      { timeout: 2000 }
    );
    logger.info("Event published", { type, data });
  } catch (error: any) {
    logger.warn("Event publish failed (non-blocking)", {
      type,
      error: error.message,
    });
  }
}
