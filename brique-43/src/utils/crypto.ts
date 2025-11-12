/**
 * Brique 43 - Checkout Orchestration
 * Encryption/Decryption for Payment Method Vault
 *
 * Envelope encryption (AES-256-GCM), HSM-ready
 */

import crypto from "crypto";

const ENC_ALG = "aes-256-gcm";
const KMS_KEY = Buffer.from(process.env.VAULT_DATA_KEY as string, "base64"); // 32 bytes

if (!process.env.VAULT_DATA_KEY) {
  throw new Error("VAULT_DATA_KEY environment variable is required");
}

if (KMS_KEY.length !== 32) {
  throw new Error("VAULT_DATA_KEY must be 32 bytes (base64-encoded 44 characters)");
}

/**
 * Encrypt payment method data
 * Format: [12 bytes IV][16 bytes Auth Tag][N bytes encrypted data]
 */
export function encryptPayload(plaintext: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENC_ALG, KMS_KEY, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypt payment method data
 */
export function decryptPayload(cipherBlob: Buffer): Buffer {
  if (cipherBlob.length < 28) {
    throw new Error("Invalid cipher blob: too short");
  }

  const iv = cipherBlob.subarray(0, 12);
  const authTag = cipherBlob.subarray(12, 28);
  const encrypted = cipherBlob.subarray(28);

  const decipher = crypto.createDecipheriv(ENC_ALG, KMS_KEY, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/**
 * Hash holder information for deduplication
 */
export function hashHolder(holderName: string, customerRef: string): string {
  return crypto
    .createHash("sha256")
    .update(`${holderName}|${customerRef}`)
    .digest("hex");
}

/**
 * Generate secure API key
 */
export function generateApiKey(): { id: string; secret: string; hash: string } {
  const id = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(secret).digest("hex");

  return { id, secret, hash };
}

/**
 * Verify API key secret
 */
export function verifyApiKeySecret(secret: string, hash: string): boolean {
  const computedHash = crypto.createHash("sha256").update(secret).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(hash));
}

/**
 * Generate customer token (opaque)
 */
export function generateCustomerToken(): string {
  return `tok_${crypto.randomBytes(24).toString("base64url")}`;
}

/**
 * Generate webhook secret
 */
export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString("base64url")}`;
}

/**
 * Sign webhook payload (HMAC-SHA256)
 */
export function signWebhook(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = signWebhook(payload, secret);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}
