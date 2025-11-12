// ============================================================================
// Brique 45 - Webhooks Industriels
// KMS/Vault Integration for Secret Encryption
// ============================================================================

import crypto from "crypto";

const VAULT_TYPE = process.env.VAULT_TYPE || "local";
const VAULT_DATA_KEY = process.env.VAULT_DATA_KEY || "";

// For production: integrate with AWS KMS, GCP KMS, or HashiCorp Vault
// For development: simple AES-256-GCM with app-level key

const ENC_ALG = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getDataKey(): Buffer {
  if (!VAULT_DATA_KEY) {
    throw new Error("VAULT_DATA_KEY not configured. Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"");
  }
  return Buffer.from(VAULT_DATA_KEY, "base64");
}

/**
 * Encrypt secret with AES-256-GCM
 * Format: [12 IV][16 AuthTag][N encrypted]
 */
export function encryptWithKMS(plaintext: Buffer): Buffer {
  if (VAULT_TYPE === "local") {
    const key = getDataKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENC_ALG, key, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, encrypted]);
  }

  // TODO: Implement AWS KMS, GCP KMS, Vault integration
  throw new Error(`VAULT_TYPE ${VAULT_TYPE} not implemented`);
}

/**
 * Decrypt secret with AES-256-GCM
 * Format: [12 IV][16 AuthTag][N encrypted]
 */
export function decryptWithKMS(ciphertext: Buffer): Buffer {
  if (VAULT_TYPE === "local") {
    const key = getDataKey();
    const iv = ciphertext.subarray(0, IV_LENGTH);
    const authTag = ciphertext.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = ciphertext.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ENC_ALG, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  // TODO: Implement AWS KMS, GCP KMS, Vault integration
  throw new Error(`VAULT_TYPE ${VAULT_TYPE} not implemented`);
}
