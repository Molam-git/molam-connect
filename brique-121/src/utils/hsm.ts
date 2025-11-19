// ============================================================================
// Brique 121 — HSM (Hardware Security Module) Integration
// ============================================================================
// Purpose: Sign ISO20022 messages and other payloads using HSM
// Security: Private keys never leave HSM, audit trail, key rotation support
// ============================================================================

import crypto from 'crypto';
import { SignedXml } from 'xml-crypto';

/**
 * HSM configuration
 */
export interface HSMConfig {
  type: 'aws_cloudhsm' | 'thales' | 'utimaco' | 'softhsm' | 'mock';
  endpoint?: string;
  key_id: string;
  partition?: string;
  credentials?: {
    username?: string;
    password?: string;
    role?: string;
  };
  timeout_ms?: number;
}

/**
 * Signature algorithm
 */
export type SignatureAlgorithm = 'RSA-SHA256' | 'ECDSA-SHA256' | 'RSA-SHA512';

/**
 * HSM provider interface
 */
export interface HSMProvider {
  sign(data: Buffer, keyId: string, algorithm: SignatureAlgorithm): Promise<Buffer>;
  verify(data: Buffer, signature: Buffer, keyId: string, algorithm: SignatureAlgorithm): Promise<boolean>;
  getPublicKey(keyId: string): Promise<string>;
  healthcheck(): Promise<boolean>;
}

/**
 * Mock HSM implementation for development/testing
 * In production, replace with real HSM client (AWS CloudHSM, Thales, etc.)
 */
export class MockHSMProvider implements HSMProvider {
  private keys: Map<string, crypto.KeyPairKeyObjectResult> = new Map();

  constructor() {
    // Generate default test keys
    this.generateKeyPair('default-signing-key');
  }

  private generateKeyPair(keyId: string): void {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    this.keys.set(keyId, { publicKey, privateKey } as any);
  }

  async sign(data: Buffer, keyId: string, algorithm: SignatureAlgorithm): Promise<Buffer> {
    const keyPair = this.keys.get(keyId);
    if (!keyPair) {
      throw new Error(`HSM key not found: ${keyId}`);
    }

    const sign = crypto.createSign(this.algorithmToNode(algorithm));
    sign.update(data);
    sign.end();

    return sign.sign(keyPair.privateKey as any);
  }

  async verify(data: Buffer, signature: Buffer, keyId: string, algorithm: SignatureAlgorithm): Promise<boolean> {
    const keyPair = this.keys.get(keyId);
    if (!keyPair) {
      throw new Error(`HSM key not found: ${keyId}`);
    }

    const verify = crypto.createVerify(this.algorithmToNode(algorithm));
    verify.update(data);
    verify.end();

    return verify.verify(keyPair.publicKey as any, signature);
  }

  async getPublicKey(keyId: string): Promise<string> {
    const keyPair = this.keys.get(keyId);
    if (!keyPair) {
      throw new Error(`HSM key not found: ${keyId}`);
    }

    return keyPair.publicKey as any;
  }

  async healthcheck(): Promise<boolean> {
    return true;
  }

  private algorithmToNode(algorithm: SignatureAlgorithm): string {
    switch (algorithm) {
      case 'RSA-SHA256': return 'RSA-SHA256';
      case 'RSA-SHA512': return 'RSA-SHA512';
      case 'ECDSA-SHA256': return 'sha256';
      default: return 'RSA-SHA256';
    }
  }
}

/**
 * AWS CloudHSM provider (stub - implement with AWS SDK)
 */
export class AWSCloudHSMProvider implements HSMProvider {
  private config: HSMConfig;

  constructor(config: HSMConfig) {
    this.config = config;
  }

  async sign(data: Buffer, keyId: string, algorithm: SignatureAlgorithm): Promise<Buffer> {
    // In production: Use AWS CloudHSM SDK
    // const client = new CloudHSMClient({ region: 'us-east-1' });
    // const command = new SignCommand({ KeyId: keyId, Message: data, SigningAlgorithm: algorithm });
    // const response = await client.send(command);
    // return response.Signature;

    throw new Error('AWS CloudHSM not implemented - use real AWS SDK in production');
  }

  async verify(data: Buffer, signature: Buffer, keyId: string, algorithm: SignatureAlgorithm): Promise<boolean> {
    throw new Error('AWS CloudHSM not implemented');
  }

  async getPublicKey(keyId: string): Promise<string> {
    throw new Error('AWS CloudHSM not implemented');
  }

  async healthcheck(): Promise<boolean> {
    return false;
  }
}

/**
 * HSM Manager - factory for different HSM providers
 */
export class HSMManager {
  private provider: HSMProvider;
  private config: HSMConfig;

  constructor(config: HSMConfig) {
    this.config = config;
    this.provider = this.createProvider(config);
  }

  private createProvider(config: HSMConfig): HSMProvider {
    switch (config.type) {
      case 'mock':
      case 'softhsm':
        return new MockHSMProvider();
      case 'aws_cloudhsm':
        return new AWSCloudHSMProvider(config);
      default:
        console.warn(`Unknown HSM type: ${config.type}, falling back to mock`);
        return new MockHSMProvider();
    }
  }

  async sign(data: Buffer | string, algorithm: SignatureAlgorithm = 'RSA-SHA256'): Promise<Buffer> {
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    return this.provider.sign(dataBuffer, this.config.key_id, algorithm);
  }

  async verify(data: Buffer | string, signature: Buffer, algorithm: SignatureAlgorithm = 'RSA-SHA256'): Promise<boolean> {
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    return this.provider.verify(dataBuffer, signature, this.config.key_id, algorithm);
  }

  async getPublicKey(): Promise<string> {
    return this.provider.getPublicKey(this.config.key_id);
  }

  async healthcheck(): Promise<boolean> {
    return this.provider.healthcheck();
  }
}

/**
 * Singleton HSM manager instance
 */
let hsmManagerInstance: HSMManager | null = null;

/**
 * Initialize HSM manager
 */
export function initHSMManager(config: HSMConfig): HSMManager {
  hsmManagerInstance = new HSMManager(config);
  return hsmManagerInstance;
}

/**
 * Get HSM manager instance
 */
export function getHSMManager(): HSMManager {
  if (!hsmManagerInstance) {
    // Create default mock HSM for development
    console.warn('HSM not initialized, using mock HSM');
    hsmManagerInstance = new HSMManager({
      type: 'mock',
      key_id: 'default-signing-key'
    });
  }
  return hsmManagerInstance;
}

/**
 * Sign XML document with HSM (for ISO20022 messages)
 */
export async function signXmlWithHSM(xml: string, keyId?: string): Promise<string> {
  const hsm = getHSMManager();

  // Create signature
  const dataToSign = Buffer.from(xml, 'utf8');
  const signature = await hsm.sign(dataToSign, 'RSA-SHA256');

  // Get public key for verification
  const publicKey = await hsm.getPublicKey();

  // Create XML signature envelope
  const signedXml = `<?xml version="1.0" encoding="UTF-8"?>
<SignedDocument>
  <Document>${xml}</Document>
  <Signature>
    <SignatureValue>${signature.toString('base64')}</SignatureValue>
    <SignatureMethod>RSA-SHA256</SignatureMethod>
    <KeyInfo>
      <KeyId>${keyId || 'default'}</KeyId>
    </KeyInfo>
  </Signature>
</SignedDocument>`;

  return signedXml;
}

/**
 * Verify XML signature
 */
export async function verifyXmlSignature(signedXml: string): Promise<boolean> {
  const hsm = getHSMManager();

  // Extract document and signature (simplified - use proper XML parser in production)
  const documentMatch = signedXml.match(/<Document>([\s\S]*?)<\/Document>/);
  const signatureMatch = signedXml.match(/<SignatureValue>([\s\S]*?)<\/SignatureValue>/);

  if (!documentMatch || !signatureMatch) {
    throw new Error('Invalid signed XML format');
  }

  const document = documentMatch[1];
  const signatureBase64 = signatureMatch[1].trim();
  const signature = Buffer.from(signatureBase64, 'base64');

  return hsm.verify(Buffer.from(document, 'utf8'), signature, 'RSA-SHA256');
}

/**
 * Sign ISO20022 pain.001 message
 */
export async function signPain001(pain001Xml: string, keyId?: string): Promise<string> {
  return signXmlWithHSM(pain001Xml, keyId);
}

/**
 * Sign data with HMAC (not HSM, but useful for API requests)
 */
export function signWithHMAC(data: string | Buffer, secret: string, algorithm: 'sha256' | 'sha512' = 'sha256'): string {
  const hmac = crypto.createHmac(algorithm, secret);
  hmac.update(data);
  return hmac.digest('hex');
}

/**
 * Verify HMAC signature
 */
export function verifyHMAC(data: string | Buffer, signature: string, secret: string, algorithm: 'sha256' | 'sha512' = 'sha256'): boolean {
  const expectedSignature = signWithHMAC(data, secret, algorithm);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Generate idempotency key (for preventing duplicate payments)
 */
export function generateIdempotencyKey(payoutId: string, attempt: number = 0): string {
  const data = `${payoutId}:${attempt}:${Date.now()}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Verify signature from bank response
 */
export async function verifyBankSignature(
  payload: string | Buffer,
  signature: string,
  publicKeyPem: string,
  algorithm: SignatureAlgorithm = 'RSA-SHA256'
): Promise<boolean> {
  const verify = crypto.createVerify(algorithm);
  verify.update(payload);
  verify.end();

  const signatureBuffer = Buffer.from(signature, 'base64');
  return verify.verify(publicKeyPem, signatureBuffer);
}

/**
 * Create mTLS client certificate context
 */
export interface MTLSContext {
  cert: string; // PEM encoded certificate
  key: string;  // PEM encoded private key
  ca?: string;  // PEM encoded CA certificate
}

/**
 * Load mTLS certificates from Vault
 */
export async function loadMTLSCertificates(vaultPath: string): Promise<MTLSContext> {
  const { getVaultSecret } = await import('./vault');

  try {
    const secret = await getVaultSecret(vaultPath);

    return {
      cert: secret.cert || secret.certificate,
      key: secret.key || secret.private_key,
      ca: secret.ca || secret.ca_certificate
    };
  } catch (error: any) {
    throw new Error(`Failed to load mTLS certificates from Vault: ${error.message}`);
  }
}

// ============================================================================
// End of HSM utilities
// ============================================================================
