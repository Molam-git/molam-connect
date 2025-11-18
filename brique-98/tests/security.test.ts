/**
 * Brique 98 — Security Utilities Tests
 *
 * Tests for device signature verification, bundle encryption/decryption,
 * nonce checking, and validation functions.
 */

import {
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
  BundlePayload,
  OfflineTransaction,
} from '../src/offline/security';

describe('Device Signature Verification', () => {
  let keyPair: { privateKey: string; publicKey: string };
  let testPayload: Buffer;

  beforeAll(() => {
    keyPair = generateECDSAKeyPair();
    testPayload = Buffer.from('test payload data', 'utf8');
  });

  test('should generate ECDSA key pair', () => {
    expect(keyPair.privateKey).toContain('BEGIN PRIVATE KEY');
    expect(keyPair.publicKey).toContain('BEGIN PUBLIC KEY');
  });

  test('should generate RSA key pair', () => {
    const rsaKeyPair = generateRSAKeyPair();
    expect(rsaKeyPair.privateKey).toContain('BEGIN PRIVATE KEY');
    expect(rsaKeyPair.publicKey).toContain('BEGIN PUBLIC KEY');
  });

  test('should sign and verify payload with ECDSA', () => {
    const signature = signPayload(keyPair.privateKey, testPayload);
    expect(signature).toBeInstanceOf(Buffer);
    expect(signature.length).toBeGreaterThan(0);

    const isValid = verifyDeviceSignature(keyPair.publicKey, testPayload, signature);
    expect(isValid).toBe(true);
  });

  test('should reject invalid signature', () => {
    const signature = signPayload(keyPair.privateKey, testPayload);
    const tamperedPayload = Buffer.from('tampered payload', 'utf8');

    const isValid = verifyDeviceSignature(keyPair.publicKey, tamperedPayload, signature);
    expect(isValid).toBe(false);
  });

  test('should reject signature from different key', () => {
    const otherKeyPair = generateECDSAKeyPair();
    const signature = signPayload(keyPair.privateKey, testPayload);

    const isValid = verifyDeviceSignature(otherKeyPair.publicKey, testPayload, signature);
    expect(isValid).toBe(false);
  });
});

describe('Bundle Encryption/Decryption', () => {
  let testBundle: BundlePayload;

  beforeEach(() => {
    const transaction: OfflineTransaction = {
      local_id: 'tx_test_001',
      type: 'p2p',
      amount: 1000,
      currency: 'XOF',
      sender: 'user_123',
      receiver: 'user_456',
      initiated_at: new Date().toISOString(),
    };

    testBundle = {
      bundle_id: 'bundle_test_001',
      transactions: [transaction],
      nonce: generateNonce(),
      device_clock: new Date().toISOString(),
      device_id: 'device_test_001',
    };
  });

  test('should encrypt bundle', async () => {
    const encrypted = await encryptBundle(testBundle);

    expect(encrypted).toHaveProperty('key_wrapped');
    expect(encrypted).toHaveProperty('iv');
    expect(encrypted).toHaveProperty('tag');
    expect(encrypted).toHaveProperty('cipher');

    expect(encrypted.key_wrapped).toBeTruthy();
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.tag).toBeTruthy();
    expect(encrypted.cipher).toBeTruthy();
  });

  test('should encrypt and decrypt bundle', async () => {
    const encrypted = await encryptBundle(testBundle);
    const encryptedStr = JSON.stringify(encrypted);

    const decrypted = await decryptBundle(encryptedStr);

    expect(decrypted.bundle_id).toBe(testBundle.bundle_id);
    expect(decrypted.device_id).toBe(testBundle.device_id);
    expect(decrypted.nonce).toBe(testBundle.nonce);
    expect(decrypted.transactions.length).toBe(1);
    expect(decrypted.transactions[0].local_id).toBe('tx_test_001');
    expect(decrypted.transactions[0].amount).toBe(1000);
  });

  test('should fail decryption with invalid data', async () => {
    await expect(decryptBundle('invalid json')).rejects.toThrow();
  });

  test('should fail decryption with tampered cipher', async () => {
    const encrypted = await encryptBundle(testBundle);
    encrypted.cipher = 'tampered_cipher';

    const encryptedStr = JSON.stringify(encrypted);

    await expect(decryptBundle(encryptedStr)).rejects.toThrow();
  });
});

describe('Nonce Checking (Anti-Replay)', () => {
  test('should accept fresh nonce', () => {
    const nonce = generateNonce();
    const isValid = checkNonce(nonce);
    expect(isValid).toBe(true);
  });

  test('should reject used nonce (replay protection)', () => {
    const nonce = generateNonce();

    const firstCheck = checkNonce(nonce);
    expect(firstCheck).toBe(true);

    const secondCheck = checkNonce(nonce);
    expect(secondCheck).toBe(false);
  });

  test('should generate unique nonces', () => {
    const nonce1 = generateNonce();
    const nonce2 = generateNonce();

    expect(nonce1).not.toBe(nonce2);
    expect(nonce1.length).toBe(32); // 16 bytes = 32 hex chars
    expect(nonce2.length).toBe(32);
  });
});

describe('Clock Skew Validation', () => {
  test('should accept current time', () => {
    const deviceClock = new Date().toISOString();
    const result = validateClockSkew(deviceClock);

    expect(result.valid).toBe(true);
    expect(result.skewMinutes).toBe(0);
  });

  test('should accept time within threshold', () => {
    const deviceClock = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
    const result = validateClockSkew(deviceClock, 30);

    expect(result.valid).toBe(true);
    expect(result.skewMinutes).toBeLessThanOrEqual(10);
  });

  test('should reject time beyond threshold', () => {
    const deviceClock = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 60 min ago
    const result = validateClockSkew(deviceClock, 30);

    expect(result.valid).toBe(false);
    expect(result.skewMinutes).toBeGreaterThan(30);
  });

  test('should reject invalid date', () => {
    const result = validateClockSkew('invalid date');

    expect(result.valid).toBe(false);
    expect(result.skewMinutes).toBe(Infinity);
  });
});

describe('Bundle Age Validation', () => {
  test('should accept recent bundle', () => {
    const initiatedAt = new Date(Date.now() - 60 * 1000).toISOString(); // 1 min ago
    const result = validateBundleAge(initiatedAt, 72);

    expect(result.valid).toBe(true);
    expect(result.ageHours).toBeLessThan(1);
  });

  test('should accept bundle within threshold', () => {
    const initiatedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24 hours ago
    const result = validateBundleAge(initiatedAt, 72);

    expect(result.valid).toBe(true);
    expect(result.ageHours).toBeLessThanOrEqual(24);
  });

  test('should reject bundle beyond threshold', () => {
    const initiatedAt = new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(); // 100 hours ago
    const result = validateBundleAge(initiatedAt, 72);

    expect(result.valid).toBe(false);
    expect(result.ageHours).toBeGreaterThan(72);
  });

  test('should reject future bundle', () => {
    const initiatedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour in future
    const result = validateBundleAge(initiatedAt, 72);

    expect(result.valid).toBe(false);
  });
});

describe('HMAC Utilities', () => {
  const testPayload = Buffer.from('test payload', 'utf8');
  const secret = 'test_secret_key';

  test('should generate HMAC', () => {
    const hmac = generateHMAC(testPayload, secret);

    expect(hmac).toBeInstanceOf(Buffer);
    expect(hmac.length).toBe(32); // SHA256 = 32 bytes
  });

  test('should verify valid HMAC', () => {
    const hmac = generateHMAC(testPayload, secret);
    const isValid = verifyHMAC(testPayload, hmac, secret);

    expect(isValid).toBe(true);
  });

  test('should reject invalid HMAC', () => {
    const hmac = generateHMAC(testPayload, secret);
    const tamperedPayload = Buffer.from('tampered payload', 'utf8');

    const isValid = verifyHMAC(tamperedPayload, hmac, secret);

    expect(isValid).toBe(false);
  });

  test('should reject HMAC with wrong secret', () => {
    const hmac = generateHMAC(testPayload, secret);
    const isValid = verifyHMAC(testPayload, hmac, 'wrong_secret');

    expect(isValid).toBe(false);
  });
});

describe('Bundle Validation', () => {
  let validBundle: BundlePayload;

  beforeEach(() => {
    const transaction: OfflineTransaction = {
      local_id: 'tx_001',
      type: 'p2p',
      amount: 1000,
      currency: 'XOF',
      sender: 'user_123',
      receiver: 'user_456',
      initiated_at: new Date(Date.now() - 60 * 1000).toISOString(),
    };

    validBundle = {
      bundle_id: 'bundle_001',
      transactions: [transaction],
      nonce: generateNonce(),
      device_clock: new Date().toISOString(),
      device_id: 'device_001',
    };
  });

  test('should validate valid bundle', () => {
    const result = validateBundle(validBundle, { requireNonceCheck: false });

    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  test('should reject bundle without bundle_id', () => {
    const invalidBundle = { ...validBundle, bundle_id: '' };
    const result = validateBundle(invalidBundle, { requireNonceCheck: false });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing bundle_id');
  });

  test('should reject bundle without transactions', () => {
    const invalidBundle = { ...validBundle, transactions: [] };
    const result = validateBundle(invalidBundle, { requireNonceCheck: false });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing or empty transactions array');
  });

  test('should reject bundle without nonce', () => {
    const invalidBundle = { ...validBundle, nonce: '' };
    const result = validateBundle(invalidBundle, { requireNonceCheck: false });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing nonce');
  });

  test('should reject bundle without device_clock', () => {
    const invalidBundle = { ...validBundle, device_clock: '' };
    const result = validateBundle(invalidBundle, { requireNonceCheck: false });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing device_clock');
  });

  test('should reject bundle with large clock skew', () => {
    const invalidBundle = {
      ...validBundle,
      device_clock: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 60 min ago
    };

    const result = validateBundle(invalidBundle, {
      maxClockSkewMinutes: 30,
      requireNonceCheck: false,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((err) => err.includes('Clock skew too large'))).toBe(true);
  });

  test('should reject old bundle', () => {
    const invalidBundle = {
      ...validBundle,
      transactions: [
        {
          ...validBundle.transactions[0],
          initiated_at: new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(), // 100 hours ago
        },
      ],
    };

    const result = validateBundle(invalidBundle, {
      maxBundleAgeHours: 72,
      requireNonceCheck: false,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((err) => err.includes('Bundle too old'))).toBe(true);
  });

  test('should reject transaction with invalid amount', () => {
    const invalidBundle = {
      ...validBundle,
      transactions: [
        {
          ...validBundle.transactions[0],
          amount: -100,
        },
      ],
    };

    const result = validateBundle(invalidBundle, { requireNonceCheck: false });

    expect(result.valid).toBe(false);
    expect(result.errors.some((err) => err.includes('Invalid amount'))).toBe(true);
  });

  test('should reject transaction with invalid type', () => {
    const invalidBundle = {
      ...validBundle,
      transactions: [
        {
          ...validBundle.transactions[0],
          type: 'invalid_type' as any,
        },
      ],
    };

    const result = validateBundle(invalidBundle, { requireNonceCheck: false });

    expect(result.valid).toBe(false);
    expect(result.errors.some((err) => err.includes('Invalid type'))).toBe(true);
  });

  test('should reject transaction without required fields', () => {
    const invalidBundle = {
      ...validBundle,
      transactions: [
        {
          ...validBundle.transactions[0],
          sender: '',
        },
      ],
    };

    const result = validateBundle(invalidBundle, { requireNonceCheck: false });

    expect(result.valid).toBe(false);
    expect(result.errors.some((err) => err.includes('Missing sender'))).toBe(true);
  });
});
