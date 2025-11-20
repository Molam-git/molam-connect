/**
 * BRIQUE 140 — Vault/KMS wrapper for secret management
 *
 * DEV/STUB Implementation:
 * In production, replace with:
 * - HashiCorp Vault (KV v2)
 * - AWS KMS / Secrets Manager
 * - GCP Secret Manager
 * - Azure Key Vault
 * - HSM for signing operations
 */

import crypto from 'crypto';
import { pool } from '../db';

const ENC_KEY = process.env.VAULT_DEV_KEY || 'dev-32-char-key-please-change!!';

/**
 * Generate cryptographically secure random string
 */
export async function vaultGenerateRandom(bytes: number = 48): Promise<string> {
  return crypto.randomBytes(bytes).toString('base64');
}

/**
 * Encrypt data using AES-256-GCM
 */
function encrypt(buf: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    Buffer.from(ENC_KEY.slice(0, 32)),
    iv
  );
  const ct = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

/**
 * Decrypt AES-256-GCM encrypted data
 */
function decrypt(enc: string): string {
  const b = Buffer.from(enc, 'base64');
  const iv = b.slice(0, 12);
  const tag = b.slice(12, 28);
  const ct = b.slice(28);
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(ENC_KEY.slice(0, 32)),
    iv
  );
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString('utf8');
}

/**
 * Store secret in Vault
 * Path format: dev/keys/{key_id}/v{kid}
 */
export async function vaultPutSecret(
  path: string,
  payload: { secret: string }
): Promise<boolean> {
  // Create vault_dev_secrets table if not exists (dev only)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vault_dev_secrets (
      path TEXT PRIMARY KEY,
      ciphertext TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      accessed_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  const enc = encrypt(Buffer.from(payload.secret, 'utf8'));
  await pool.query(
    `INSERT INTO vault_dev_secrets(path, ciphertext)
     VALUES ($1, $2)
     ON CONFLICT (path)
     DO UPDATE SET ciphertext = $2, created_at = now()`,
    [path, enc]
  );

  console.log(`[Vault] Secret stored at path: ${path}`);
  return true;
}

/**
 * Retrieve secret from Vault
 */
export async function vaultGetSecret(path: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT ciphertext FROM vault_dev_secrets WHERE path = $1`,
    [path]
  );

  if (!rows.length) {
    console.warn(`[Vault] Secret not found at path: ${path}`);
    return null;
  }

  // Update accessed_at
  await pool.query(
    `UPDATE vault_dev_secrets SET accessed_at = now() WHERE path = $1`,
    [path]
  );

  try {
    return decrypt(rows[0].ciphertext);
  } catch (error) {
    console.error(`[Vault] Failed to decrypt secret at path: ${path}`, error);
    return null;
  }
}

/**
 * Get all active or retiring secrets for a key (for rotation support)
 */
export async function getActiveOrRetiringSecrets(
  keyId: string
): Promise<Array<{ kid: number; secret: string }>> {
  const { rows } = await pool.query(
    `SELECT kid FROM dev_app_keys
     WHERE key_id = $1 AND status IN ('active', 'retiring')
     ORDER BY kid ASC`,
    [keyId]
  );

  const secrets: Array<{ kid: number; secret: string }> = [];

  for (const r of rows) {
    const path = `dev/keys/${keyId}/v${r.kid}`;
    const secret = await vaultGetSecret(path);
    if (secret) {
      secrets.push({ kid: Number(r.kid), secret });
    }
  }

  return secrets;
}

/**
 * Delete secret from Vault (revocation)
 */
export async function vaultDeleteSecret(path: string): Promise<boolean> {
  await pool.query(`DELETE FROM vault_dev_secrets WHERE path = $1`, [path]);
  console.log(`[Vault] Secret deleted at path: ${path}`);
  return true;
}

/**
 * List all secrets for a key (for audit)
 */
export async function vaultListKeySecrets(keyId: string): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT path FROM vault_dev_secrets WHERE path LIKE $1 ORDER BY path`,
    [`dev/keys/${keyId}%`]
  );
  return rows.map((r) => r.path);
}
