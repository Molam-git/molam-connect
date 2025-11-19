// ============================================================================
// One-Click Approval Token Service (Secure JWT + Hash Storage)
// ============================================================================

import crypto from "crypto";
import { pool } from "../db";
import { logger } from "../logger";

const SECRET = process.env.APPROVAL_TOKEN_SECRET || "change-me-in-production";
const TOKEN_TTL_SECONDS = parseInt(process.env.TOKEN_TTL_SECONDS || "600", 10); // 10 min

export interface TokenData {
  raw: string;
  hash: string;
}

/**
 * Generate one-click approval token
 */
export function generateToken(
  approvalId: string,
  approverId: string,
  decision: "approve" | "reject"
): TokenData {
  const nonce = crypto.randomBytes(16).toString("hex");
  const timestamp = Date.now();

  const raw = `${approvalId}|${approverId}|${decision}|${timestamp}|${nonce}`;

  // Hash for storage (SHA256 HMAC)
  const hash = crypto.createHmac("sha256", SECRET).update(raw).digest("hex");

  return { raw, hash };
}

/**
 * Store token hash in database
 */
export async function storeTokenHash(
  approvalId: string,
  approverId: string,
  decision: "approve" | "reject",
  tokenHash: string,
  ttlSeconds: number = TOKEN_TTL_SECONDS
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await pool.query(
    `INSERT INTO approvals_tokens(approval_id, token_hash, approver_id, decision, expires_at)
     VALUES($1, $2, $3, $4, $5)`,
    [approvalId, tokenHash, approverId, decision, expiresAt]
  );

  logger.info("Token stored", {
    approval_id: approvalId,
    approver_id: approverId,
    decision,
    expires_at: expiresAt,
  });
}

/**
 * Verify and consume token (one-time use)
 */
export async function verifyAndConsumeToken(
  approvalId: string,
  rawToken: string,
  ipAddress?: string
): Promise<{ approver_id: string; decision: string }> {
  // Compute hash
  const hash = crypto.createHmac("sha256", SECRET).update(rawToken).digest("hex");

  // Find token
  const { rows } = await pool.query(
    `SELECT id, approver_id, decision, used, expires_at
     FROM approvals_tokens
     WHERE approval_id = $1 AND token_hash = $2
     LIMIT 1`,
    [approvalId, hash]
  );

  if (rows.length === 0) {
    logger.warn("Token not found", { approval_id: approvalId });
    throw new Error("invalid_token");
  }

  const token = rows[0];

  // Check if already used
  if (token.used) {
    logger.warn("Token already used", {
      approval_id: approvalId,
      token_id: token.id,
    });
    throw new Error("token_already_used");
  }

  // Check expiration
  if (new Date() > new Date(token.expires_at)) {
    logger.warn("Token expired", {
      approval_id: approvalId,
      token_id: token.id,
      expires_at: token.expires_at,
    });
    throw new Error("token_expired");
  }

  // Mark as used
  await pool.query(
    `UPDATE approvals_tokens
     SET used = true, used_at = now(), used_by_ip = $1
     WHERE id = $2`,
    [ipAddress, token.id]
  );

  logger.info("Token consumed successfully", {
    approval_id: approvalId,
    token_id: token.id,
    approver_id: token.approver_id,
    decision: token.decision,
  });

  return {
    approver_id: token.approver_id,
    decision: token.decision,
  };
}

/**
 * Revoke all tokens for an approval (when status changes)
 */
export async function revokeAllTokensForApproval(approvalId: string): Promise<void> {
  await pool.query(
    `DELETE FROM approvals_tokens WHERE approval_id = $1 AND used = false`,
    [approvalId]
  );

  logger.info("All tokens revoked for approval", { approval_id: approvalId });
}
