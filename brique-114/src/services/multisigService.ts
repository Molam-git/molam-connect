/**
 * Brique 114 - SIRA Explainability & Feedback UI
 * Multi-Signature Service: Check requirements, record approvals
 */

import { pool } from "../db";
import { Request } from "express";
import crypto from "crypto";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info"
});

/**
 * Check if multi-sig is required for override
 */
export async function checkMultisigRequirement(
  prediction: any,
  overrideDecision: string
): Promise<boolean> {
  // Multi-sig required if:
  // 1. Override decision is 'reject' or 'block'
  // 2. OR amount > threshold (from features or prediction)
  
  const threshold = Number(process.env.MULTISIG_AMOUNT_THRESHOLD || "10000");
  const amount = prediction.features?.amount || prediction.amount || 0;

  if (overrideDecision === "reject" || overrideDecision === "block") {
    return true;
  }

  if (amount > threshold) {
    return true;
  }

  // Check if prediction score is very high (high risk)
  if (prediction.score > 0.9) {
    return true;
  }

  return false;
}

/**
 * Check if user has multi-sig approval for this prediction
 */
export async function userHasMultiSig(
  userId: string,
  predictionId: string
): Promise<boolean> {
  // Check if there's already a feedback with multi-sig from this user
  const { rows } = await pool.query(
    `SELECT COUNT(*) as count
     FROM sira_multisig_approvals sma
     JOIN sira_feedback sf ON sf.id = sma.feedback_id
     WHERE sma.approver_id = $1
       AND sf.prediction_id = $2`,
    [userId, predictionId]
  );

  if (Number(rows[0].count) > 0) {
    return true; // User already approved
  }

  // Check if multi-sig is complete (2+ approvals)
  const { rows: completeRows } = await pool.query(
    `SELECT is_multisig_complete(sf.id, 2) as complete
     FROM sira_feedback sf
     WHERE sf.prediction_id = $1
     ORDER BY sf.created_at DESC
     LIMIT 1`,
    [predictionId]
  );

  if (completeRows.length > 0 && completeRows[0].complete) {
    return true; // Multi-sig already complete
  }

  return false;
}

/**
 * Record multi-sig approval
 */
export async function recordMultisigApproval(
  feedbackId: string,
  approverId: string,
  approverRole: string,
  approvalType: string,
  req: Request
): Promise<void> {
  // Generate signature
  const signature = generateSignature(feedbackId, approverId, approvalType);

  await pool.query(
    `INSERT INTO sira_multisig_approvals
     (feedback_id, approver_id, approver_role, approval_type, signature, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      feedbackId,
      approverId,
      approverRole,
      approvalType,
      signature,
      req.ip || req.socket.remoteAddress,
      req.headers["user-agent"]
    ]
  );

  logger.info({ feedbackId, approverId, approvalType }, "Multi-sig approval recorded");
}

/**
 * Generate cryptographic signature
 */
function generateSignature(feedbackId: string, approverId: string, approvalType: string): string {
  const secret = process.env.MULTISIG_SECRET || "default-secret-change-in-production";
  const data = `${feedbackId}:${approverId}:${approvalType}`;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(data);
  return hmac.digest("hex");
}

