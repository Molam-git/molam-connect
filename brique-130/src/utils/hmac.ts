// ============================================================================
// HMAC Signature for Audit Logs
// ============================================================================

import crypto from "crypto";

const AUDIT_SECRET = process.env.AUDIT_SECRET || "default-audit-secret-change-in-production";

/**
 * Sign audit log payload with HMAC SHA-256
 */
export function signAudit(payload: any): string {
  const serialized = JSON.stringify(payload);
  return crypto.createHmac("sha256", AUDIT_SECRET).update(serialized).digest("hex");
}

/**
 * Verify audit log signature
 */
export function verifyAudit(payload: any, signature: string): boolean {
  const expected = signAudit(payload);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/**
 * Generate checksum for export file
 */
export function generateChecksum(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}
