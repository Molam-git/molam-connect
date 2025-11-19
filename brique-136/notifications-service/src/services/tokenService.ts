// ============================================================================
// Token Service - Génération et validation de tokens signés JWT
// ============================================================================

import jwt from "jsonwebtoken";
import crypto from "crypto";
import { pool } from "../db";
import { logger } from "../logger";

const SECRET_KEY = process.env.APPROVAL_SECRET_KEY || "change-me-in-production";
const TOKEN_EXPIRATION_MINUTES = parseInt(process.env.TOKEN_EXPIRATION_MINUTES || "10", 10);

interface TokenPayload {
  approval_request_id: string;
  action: "approve" | "reject";
  recipient_id: string;
  recipient_email: string;
  exp: number;
  jti: string; // JWT ID for tracking
}

interface TokenGenerationResult {
  token: string;
  tokenHash: string;
  expiresAt: Date;
  tokenId: string;
}

/**
 * Génère un token signé JWT pour approuver ou rejeter
 */
export async function generateSignedToken(
  approvalRequestId: string,
  action: "approve" | "reject",
  recipientId: string,
  recipientEmail: string
): Promise<TokenGenerationResult> {
  const tokenId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRATION_MINUTES * 60 * 1000);

  const payload: TokenPayload = {
    approval_request_id: approvalRequestId,
    action,
    recipient_id: recipientId,
    recipient_email: recipientEmail,
    exp: Math.floor(expiresAt.getTime() / 1000),
    jti: tokenId,
  };

  const token = jwt.sign(payload, SECRET_KEY, { algorithm: "HS256" });
  const tokenHash = hashToken(token);

  // Store token in database
  await pool.query(
    `INSERT INTO email_action_tokens(id, approval_request_id, token_hash, action, recipient_id, recipient_email, expires_at)
     VALUES($1, $2, $3, $4, $5, $6, $7)`,
    [tokenId, approvalRequestId, tokenHash, action, recipientId, recipientEmail, expiresAt]
  );

  logger.info("Token generated", {
    token_id: tokenId,
    approval_request_id: approvalRequestId,
    action,
    recipient_id: recipientId,
    expires_at: expiresAt,
  });

  return { token, tokenHash, expiresAt, tokenId };
}

/**
 * Valide un token et retourne le payload si valide
 */
export async function verifyToken(
  token: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ valid: boolean; payload?: TokenPayload; error?: string }> {
  try {
    // Vérifier signature JWT
    const decoded = jwt.verify(token, SECRET_KEY, {
      algorithms: ["HS256"],
    }) as TokenPayload;

    const tokenHash = hashToken(token);

    // Vérifier en base de données
    const { rows: tokens } = await pool.query(
      `SELECT * FROM email_action_tokens WHERE token_hash = $1 LIMIT 1`,
      [tokenHash]
    );

    if (tokens.length === 0) {
      await logClickAudit(null, decoded.approval_request_id, decoded.action, ipAddress, userAgent, "invalid", "Token not found in database");
      return { valid: false, error: "token_not_found" };
    }

    const tokenRecord = tokens[0];

    // Vérifier si révoqué
    if (tokenRecord.revoked) {
      await logClickAudit(tokenRecord.id, decoded.approval_request_id, decoded.action, ipAddress, userAgent, "revoked", "Token has been revoked");
      return { valid: false, error: "token_revoked" };
    }

    // Vérifier si déjà utilisé
    if (tokenRecord.used_at) {
      await logClickAudit(tokenRecord.id, decoded.approval_request_id, decoded.action, ipAddress, userAgent, "already_used", "Token already used");
      return { valid: false, error: "token_already_used" };
    }

    // Vérifier expiration
    if (new Date() > new Date(tokenRecord.expires_at)) {
      await logClickAudit(tokenRecord.id, decoded.approval_request_id, decoded.action, ipAddress, userAgent, "expired", "Token expired");
      return { valid: false, error: "token_expired" };
    }

    // Marquer comme utilisé
    await pool.query(
      `UPDATE email_action_tokens SET used_at = now(), used_by_ip = $1, used_by_user_agent = $2 WHERE id = $3`,
      [ipAddress, userAgent, tokenRecord.id]
    );

    await logClickAudit(tokenRecord.id, decoded.approval_request_id, decoded.action, ipAddress, userAgent, "success", null);

    logger.info("Token verified successfully", {
      token_id: tokenRecord.id,
      approval_request_id: decoded.approval_request_id,
      action: decoded.action,
    });

    return { valid: true, payload: decoded };
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      await logClickAudit(null, "unknown", "unknown", ipAddress, userAgent, "expired", "JWT expired");
      return { valid: false, error: "token_expired" };
    }

    if (error.name === "JsonWebTokenError") {
      await logClickAudit(null, "unknown", "unknown", ipAddress, userAgent, "invalid", error.message);
      return { valid: false, error: "token_invalid" };
    }

    logger.error("Token verification failed", { error: error.message });
    return { valid: false, error: "verification_failed" };
  }
}

/**
 * Révoquer un token (empêcher son utilisation)
 */
export async function revokeToken(tokenHash: string): Promise<void> {
  await pool.query(
    `UPDATE email_action_tokens SET revoked = true WHERE token_hash = $1`,
    [tokenHash]
  );

  logger.info("Token revoked", { token_hash: tokenHash });
}

/**
 * Révoquer tous les tokens pour une demande d'approbation
 */
export async function revokeAllTokensForRequest(approvalRequestId: string): Promise<void> {
  await pool.query(
    `UPDATE email_action_tokens SET revoked = true WHERE approval_request_id = $1 AND used_at IS NULL`,
    [approvalRequestId]
  );

  logger.info("All tokens revoked for request", { approval_request_id: approvalRequestId });
}

/**
 * Hash un token pour stockage sécurisé
 */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Log click audit
 */
async function logClickAudit(
  tokenId: string | null,
  approvalRequestId: string,
  action: string,
  ipAddress: string | undefined,
  userAgent: string | undefined,
  result: string,
  errorMessage: string | null
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO email_click_audit(token_id, approval_request_id, action, ip_address, user_agent, result, error_message)
       VALUES($1, $2, $3, $4, $5, $6, $7)`,
      [tokenId, approvalRequestId, action, ipAddress, userAgent, result, errorMessage]
    );
  } catch (error: any) {
    logger.error("Failed to log click audit", { error: error.message });
  }
}
