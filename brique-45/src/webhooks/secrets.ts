// ============================================================================
// Brique 45 - Webhooks Industriels
// Secrets Management (Generation, Encryption, Multi-version Retrieval)
// ============================================================================

import crypto from "crypto";
import { pool } from "../utils/db";
import { encryptWithKMS, decryptWithKMS } from "../utils/kms";

/**
 * Generate a cryptographically secure webhook secret (32 bytes base64)
 */
export function generateSecret(): string {
  return crypto.randomBytes(32).toString("base64");
}

/**
 * Encrypt a secret using KMS/Vault
 */
export async function encryptSecret(secret: string): Promise<Buffer> {
  return encryptWithKMS(Buffer.from(secret, "utf8"));
}

/**
 * Get active and retiring secrets for an endpoint (multi-version support)
 * Returns array sorted by version ASC
 */
export async function getActiveOrRetiringSecrets(endpointId: string): Promise<Array<{
  kid: number;
  secret: string;
  status: string;
}>> {
  const { rows } = await pool.query(
    `SELECT version, status, secret_ciphertext FROM webhook_secrets
     WHERE endpoint_id=$1 AND status IN ('active','retiring') ORDER BY version ASC`,
    [endpointId]
  );

  return rows.map((r: any) => ({
    kid: Number(r.version),
    secret: decryptWithKMS(r.secret_ciphertext).toString("utf8"),
    status: r.status,
  }));
}

/**
 * Get the active secret (highest version with status='active')
 */
export async function getActiveSecret(endpointId: string): Promise<{
  kid: number;
  secret: string;
} | null> {
  const secrets = await getActiveOrRetiringSecrets(endpointId);
  const active = secrets.filter(s => s.status === "active");

  if (active.length === 0) {
    return null;
  }

  // Return the highest version
  const maxKid = Math.max(...active.map(s => s.kid));
  return active.find(s => s.kid === maxKid) || null;
}

/**
 * Rotate secret: create new version and mark previous as 'retiring'
 */
export async function rotateSecret(endpointId: string): Promise<{
  kid: number;
  secret: string;
}> {
  const { rows: [latest] } = await pool.query(
    `SELECT COALESCE(MAX(version),0) AS v FROM webhook_secrets WHERE endpoint_id=$1`,
    [endpointId]
  );

  const newVersion = Number(latest.v) + 1;
  const secret = generateSecret();
  const encrypted = await encryptSecret(secret);

  // Insert new secret
  await pool.query(
    `INSERT INTO webhook_secrets(endpoint_id, version, status, secret_ciphertext)
     VALUES ($1,$2,'active',$3)`,
    [endpointId, newVersion, encrypted]
  );

  // Mark previous as 'retiring' (grace period)
  if (newVersion > 1) {
    await pool.query(
      `UPDATE webhook_secrets SET status='retiring' WHERE endpoint_id=$1 AND version=$2`,
      [endpointId, newVersion - 1]
    );
  }

  return { kid: newVersion, secret };
}

/**
 * Revoke a specific secret version
 */
export async function revokeSecret(endpointId: string, version: number): Promise<void> {
  await pool.query(
    `UPDATE webhook_secrets SET status='revoked' WHERE endpoint_id=$1 AND version=$2`,
    [endpointId, version]
  );
}
