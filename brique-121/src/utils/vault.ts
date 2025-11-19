// ============================================================================
// Brique 121 — Vault Integration Utilities
// ============================================================================
// Purpose: Secure secrets management via HashiCorp Vault
// Security: Ephemeral credentials, automatic rotation, audit logging
// ============================================================================

import crypto from 'crypto';

/**
 * Vault client configuration
 */
interface VaultConfig {
  address: string;
  token?: string;
  role_id?: string;
  secret_id?: string;
  namespace?: string;
  mount_path?: string;
  timeout_ms?: number;
}

/**
 * Vault secret response
 */
interface VaultSecret {
  data: Record<string, any>;
  metadata?: {
    created_time: string;
    deletion_time: string;
    destroyed: boolean;
    version: number;
  };
  lease_duration?: number;
  renewable?: boolean;
  lease_id?: string;
}

/**
 * In-memory cache for secrets (with TTL)
 */
class SecretCache {
  private cache: Map<string, { value: any; expires_at: number }> = new Map();

  set(key: string, value: any, ttl_seconds: number = 300) {
    this.cache.set(key, {
      value,
      expires_at: Date.now() + ttl_seconds * 1000
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires_at) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  clear() {
    this.cache.clear();
  }
}

/**
 * Vault client for secrets management
 */
export class VaultClient {
  private config: VaultConfig;
  private token: string | null = null;
  private cache: SecretCache = new SecretCache();

  constructor(config: VaultConfig) {
    this.config = {
      address: config.address || process.env.VAULT_ADDR || 'http://localhost:8200',
      token: config.token || process.env.VAULT_TOKEN,
      namespace: config.namespace || process.env.VAULT_NAMESPACE,
      mount_path: config.mount_path || 'secret',
      timeout_ms: config.timeout_ms || 10000,
      ...config
    };
  }

  /**
   * Authenticate with Vault using AppRole
   */
  async authenticate(): Promise<void> {
    if (this.config.token) {
      this.token = this.config.token;
      return;
    }

    if (!this.config.role_id || !this.config.secret_id) {
      throw new Error('Vault authentication requires either token or role_id/secret_id');
    }

    try {
      const response = await this.request('POST', '/v1/auth/approle/login', {
        role_id: this.config.role_id,
        secret_id: this.config.secret_id
      });

      this.token = response.auth.client_token;

      // Schedule token renewal before expiration
      if (response.auth.renewable && response.auth.lease_duration) {
        const renewIn = (response.auth.lease_duration * 0.8) * 1000; // Renew at 80% of lease
        setTimeout(() => this.renewToken(), renewIn);
      }
    } catch (error: any) {
      throw new Error(`Vault authentication failed: ${error.message}`);
    }
  }

  /**
   * Renew Vault token
   */
  private async renewToken(): Promise<void> {
    try {
      const response = await this.request('POST', '/v1/auth/token/renew-self');
      console.log(`Vault token renewed. New TTL: ${response.auth.lease_duration}s`);

      // Schedule next renewal
      if (response.auth.renewable && response.auth.lease_duration) {
        const renewIn = (response.auth.lease_duration * 0.8) * 1000;
        setTimeout(() => this.renewToken(), renewIn);
      }
    } catch (error: any) {
      console.error('Failed to renew Vault token:', error.message);
      // Re-authenticate
      await this.authenticate();
    }
  }

  /**
   * Make HTTP request to Vault
   */
  private async request(method: string, path: string, body?: any): Promise<any> {
    const url = `${this.config.address}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.token) {
      headers['X-Vault-Token'] = this.token;
    }

    if (this.config.namespace) {
      headers['X-Vault-Namespace'] = this.config.namespace;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout_ms);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vault request failed: ${response.status} ${errorText}`);
      }

      return await response.json();
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error('Vault request timeout');
      }
      throw error;
    }
  }

  /**
   * Get secret from Vault (KV v2)
   */
  async getSecret(path: string, version?: number): Promise<VaultSecret> {
    // Check cache first
    const cacheKey = `${path}:${version || 'latest'}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    if (!this.token) {
      await this.authenticate();
    }

    const versionParam = version ? `?version=${version}` : '';
    const fullPath = `/v1/${this.config.mount_path}/data/${path}${versionParam}`;

    try {
      const response = await this.request('GET', fullPath);
      const secret: VaultSecret = {
        data: response.data.data,
        metadata: response.data.metadata
      };

      // Cache for 5 minutes
      this.cache.set(cacheKey, secret, 300);

      return secret;
    } catch (error: any) {
      throw new Error(`Failed to get secret from Vault at ${path}: ${error.message}`);
    }
  }

  /**
   * Write secret to Vault (KV v2)
   */
  async writeSecret(path: string, data: Record<string, any>): Promise<void> {
    if (!this.token) {
      await this.authenticate();
    }

    const fullPath = `/v1/${this.config.mount_path}/data/${path}`;

    try {
      await this.request('POST', fullPath, { data });
      // Invalidate cache
      this.cache.clear();
    } catch (error: any) {
      throw new Error(`Failed to write secret to Vault at ${path}: ${error.message}`);
    }
  }

  /**
   * Delete secret from Vault
   */
  async deleteSecret(path: string): Promise<void> {
    if (!this.token) {
      await this.authenticate();
    }

    const fullPath = `/v1/${this.config.mount_path}/metadata/${path}`;

    try {
      await this.request('DELETE', fullPath);
      this.cache.clear();
    } catch (error: any) {
      throw new Error(`Failed to delete secret from Vault at ${path}: ${error.message}`);
    }
  }

  /**
   * Generate database credentials (dynamic secrets)
   */
  async getDatabaseCredentials(role: string): Promise<{ username: string; password: string; lease_id: string }> {
    if (!this.token) {
      await this.authenticate();
    }

    try {
      const response = await this.request('GET', `/v1/database/creds/${role}`);
      return {
        username: response.data.username,
        password: response.data.password,
        lease_id: response.lease_id
      };
    } catch (error: any) {
      throw new Error(`Failed to get database credentials for role ${role}: ${error.message}`);
    }
  }

  /**
   * Revoke a lease
   */
  async revokeLease(leaseId: string): Promise<void> {
    if (!this.token) {
      await this.authenticate();
    }

    try {
      await this.request('PUT', '/v1/sys/leases/revoke', { lease_id: leaseId });
    } catch (error: any) {
      throw new Error(`Failed to revoke lease ${leaseId}: ${error.message}`);
    }
  }

  /**
   * Get transit encryption key
   */
  async encrypt(keyName: string, plaintext: string): Promise<string> {
    if (!this.token) {
      await this.authenticate();
    }

    const encoded = Buffer.from(plaintext).toString('base64');

    try {
      const response = await this.request('POST', `/v1/transit/encrypt/${keyName}`, {
        plaintext: encoded
      });
      return response.data.ciphertext;
    } catch (error: any) {
      throw new Error(`Failed to encrypt with key ${keyName}: ${error.message}`);
    }
  }

  /**
   * Decrypt with transit key
   */
  async decrypt(keyName: string, ciphertext: string): Promise<string> {
    if (!this.token) {
      await this.authenticate();
    }

    try {
      const response = await this.request('POST', `/v1/transit/decrypt/${keyName}`, {
        ciphertext
      });
      return Buffer.from(response.data.plaintext, 'base64').toString('utf8');
    } catch (error: any) {
      throw new Error(`Failed to decrypt with key ${keyName}: ${error.message}`);
    }
  }
}

/**
 * Singleton Vault client instance
 */
let vaultClientInstance: VaultClient | null = null;

/**
 * Initialize Vault client (call once at app startup)
 */
export function initVaultClient(config?: VaultConfig): VaultClient {
  if (!vaultClientInstance) {
    vaultClientInstance = new VaultClient(config || {
      address: process.env.VAULT_ADDR || 'http://localhost:8200',
      token: process.env.VAULT_TOKEN
    });
  }
  return vaultClientInstance;
}

/**
 * Get Vault client instance
 */
export function getVaultClient(): VaultClient {
  if (!vaultClientInstance) {
    throw new Error('Vault client not initialized. Call initVaultClient() first.');
  }
  return vaultClientInstance;
}

/**
 * Helper: Get secret value by path
 * Supports "vault:path/to/secret:key" format
 */
export async function getVaultSecret(vaultPath: string): Promise<any> {
  const client = getVaultClient();

  // Parse vault:path:key format
  if (vaultPath.startsWith('vault:')) {
    const parts = vaultPath.slice(6).split(':');
    const path = parts[0];
    const key = parts[1] || null;

    const secret = await client.getSecret(path);

    if (key) {
      if (!(key in secret.data)) {
        throw new Error(`Key "${key}" not found in Vault secret at ${path}`);
      }
      return secret.data[key];
    }

    return secret.data;
  }

  // Direct path
  const secret = await client.getSecret(vaultPath);
  return secret.data;
}

/**
 * Helper: Load connector config and resolve Vault references
 */
export async function resolveConnectorConfig(config: Record<string, any>): Promise<Record<string, any>> {
  const resolved: Record<string, any> = {};

  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string' && value.startsWith('vault:')) {
      try {
        resolved[key] = await getVaultSecret(value);
      } catch (error: any) {
        console.error(`Failed to resolve Vault secret for ${key}:`, error.message);
        resolved[key] = null;
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      resolved[key] = await resolveConnectorConfig(value);
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

/**
 * Encrypt sensitive data locally (not using Vault)
 * Used for local encryption when Vault is not available
 */
export function encryptLocal(data: string, key: string): string {
  const algorithm = 'aes-256-gcm';
  const keyBuffer = crypto.scryptSync(key, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv);

  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt locally encrypted data
 */
export function decryptLocal(encryptedData: string, key: string): string {
  const algorithm = 'aes-256-gcm';
  const parts = encryptedData.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const keyBuffer = crypto.scryptSync(key, 'salt', 32);
  const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// ============================================================================
// End of Vault utilities
// ============================================================================
