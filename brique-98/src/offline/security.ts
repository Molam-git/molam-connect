/**
 * Brique 98 — Offline Security Utilities
 *
 * Handles device signature verification, bundle encryption/decryption,
 * and anti-replay protection for offline payment bundles.
 *
 * Security features:
 * - ECDSA/RSA signature verification
 * - AES-256-GCM encryption with KMS key wrapping
 * - Nonce-based replay protection
 * - Clock skew validation
 */

import crypto from 'crypto';
import { decrypt as kmsDecrypt, encrypt as kmsEncrypt } from '../../brique-97/src/utils/crypto';

// =====================================================================
// Device Signature Verification
// =====================================================================

/**
 * Verify device signature over payload
 *
 * Supports both ECDSA (recommended) and RSA signatures
 *
 * @param pubkeyPem - Device public key in PEM format
 * @param payload - Data that was signed (encrypted bundle)
 * @param signature - Signature bytes
 * @returns true if signature is valid
 */
export function verifyDeviceSignature(
  pubkeyPem: string,
  payload: Buffer,
  signature: Buffer
): boolean {
  try {
    // Determine key type (ECDSA or RSA) from PEM header
    const isECDSA = pubkeyPem.includes('BEGIN EC PUBLIC KEY') || pubkeyPem.includes('BEGIN PUBLIC KEY');

    const verify = crypto.createVerify('SHA256');
    verify.update(payload);
    verify.end();

    return verify.verify(pubkeyPem, signature);
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Sign payload with device private key (for SDK use)
 *
 * @param privateKeyPem - Device private key in PEM format
 * @param payload - Data to sign
 * @returns Signature buffer
 */
export function signPayload(privateKeyPem: string, payload: Buffer): Buffer {
  const sign = crypto.createSign('SHA256');
  sign.update(payload);
  sign.end();

  return sign.sign(privateKeyPem);
}

// =====================================================================
// Bundle Encryption/Decryption
// =====================================================================

/**
 * Encrypted bundle structure
 */
export interface EncryptedBundle {
  key_wrapped: string; // Base64 KMS-wrapped AES key
  iv: string; // Base64 IV
  tag: string; // Base64 auth tag
  cipher: string; // Base64 encrypted data
}

/**
 * Bundle payload structure (after decryption)
 */
export interface BundlePayload {
  bundle_id: string;
  transactions: OfflineTransaction[];
  nonce: string; // Anti-replay nonce
  device_clock: string; // ISO timestamp from device
  device_id?: string;
  metadata?: Record<string, any>;
}

export interface OfflineTransaction {
  local_id: string; // Device-generated transaction ID
  type: 'p2p' | 'merchant' | 'cashin' | 'cashout' | 'agent';
  amount: number;
  currency: string;
  sender: string; // User ID or phone
  receiver: string; // User ID, merchant ID, or phone
  merchant_id?: string;
  initiated_at: string; // ISO timestamp
  meta?: Record<string, any>;
}

/**
 * Encrypt bundle payload (for SDK use)
 *
 * @param payload - Bundle payload object
 * @returns Encrypted bundle structure
 */
export async function encryptBundle(payload: BundlePayload): Promise<EncryptedBundle> {
  // Generate random AES-256 key
  const aesKey = crypto.randomBytes(32);

  // Generate random IV (12 bytes for GCM)
  const iv = crypto.randomBytes(12);

  // Encrypt payload with AES-GCM
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Wrap AES key with KMS
  const keyWrapped = await kmsEncrypt(aesKey);

  return {
    key_wrapped: keyWrapped.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    cipher: encrypted.toString('base64'),
  };
}

/**
 * Decrypt bundle payload (server-side)
 *
 * @param encryptedPayload - Encrypted bundle bytes or JSON string
 * @returns Decrypted bundle payload
 */
export async function decryptBundle(encryptedPayload: Buffer | string): Promise<BundlePayload> {
  try {
    // Parse encrypted bundle structure
    const bundleStr = typeof encryptedPayload === 'string' ? encryptedPayload : encryptedPayload.toString('utf8');
    const bundle: EncryptedBundle = JSON.parse(bundleStr);

    // Unwrap AES key with KMS
    const keyWrappedBuffer = Buffer.from(bundle.key_wrapped, 'base64');
    const aesKey = await kmsDecrypt(keyWrappedBuffer);

    // Extract IV, tag, and ciphertext
    const iv = Buffer.from(bundle.iv, 'base64');
    const tag = Buffer.from(bundle.tag, 'base64');
    const ciphertext = Buffer.from(bundle.cipher, 'base64');

    // Decrypt with AES-GCM
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    // Parse JSON payload
    const payload: BundlePayload = JSON.parse(decrypted.toString('utf8'));

    // Validate required fields
    if (!payload.bundle_id || !payload.transactions || !payload.nonce) {
      throw new Error('Invalid bundle payload structure');
    }

    return payload;
  } catch (error: any) {
    console.error('Bundle decryption error:', error);
    throw new Error(`Failed to decrypt bundle: ${error.message}`);
  }
}

// =====================================================================
// Anti-Replay Protection
// =====================================================================

/**
 * Nonce store (in-memory - use Redis in production)
 */
const usedNonces = new Set<string>();
const NONCE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if nonce has been used (replay protection)
 *
 * @param nonce - Nonce from bundle
 * @returns true if nonce is fresh (not used before)
 */
export function checkNonce(nonce: string): boolean {
  if (usedNonces.has(nonce)) {
    return false; // Replay detected
  }

  // Mark nonce as used
  usedNonces.add(nonce);

  // Schedule cleanup (in production, use Redis with TTL)
  setTimeout(() => {
    usedNonces.delete(nonce);
  }, NONCE_TTL_MS);

  return true;
}

/**
 * Generate nonce (for SDK use)
 *
 * @returns Random nonce string
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

// =====================================================================
// Clock Skew Validation
// =====================================================================

/**
 * Validate device clock against server clock
 *
 * @param deviceClock - ISO timestamp from device
 * @param maxSkewMinutes - Maximum allowed skew in minutes
 * @returns Object with validation result
 */
export function validateClockSkew(
  deviceClock: string,
  maxSkewMinutes: number = 30
): { valid: boolean; skewMinutes: number } {
  try {
    const deviceTime = new Date(deviceClock).getTime();
    const serverTime = Date.now();

    const skewMs = Math.abs(serverTime - deviceTime);
    const skewMinutes = skewMs / (60 * 1000);

    return {
      valid: skewMinutes <= maxSkewMinutes,
      skewMinutes: Math.round(skewMinutes),
    };
  } catch (error) {
    return {
      valid: false,
      skewMinutes: Infinity,
    };
  }
}

// =====================================================================
// Bundle Age Validation
// =====================================================================

/**
 * Check if bundle is within acceptable age
 *
 * @param initiatedAt - ISO timestamp when bundle was created
 * @param maxAgeHours - Maximum allowed age in hours
 * @returns Object with validation result
 */
export function validateBundleAge(
  initiatedAt: string,
  maxAgeHours: number = 72
): { valid: boolean; ageHours: number } {
  try {
    const bundleTime = new Date(initiatedAt).getTime();
    const serverTime = Date.now();

    const ageMs = serverTime - bundleTime;
    const ageHours = ageMs / (60 * 60 * 1000);

    return {
      valid: ageHours >= 0 && ageHours <= maxAgeHours,
      ageHours: Math.round(ageHours * 10) / 10,
    };
  } catch (error) {
    return {
      valid: false,
      ageHours: Infinity,
    };
  }
}

// =====================================================================
// HMAC Utilities (Alternative to Signatures)
// =====================================================================

/**
 * Generate HMAC for payload (alternative to signatures)
 *
 * @param payload - Data to authenticate
 * @param secret - Shared secret key
 * @returns HMAC buffer
 */
export function generateHMAC(payload: Buffer, secret: string): Buffer {
  return crypto.createHmac('sha256', secret).update(payload).digest();
}

/**
 * Verify HMAC
 *
 * @param payload - Data that was authenticated
 * @param hmac - HMAC to verify
 * @param secret - Shared secret key
 * @returns true if HMAC is valid
 */
export function verifyHMAC(payload: Buffer, hmac: Buffer, secret: string): boolean {
  const expected = generateHMAC(payload, secret);
  return crypto.timingSafeEqual(expected, hmac);
}

// =====================================================================
// Key Pair Generation (For Testing/Setup)
// =====================================================================

/**
 * Generate ECDSA key pair (for device registration)
 *
 * @returns Object with private and public keys in PEM format
 */
export function generateECDSAKeyPair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1', // P-256
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return {
    privateKey,
    publicKey,
  };
}

/**
 * Generate RSA key pair (alternative to ECDSA)
 *
 * @returns Object with private and public keys in PEM format
 */
export function generateRSAKeyPair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return {
    privateKey,
    publicKey,
  };
}

// =====================================================================
// Bundle Validation
// =====================================================================

/**
 * Comprehensive bundle validation
 *
 * @param payload - Decrypted bundle payload
 * @param options - Validation options
 * @returns Validation result
 */
export function validateBundle(
  payload: BundlePayload,
  options: {
    maxClockSkewMinutes?: number;
    maxBundleAgeHours?: number;
    requireNonceCheck?: boolean;
  } = {}
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Required fields
  if (!payload.bundle_id) {
    errors.push('Missing bundle_id');
  }

  if (!payload.transactions || !Array.isArray(payload.transactions) || payload.transactions.length === 0) {
    errors.push('Missing or empty transactions array');
  }

  if (!payload.nonce) {
    errors.push('Missing nonce');
  }

  if (!payload.device_clock) {
    errors.push('Missing device_clock');
  }

  // Nonce check (replay protection)
  if (options.requireNonceCheck !== false && payload.nonce) {
    if (!checkNonce(payload.nonce)) {
      errors.push('Nonce already used (replay detected)');
    }
  }

  // Clock skew validation
  if (payload.device_clock) {
    const clockSkew = validateClockSkew(payload.device_clock, options.maxClockSkewMinutes);
    if (!clockSkew.valid) {
      errors.push(`Clock skew too large: ${clockSkew.skewMinutes} minutes`);
    }
  }

  // Bundle age validation (use oldest transaction timestamp)
  if (payload.transactions && payload.transactions.length > 0) {
    const oldestTx = payload.transactions.reduce((oldest, tx) =>
      new Date(tx.initiated_at) < new Date(oldest.initiated_at) ? tx : oldest
    );

    const bundleAge = validateBundleAge(oldestTx.initiated_at, options.maxBundleAgeHours);
    if (!bundleAge.valid) {
      errors.push(`Bundle too old: ${bundleAge.ageHours} hours (max: ${options.maxBundleAgeHours || 72})`);
    }
  }

  // Validate each transaction
  payload.transactions?.forEach((tx, index) => {
    if (!tx.local_id) {
      errors.push(`Transaction ${index}: Missing local_id`);
    }

    if (!tx.type || !['p2p', 'merchant', 'cashin', 'cashout', 'agent'].includes(tx.type)) {
      errors.push(`Transaction ${index}: Invalid type`);
    }

    if (!tx.amount || tx.amount <= 0) {
      errors.push(`Transaction ${index}: Invalid amount`);
    }

    if (!tx.currency) {
      errors.push(`Transaction ${index}: Missing currency`);
    }

    if (!tx.sender) {
      errors.push(`Transaction ${index}: Missing sender`);
    }

    if (!tx.receiver) {
      errors.push(`Transaction ${index}: Missing receiver`);
    }

    if (!tx.initiated_at) {
      errors.push(`Transaction ${index}: Missing initiated_at`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =====================================================================
// Export all utilities
// =====================================================================

export default {
  verifyDeviceSignature,
  signPayload,
  encryptBundle,
  decryptBundle,
  checkNonce,
  generateNonce,
  validateClockSkew,
  validateBundleAge,
  generateHMAC,
  verifyHMAC,
  generateECDSAKeyPair,
  generateRSAKeyPair,
  validateBundle,
};
