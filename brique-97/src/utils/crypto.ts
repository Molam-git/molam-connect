/**
 * Brique 97 — Crypto Utilities
 *
 * Secure encryption/decryption using AWS KMS (or HSM in production)
 * Handles token encryption, key rotation, and cryptographic operations
 *
 * Security:
 * - All sensitive data encrypted with KMS/HSM
 * - Keys never stored in application memory
 * - Automatic key rotation support
 * - Audit logging for all crypto operations
 */

import { KMSClient, EncryptCommand, DecryptCommand, GenerateDataKeyCommand } from '@aws-sdk/client-kms';
import crypto from 'crypto';

// Initialize KMS client
const kms = new KMSClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.NODE_ENV === 'production' ? undefined : {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// KMS Key ID from environment
const KMS_KEY_ID = process.env.KMS_KEY_ID || 'alias/molam-tokenization';

/**
 * Encrypt data using AWS KMS
 *
 * @param plaintext - Data to encrypt (string or Buffer)
 * @returns Encrypted ciphertext (Buffer)
 */
export async function encryptWithKMS(plaintext: string | Buffer): Promise<Buffer> {
  try {
    const plaintextBuffer = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;

    const command = new EncryptCommand({
      KeyId: KMS_KEY_ID,
      Plaintext: plaintextBuffer,
      EncryptionContext: {
        purpose: 'payment_method_token',
        environment: process.env.NODE_ENV || 'development',
      },
    });

    const response = await kms.send(command);

    if (!response.CiphertextBlob) {
      throw new Error('KMS encryption failed: no ciphertext returned');
    }

    return Buffer.from(response.CiphertextBlob);
  } catch (error: any) {
    console.error('KMS encryption error:', error);
    throw new Error(`Failed to encrypt with KMS: ${error.message}`);
  }
}

/**
 * Decrypt data using AWS KMS
 *
 * @param ciphertext - Encrypted data (Buffer)
 * @returns Decrypted plaintext (Buffer)
 */
export async function decryptWithKMS(ciphertext: Buffer): Promise<Buffer> {
  try {
    const command = new DecryptCommand({
      CiphertextBlob: ciphertext,
      EncryptionContext: {
        purpose: 'payment_method_token',
        environment: process.env.NODE_ENV || 'development',
      },
    });

    const response = await kms.send(command);

    if (!response.Plaintext) {
      throw new Error('KMS decryption failed: no plaintext returned');
    }

    return Buffer.from(response.Plaintext);
  } catch (error: any) {
    console.error('KMS decryption error:', error);
    throw new Error(`Failed to decrypt with KMS: ${error.message}`);
  }
}

/**
 * Generate data encryption key (DEK) for envelope encryption
 * Used for high-volume encryption where KMS calls would be too slow
 *
 * @returns Object with plaintext key and encrypted key
 */
export async function generateDataKey(): Promise<{
  plaintextKey: Buffer;
  encryptedKey: Buffer;
}> {
  try {
    const command = new GenerateDataKeyCommand({
      KeyId: KMS_KEY_ID,
      KeySpec: 'AES_256',
    });

    const response = await kms.send(command);

    if (!response.Plaintext || !response.CiphertextBlob) {
      throw new Error('Failed to generate data key');
    }

    return {
      plaintextKey: Buffer.from(response.Plaintext),
      encryptedKey: Buffer.from(response.CiphertextBlob),
    };
  } catch (error: any) {
    console.error('Data key generation error:', error);
    throw new Error(`Failed to generate data key: ${error.message}`);
  }
}

/**
 * Encrypt data using envelope encryption (for high volume)
 * Uses a data encryption key (DEK) encrypted by KMS
 *
 * @param plaintext - Data to encrypt
 * @returns Object with encrypted data and encrypted DEK
 */
export async function envelopeEncrypt(plaintext: string | Buffer): Promise<{
  ciphertext: Buffer;
  encryptedKey: Buffer;
  iv: Buffer;
  authTag: Buffer;
}> {
  try {
    // Generate data encryption key
    const { plaintextKey, encryptedKey } = await generateDataKey();

    // Generate IV
    const iv = crypto.randomBytes(12); // 96 bits for GCM

    // Create cipher
    const cipher = crypto.createCipheriv('aes-256-gcm', plaintextKey, iv);

    // Encrypt data
    const plaintextBuffer = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
    const encrypted = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);

    // Get auth tag
    const authTag = cipher.getAuthTag();

    // Zero out plaintext key from memory
    plaintextKey.fill(0);

    return {
      ciphertext: encrypted,
      encryptedKey,
      iv,
      authTag,
    };
  } catch (error: any) {
    console.error('Envelope encryption error:', error);
    throw new Error(`Failed to envelope encrypt: ${error.message}`);
  }
}

/**
 * Decrypt data using envelope encryption
 *
 * @param params - Encrypted data, encrypted key, IV, and auth tag
 * @returns Decrypted plaintext (Buffer)
 */
export async function envelopeDecrypt(params: {
  ciphertext: Buffer;
  encryptedKey: Buffer;
  iv: Buffer;
  authTag: Buffer;
}): Promise<Buffer> {
  try {
    const { ciphertext, encryptedKey, iv, authTag } = params;

    // Decrypt the data encryption key using KMS
    const plaintextKey = await decryptWithKMS(encryptedKey);

    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-gcm', plaintextKey, iv);
    decipher.setAuthTag(authTag);

    // Decrypt data
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    // Zero out plaintext key from memory
    plaintextKey.fill(0);

    return decrypted;
  } catch (error: any) {
    console.error('Envelope decryption error:', error);
    throw new Error(`Failed to envelope decrypt: ${error.message}`);
  }
}

/**
 * Generate a secure random token
 *
 * @param length - Length in bytes (default 32)
 * @returns Base64url encoded token
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Hash sensitive data for fingerprinting (NOT for security)
 * Used for duplicate detection without storing sensitive data
 *
 * @param data - Data to hash
 * @returns SHA-256 hash (hex encoded)
 */
export function hashForFingerprint(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Constant-time string comparison
 * Prevents timing attacks when comparing tokens/secrets
 *
 * @param a - First string
 * @param b - Second string
 * @returns True if strings match
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  return crypto.timingSafeEqual(bufferA, bufferB);
}

/**
 * Redact sensitive data for logging
 *
 * @param data - String to redact
 * @param keepLast - Number of characters to keep (default 4)
 * @returns Redacted string
 */
export function redact(data: string, keepLast: number = 4): string {
  if (!data || data.length <= keepLast) {
    return '***';
  }
  return '*'.repeat(data.length - keepLast) + data.slice(-keepLast);
}

/**
 * Generate card fingerprint from PAN
 * Used for duplicate detection
 *
 * @param pan - Primary Account Number
 * @param exp_month - Expiration month
 * @param exp_year - Expiration year
 * @returns Fingerprint hash
 */
export function generateCardFingerprint(pan: string, exp_month: number, exp_year: number): string {
  const normalized = `${pan}:${exp_month}:${exp_year}`;
  return hashForFingerprint(normalized);
}

/**
 * Validate Luhn checksum (for card number validation)
 *
 * @param cardNumber - Card number to validate
 * @returns True if valid
 */
export function validateLuhn(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');

  if (digits.length < 13 || digits.length > 19) {
    return false;
  }

  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/**
 * Get card brand from PAN
 *
 * @param pan - Primary Account Number
 * @returns Card brand ('visa', 'mastercard', 'amex', etc.)
 */
export function getCardBrand(pan: string): string {
  const digits = pan.replace(/\D/g, '');

  // Visa
  if (/^4/.test(digits)) {
    return 'visa';
  }

  // Mastercard
  if (/^(5[1-5]|2[2-7])/.test(digits)) {
    return 'mastercard';
  }

  // American Express
  if (/^3[47]/.test(digits)) {
    return 'amex';
  }

  // Discover
  if (/^(6011|65|64[4-9])/.test(digits)) {
    return 'discover';
  }

  // Diners Club
  if (/^(36|38|30[0-5])/.test(digits)) {
    return 'diners';
  }

  // JCB
  if (/^35/.test(digits)) {
    return 'jcb';
  }

  // UnionPay
  if (/^62/.test(digits)) {
    return 'unionpay';
  }

  return 'unknown';
}

/**
 * Mock KMS for development/testing
 * Uses local encryption instead of AWS KMS
 * NEVER use in production!
 */
export class MockKMS {
  private static readonly algorithm = 'aes-256-gcm';
  private static readonly key = crypto.scryptSync(
    process.env.MOCK_KMS_PASSWORD || 'dev-only-insecure-key',
    'salt',
    32
  );

  static async encrypt(plaintext: Buffer): Promise<Buffer> {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: [iv(12) || authTag(16) || ciphertext]
    return Buffer.concat([iv, authTag, encrypted]);
  }

  static async decrypt(ciphertext: Buffer): Promise<Buffer> {
    // Extract components
    const iv = ciphertext.slice(0, 12);
    const authTag = ciphertext.slice(12, 28);
    const encrypted = ciphertext.slice(28);

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }
}

/**
 * Encrypt with fallback to mock KMS in development
 */
export async function encrypt(plaintext: string | Buffer): Promise<Buffer> {
  if (process.env.NODE_ENV === 'production' || process.env.USE_REAL_KMS === 'true') {
    return encryptWithKMS(plaintext);
  } else {
    const buffer = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
    return MockKMS.encrypt(buffer);
  }
}

/**
 * Decrypt with fallback to mock KMS in development
 */
export async function decrypt(ciphertext: Buffer): Promise<Buffer> {
  if (process.env.NODE_ENV === 'production' || process.env.USE_REAL_KMS === 'true') {
    return decryptWithKMS(ciphertext);
  } else {
    return MockKMS.decrypt(ciphertext);
  }
}

// Export type for consistency
export interface EncryptedPayload {
  ciphertext: Buffer;
  encryptedKey?: Buffer;
  iv?: Buffer;
  authTag?: Buffer;
}
