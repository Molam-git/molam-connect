// ============================================================================
// Approval Orchestrator - Core business logic
// ============================================================================

import { pool } from "../db";
import { logger } from "../logger";
import { scoreAction, SiraScorePayload } from "./siraScoring";
import { generateToken, storeTokenHash } from "./tokenService";

export interface CreateApprovalRequest {
  action_type: string;
  origin_module: string;
  origin_entity_id?: string;
  payload: SiraScorePayload;
  created_by: string;
  expires_in_minutes?: number;
}

export interface CreateApprovalResult {
  approval_id: string;
  status: string;
  sira_score: number;
  required_approvals: number;
  approvers: Array<{ id: string; email: string; token: string }>;
}

/**
 * Create new approval request with SIRA scoring
 */
export async function createApproval(
  request: CreateApprovalRequest
): Promise<CreateApprovalResult> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1) Score via SIRA
    const siraResult = await scoreAction(request.payload);

    // 2) Find applicable policy
    const { rows: policies } = await client.query(
      `SELECT * FROM approvals_policy
       WHERE active = true
         AND (country IS NULL OR country = $1)
         AND (module IS NULL OR module = $2)
         AND (action_type IS NULL OR action_type = $3)
       ORDER BY
         (CASE WHEN country IS NOT NULL THEN 1 ELSE 0 END) +
         (CASE WHEN module IS NOT NULL THEN 1 ELSE 0 END) +
         (CASE WHEN action_type IS NOT NULL THEN 1 ELSE 0 END) DESC
       LIMIT 1`,
      [
        request.payload.origin_country || null,
        request.origin_module,
        request.action_type,
      ]
    );

    const policy = policies[0] || {
      min_score_auto: 25,
      min_score_single: 60,
      min_score_double: 85,
      max_approvals: 3,
      timeout_minutes: 60,
      evidence_required_score: 85,
    };

    // 3) Determine required approvals based on SIRA score + policy
    let requiredApprovals = 0;
    let evidenceRequired = false;

    if (siraResult.score < policy.min_score_auto) {
      requiredApprovals = 0; // Auto-approve
    } else if (siraResult.score < policy.min_score_single) {
      requiredApprovals = 1;
    } else if (siraResult.score < policy.min_score_double) {
      requiredApprovals = 2;
    } else {
      requiredApprovals = Math.min(policy.max_approvals, 3);
    }

    if (siraResult.score >= policy.evidence_required_score) {
      evidenceRequired = true;
    }

    // 4) Calculate expiration
    const expiresInMinutes = request.expires_in_minutes || policy.timeout_minutes;
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    // 5) Create approval action
    const { rows: actions } = await client.query(
      `INSERT INTO approvals_action(
        action_type, origin_module, origin_entity_id, payload, created_by,
        sira_score, sira_tags, sira_reason, sira_recommended_approvals, sira_recommended_channels,
        required_approvals, evidence_required, expires_at, status
      )
      VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        request.action_type,
        request.origin_module,
        request.origin_entity_id,
        JSON.stringify(request.payload),
        request.created_by,
        siraResult.score,
        siraResult.tags,
        siraResult.reason,
        siraResult.recommended_approvals,
        siraResult.recommended_channels,
        requiredApprovals,
        evidenceRequired,
        expiresAt,
        requiredApprovals === 0 ? "auto_approved" : "pending",
      ]
    );

    const approval = actions[0];

    // 6) Select approvers from pools
    const approvers = await selectApprovers(
      requiredApprovals,
      request.payload,
      request.origin_module
    );

    // 7) Generate tokens for each approver (approve + reject)
    const approverTokens: Array<{ id: string; email: string; token: string }> = [];

    for (const approver of approvers) {
      // Generate approve token
      const approveToken = generateToken(approval.id, approver.id, "approve");
      await storeTokenHash(
        approval.id,
        approver.id,
        "approve",
        approveToken.hash
      );

      // Generate reject token
      const rejectToken = generateToken(approval.id, approver.id, "reject");
      await storeTokenHash(approval.id, approver.id, "reject", rejectToken.hash);

      approverTokens.push({
        id: approver.id,
        email: approver.email,
        token: approveToken.raw, // Return approve token (reject sent separately)
      });
    }

    await client.query("COMMIT");

    logger.info("Approval created", {
      approval_id: approval.id,
      sira_score: siraResult.score,
      required_approvals: requiredApprovals,
      approvers_count: approvers.length,
    });

    return {
      approval_id: approval.id,
      status: approval.status,
      sira_score: siraResult.score,
      required_approvals: requiredApprovals,
      approvers: approverTokens,
    };
  } catch (error: any) {
    await client.query("ROLLBACK");
    logger.error("Failed to create approval", { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Select approvers from pools based on criteria
 */
async function selectApprovers(
  count: number,
  payload: SiraScorePayload,
  originModule: string
): Promise<Array<{ id: string; email: string; role: string }>> {
  if (count === 0) return [];

  // Find matching pools
  const { rows: pools } = await pool.query(
    `SELECT * FROM approvals_pool
     WHERE active = true
       AND (country IS NULL OR country = $1)
       AND (module IS NULL OR module = $2)
       AND (min_amount IS NULL OR $3 >= min_amount)
       AND (max_amount IS NULL OR $3 <= max_amount)
     ORDER BY priority ASC
     LIMIT 3`,
    [payload.origin_country || null, originModule, payload.amount || 0]
  );

  if (pools.length === 0) {
    // Fallback: use default pool
    logger.warn("No matching pools found, using default");
    return getFallbackApprovers(count);
  }

  // Get users from Molam ID with matching roles
  // For demo: return mock approvers
  const approvers: Array<{ id: string; email: string; role: string }> = [];

  for (let i = 0; i < Math.min(count, 5); i++) {
    approvers.push({
      id: `approver-${i + 1}`,
      email: process.env[`APPROVER_${i + 1}_EMAIL`] || `approver${i + 1}@molam.com`,
      role: pools[0]?.roles[0] || "ops_approver",
    });
  }

  return approvers.slice(0, count);
}

function getFallbackApprovers(count: number): Array<{ id: string; email: string; role: string }> {
  const fallbacks = [
    { id: "fallback-1", email: process.env.DEFAULT_APPROVER_EMAIL || "ops@molam.com", role: "pay_admin" },
  ];
  return fallbacks.slice(0, count);
}

/**
 * Submit approval vote with token
 */
export async function submitApprovalVote(
  approvalId: string,
  approverId: string,
  decision: "approve" | "reject",
  evidence?: string
): Promise<{ status: string; approved_count: number; required_approvals: number }> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Get approval action
    const { rows: actions } = await client.query(
      `SELECT * FROM approvals_action WHERE id = $1`,
      [approvalId]
    );

    if (actions.length === 0) {
      throw new Error("approval_not_found");
    }

    const approval = actions[0];

    if (approval.status !== "pending") {
      throw new Error("approval_already_decided");
    }

    if (new Date() > new Date(approval.expires_at)) {
      throw new Error("approval_expired");
    }

    // Check if approver already voted
    const { rows: existingVotes } = await client.query(
      `SELECT * FROM approvals_vote WHERE approval_id = $1 AND approver_id = $2`,
      [approvalId, approverId]
    );

    if (existingVotes.length > 0) {
      throw new Error("already_voted");
    }

    // Check evidence requirement
    if (approval.evidence_required && decision === "approve" && !evidence) {
      throw new Error("evidence_required");
    }

    // Insert vote
    await client.query(
      `INSERT INTO approvals_vote(approval_id, approver_id, decision, comment, voted_at)
       VALUES($1, $2, $3, $4, now())`,
      [approvalId, approverId, decision, evidence || null]
    );

    // If rejected, update approval immediately
    if (decision === "reject") {
      await client.query(
        `UPDATE approvals_action SET status = 'rejected', decided_at = now() WHERE id = $1`,
        [approvalId]
      );

      await client.query("COMMIT");

      logger.info("Approval rejected", { approval_id: approvalId, approver_id: approverId });

      return {
        status: "rejected",
        approved_count: 0,
        required_approvals: approval.required_approvals,
      };
    }

    // Count approvals
    const { rows: countRows } = await client.query(
      `SELECT COUNT(DISTINCT approver_id) as count FROM approvals_vote
       WHERE approval_id = $1 AND decision = 'approve'`,
      [approvalId]
    );

    const approvedCount = parseInt(countRows[0].count, 10);

    // Update approval count
    await client.query(
      `UPDATE approvals_action SET approved_count = $1 WHERE id = $2`,
      [approvedCount, approvalId]
    );

    // Check if quorum reached
    if (approvedCount >= approval.required_approvals) {
      await client.query(
        `UPDATE approvals_action SET status = 'approved', decided_at = now() WHERE id = $1`,
        [approvalId]
      );

      await client.query("COMMIT");

      logger.info("Approval approved - quorum reached", {
        approval_id: approvalId,
        approved_count: approvedCount,
        required_approvals: approval.required_approvals,
      });

      return {
        status: "approved",
        approved_count: approvedCount,
        required_approvals: approval.required_approvals,
      };
    }

    await client.query("COMMIT");

    logger.info("Vote recorded", {
      approval_id: approvalId,
      approver_id: approverId,
      decision,
      approved_count: approvedCount,
      required_approvals: approval.required_approvals,
    });

    return {
      status: "pending",
      approved_count: approvedCount,
      required_approvals: approval.required_approvals,
    };
  } catch (error: any) {
    await client.query("ROLLBACK");
    logger.error("Failed to submit vote", { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Override approval (super admin only)
 */
export async function overrideApproval(
  approvalId: string,
  adminId: string,
  decision: "approve" | "reject",
  reason: string
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE approvals_action
       SET status = 'overridden', decided_at = now(), override_by = $1, override_reason = $2
       WHERE id = $3`,
      [adminId, reason, approvalId]
    );

    // Insert override vote
    await client.query(
      `INSERT INTO approvals_vote(approval_id, approver_id, decision, comment, voted_at)
       VALUES($1, $2, $3, $4, now())`,
      [approvalId, adminId, decision, `OVERRIDE: ${reason}`]
    );

    await client.query("COMMIT");

    logger.info("Approval overridden", {
      approval_id: approvalId,
      admin_id: adminId,
      decision,
      reason,
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    logger.error("Failed to override approval", { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}
