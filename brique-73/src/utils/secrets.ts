/**
 * Secrets Management - Vault/KMS Integration
 * Brique 73 - Developer Console
 */

import crypto from 'crypto';
import axios from 'axios';
import bcrypt from 'bcrypt';

// ========================================
// API Key Secret Generation
// ========================================

/**
 * Generate a cryptographically secure API key secret
 */
export function generateApiKeySecret(length: number = 48): string {
  const prefix = 'mk_'; // Molam Key prefix
  const randomBytes = crypto.randomBytes(length);
  const secret = prefix + randomBytes.toString('base64url');
  return secret;
}

/**
 * Generate a key ID (kid)
 */
export function generateKeyId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(8).toString('base64url');
  return `${timestamp}-${random}`;
}

// ========================================
// Hashing (for quick validation)
// ========================================

/**
 * Hash secret with bcrypt for fast validation
 */
export async function hashSecret(secret: string): Promise<string> {
  const rounds = parseInt(process.env.API_KEY_HASH_ROUNDS || '12', 10);
  return await bcrypt.hash(secret, rounds);
}

/**
 * Verify secret against hash
 */
export async function verifySecret(secret: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(secret, hash);
}

// ========================================
// Encryption (Vault Integration)
// ========================================

/**
 * Encrypt secret with Vault
 * In production, this calls Hashicorp Vault or AWS KMS
 * For development, uses local AES-256-GCM encryption
 */
export async function encryptWithVault(plaintext: string): Promise<Buffer> {
  const vaultUrl = process.env.VAULT_URL;

  if (vaultUrl && process.env.NODE_ENV === 'production') {
    // Production: Use real Vault
    try {
      const response = await axios.post(
        `${vaultUrl}/v1/transit/encrypt/molam-api-keys`,
        { plaintext: Buffer.from(plaintext).toString('base64') },
        {
          headers: {
            'X-Vault-Token': process.env.VAULT_TOKEN || '',
          },
          timeout: 5000,
        }
      );

      return Buffer.from(response.data.data.ciphertext);
    } catch (error) {
      console.error('Vault encryption error', error);
      throw new Error('Failed to encrypt secret with Vault');
    }
  } else {
    // Development: Local encryption
    return encryptLocal(plaintext);
  }
}

/**
 * Decrypt secret with Vault
 */
export async function decryptWithVault(ciphertext: Buffer): Promise<string> {
  const vaultUrl = process.env.VAULT_URL;

  if (vaultUrl && process.env.NODE_ENV === 'production') {
    // Production: Use real Vault
    try {
      const response = await axios.post(
        `${vaultUrl}/v1/transit/decrypt/molam-api-keys`,
        { ciphertext: ciphertext.toString() },
        {
          headers: {
            'X-Vault-Token': process.env.VAULT_TOKEN || '',
          },
          timeout: 5000,
        }
      );

      return Buffer.from(response.data.data.plaintext, 'base64').toString();
    } catch (error) {
      console.error('Vault decryption error', error);
      throw new Error('Failed to decrypt secret with Vault');
    }
  } else {
    // Development: Local decryption
    return decryptLocal(ciphertext);
  }
}

// ========================================
// Local Encryption (Development Only)
// ========================================

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters');
  }
  return crypto.scryptSync(key, 'salt', 32);
}

function encryptLocal(plaintext: string): Buffer {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const authTag = cipher.getAuthTag();

  // Format: [iv(16)][authTag(16)][ciphertext]
  return Buffer.concat([iv, authTag, encrypted]);
}

function decryptLocal(ciphertext: Buffer): string {
  const key = getEncryptionKey();

  // Extract components
  const iv = ciphertext.slice(0, 16);
  const authTag = ciphertext.slice(16, 32);
  const encrypted = ciphertext.slice(32);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}

// ========================================
// Webhook Secret Generation
// ========================================

/**
 * Generate webhook signing secret
 */
export function generateWebhookSecret(): string {
  return 'whsec_' + crypto.randomBytes(32).toString('base64url');
}

/**
 * Sign webhook payload with secret
 */
export function signWebhookPayload(
  payload: string,
  secret: string,
  timestamp: number
): string {
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  return `v1=${signature}`;
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  timestamp: number,
  tolerance: number = 300000 // 5 minutes
): boolean {
  // Check timestamp tolerance
  const now = Date.now();
  if (Math.abs(now - timestamp) > tolerance) {
    return false;
  }

  // Verify signature
  const expectedSignature = signWebhookPayload(payload, secret, timestamp);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// ========================================
// OAuth Client Secret Generation
// ========================================

/**
 * Generate OAuth client secret
 */
export function generateClientSecret(): string {
  return 'cs_' + crypto.randomBytes(32).toString('base64url');
}

// ========================================
// Key Rotation Helpers
// ========================================

/**
 * Check if key should be rotated based on age
 */
export function shouldRotateKey(createdAt: Date, maxAgeDays: number = 90): boolean {
  const age = Date.now() - createdAt.getTime();
  const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
  return age >= maxAge;
}

/**
 * Generate rotation warning date
 */
export function getRotationWarningDate(createdAt: Date, maxAgeDays: number = 90): Date {
  const warningDays = maxAgeDays - 7; // 7 days before expiry
  const warningDate = new Date(createdAt);
  warningDate.setDate(warningDate.getDate() + warningDays);
  return warningDate;
}
