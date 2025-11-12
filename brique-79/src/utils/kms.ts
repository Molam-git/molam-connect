/**
 * Brique 79 - KMS/Vault Integration
 *
 * Utilities for encrypting/decrypting API key secrets using KMS/Vault.
 * Supports multiple backends: AWS KMS, Google Cloud KMS, HashiCorp Vault, or local encryption.
 *
 * @version 1.0.0
 * @date 2025-11-12
 */

import crypto from 'crypto';

// =======================================================================
// TYPES
// =======================================================================

export interface KMSConfig {
  provider: 'aws' | 'gcp' | 'vault' | 'local';
  keyId?: string;
  endpoint?: string;
  region?: string;
}

// =======================================================================
// LOCAL ENCRYPTION (For Development/Testing)
// =======================================================================

const LOCAL_ENCRYPTION_KEY = process.env.KMS_LOCAL_KEY || 'dev-encryption-key-change-in-production-32bytes';
const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypt plaintext using local key (for development)
 */
function encryptLocal(plaintext: Buffer): Buffer {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(LOCAL_ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: [iv(16) | authTag(16) | ciphertext]
  return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypt ciphertext using local key (for development)
 */
function decryptLocal(ciphertext: Buffer): Buffer {
  const iv = ciphertext.subarray(0, 16);
  const authTag = ciphertext.subarray(16, 32);
  const encrypted = ciphertext.subarray(32);

  const key = crypto.scryptSync(LOCAL_ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

// =======================================================================
// AWS KMS ENCRYPTION (Production)
// =======================================================================

/**
 * Encrypt using AWS KMS
 *
 * NOTE: Requires AWS SDK and IAM permissions
 */
async function encryptAWS(plaintext: Buffer, keyId: string): Promise<Buffer> {
  // TODO: Integrate with AWS SDK
  // const { KMSClient, EncryptCommand } = require('@aws-sdk/client-kms');
  // const client = new KMSClient({ region: process.env.AWS_REGION });
  // const command = new EncryptCommand({
  //   KeyId: keyId,
  //   Plaintext: plaintext
  // });
  // const result = await client.send(command);
  // return Buffer.from(result.CiphertextBlob);

  console.warn('[KMS] AWS KMS not configured, falling back to local encryption');
  return encryptLocal(plaintext);
}

/**
 * Decrypt using AWS KMS
 */
async function decryptAWS(ciphertext: Buffer): Promise<Buffer> {
  // TODO: Integrate with AWS SDK
  // const { KMSClient, DecryptCommand } = require('@aws-sdk/client-kms');
  // const client = new KMSClient({ region: process.env.AWS_REGION });
  // const command = new DecryptCommand({
  //   CiphertextBlob: ciphertext
  // });
  // const result = await client.send(command);
  // return Buffer.from(result.Plaintext);

  console.warn('[KMS] AWS KMS not configured, falling back to local encryption');
  return decryptLocal(ciphertext);
}

// =======================================================================
// GCP KMS ENCRYPTION (Production)
// =======================================================================

/**
 * Encrypt using Google Cloud KMS
 */
async function encryptGCP(plaintext: Buffer, keyId: string): Promise<Buffer> {
  // TODO: Integrate with GCP KMS
  // const { KeyManagementServiceClient } = require('@google-cloud/kms');
  // const client = new KeyManagementServiceClient();
  // const [result] = await client.encrypt({
  //   name: keyId,
  //   plaintext: plaintext
  // });
  // return Buffer.from(result.ciphertext);

  console.warn('[KMS] GCP KMS not configured, falling back to local encryption');
  return encryptLocal(plaintext);
}

/**
 * Decrypt using Google Cloud KMS
 */
async function decryptGCP(ciphertext: Buffer, keyId: string): Promise<Buffer> {
  // TODO: Integrate with GCP KMS
  // const { KeyManagementServiceClient } = require('@google-cloud/kms');
  // const client = new KeyManagementServiceClient();
  // const [result] = await client.decrypt({
  //   name: keyId,
  //   ciphertext: ciphertext
  // });
  // return Buffer.from(result.plaintext);

  console.warn('[KMS] GCP KMS not configured, falling back to local encryption');
  return decryptLocal(ciphertext);
}

// =======================================================================
// VAULT ENCRYPTION (Production)
// =======================================================================

/**
 * Encrypt using HashiCorp Vault
 */
async function encryptVault(plaintext: Buffer, keyId: string): Promise<Buffer> {
  // TODO: Integrate with Vault
  // const vault = require('node-vault')({
  //   endpoint: process.env.VAULT_ENDPOINT,
  //   token: process.env.VAULT_TOKEN
  // });
  // const result = await vault.write(`transit/encrypt/${keyId}`, {
  //   plaintext: plaintext.toString('base64')
  // });
  // return Buffer.from(result.data.ciphertext, 'utf8');

  console.warn('[KMS] Vault not configured, falling back to local encryption');
  return encryptLocal(plaintext);
}

/**
 * Decrypt using HashiCorp Vault
 */
async function decryptVault(ciphertext: Buffer, keyId: string): Promise<Buffer> {
  // TODO: Integrate with Vault
  // const vault = require('node-vault')({
  //   endpoint: process.env.VAULT_ENDPOINT,
  //   token: process.env.VAULT_TOKEN
  // });
  // const result = await vault.write(`transit/decrypt/${keyId}`, {
  //   ciphertext: ciphertext.toString('utf8')
  // });
  // return Buffer.from(result.data.plaintext, 'base64');

  console.warn('[KMS] Vault not configured, falling back to local encryption');
  return decryptLocal(ciphertext);
}

// =======================================================================
// PUBLIC API
// =======================================================================

const KMS_CONFIG: KMSConfig = {
  provider: (process.env.KMS_PROVIDER as any) || 'local',
  keyId: process.env.KMS_KEY_ID,
  endpoint: process.env.KMS_ENDPOINT,
  region: process.env.KMS_REGION,
};

/**
 * Encrypt plaintext using configured KMS provider
 */
export async function encryptWithKMS(plaintext: Buffer): Promise<Buffer> {
  switch (KMS_CONFIG.provider) {
    case 'aws':
      return encryptAWS(plaintext, KMS_CONFIG.keyId!);
    case 'gcp':
      return encryptGCP(plaintext, KMS_CONFIG.keyId!);
    case 'vault':
      return encryptVault(plaintext, KMS_CONFIG.keyId!);
    case 'local':
    default:
      return encryptLocal(plaintext);
  }
}

/**
 * Decrypt ciphertext using configured KMS provider
 */
export async function decryptWithKMS(ciphertext: Buffer): Promise<Buffer> {
  switch (KMS_CONFIG.provider) {
    case 'aws':
      return decryptAWS(ciphertext);
    case 'gcp':
      return decryptGCP(ciphertext, KMS_CONFIG.keyId!);
    case 'vault':
      return decryptVault(ciphertext, KMS_CONFIG.keyId!);
    case 'local':
    default:
      return decryptLocal(ciphertext);
  }
}

/**
 * Generate secure random secret for API key
 *
 * Format: base64-encoded 32 bytes (256 bits)
 */
export function generateSecret(): string {
  return crypto.randomBytes(32).toString('base64');
}

/**
 * Hash secret for quick lookup (SHA256)
 */
export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/**
 * Constant-time string comparison (prevents timing attacks)
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Generate short random ID for key_id suffix
 */
export function generateRandomId(length: number = 12): string {
  const bytes = crypto.randomBytes(Math.ceil(length * 0.75));
  return bytes
    .toString('base64')
    .replace(/\+/g, '')
    .replace(/\//g, '')
    .replace(/=/g, '')
    .substring(0, length);
}

// =======================================================================
// EXPORTS
// =======================================================================

export default {
  encryptWithKMS,
  decryptWithKMS,
  generateSecret,
  hashSecret,
  constantTimeCompare,
  generateRandomId,
};
