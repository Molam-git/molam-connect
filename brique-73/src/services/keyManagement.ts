/**
 * API Key Management Service
 * Brique 73 - Developer Console
 */

import { pool, transaction } from '../db';
import {
  generateApiKeySecret,
  generateKeyId,
  hashSecret,
  encryptWithVault,
  decryptWithVault,
  verifySecret,
} from '../utils/secrets';
import { deleteCache, CacheKeys } from '../redis';

// ========================================
// Types
// ========================================

export interface CreateKeyRequest {
  appId: string;
  name?: string;
  scopes: string[];
  environment: 'test' | 'live';
  expiresInDays?: number;
  createdBy?: string;
}

export interface CreateKeyResult {
  keyId: string;
  kid: string;
  secret: string;               // Returned ONCE
  secretPreview: string;
  scopes: string[];
  environment: string;
  expiresAt: Date | null;
  created: boolean;
}

export interface ApiKeyInfo {
  id: string;
  appId: string;
  kid: string;
  name?: string;
  scopes: string[];
  environment: string;
  status: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface RotateKeyRequest {
  keyId: string;
  rotatedBy: string;
  reason?: string;
}

export interface RevokeKeyRequest {
  keyId: string;
  revokedBy: string;
  reason: string;
}

// ========================================
// Create API Key
// ========================================

export async function createApiKey(request: CreateKeyRequest): Promise<CreateKeyResult> {
  return await transaction(async (client) => {
    // Validate app exists
    const appCheck = await client.query(
      `SELECT id, environment, status FROM dev_apps WHERE id = $1`,
      [request.appId]
    );

    if (appCheck.rows.length === 0) {
      throw new Error('App not found');
    }

    const app = appCheck.rows[0];

    if (app.status !== 'active') {
      throw new Error('App is not active');
    }

    // Environment must match
    if (app.environment !== request.environment) {
      throw new Error(`App environment (${app.environment}) does not match key environment (${request.environment})`);
    }

    // Check if live keys are enabled
    if (request.environment === 'live' && process.env.ENABLE_LIVE_KEYS !== 'true') {
      throw new Error('Live keys creation is disabled. Contact support.');
    }

    // Generate key components
    const kid = generateKeyId();
    const secret = generateApiKeySecret();
    const secretHash = await hashSecret(secret);
    const secretCiphertext = await encryptWithVault(secret);

    // Calculate expiry
    let expiresAt: Date | null = null;
    if (request.expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + request.expiresInDays);
    }

    // Insert key
    const result = await client.query(
      `INSERT INTO api_keys (app_id, kid, name, secret_hash, secret_ciphertext, scopes, environment, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING id, kid, scopes, environment, expires_at, created_at`,
      [
        request.appId,
        kid,
        request.name || null,
        secretHash,
        secretCiphertext,
        request.scopes,
        request.environment,
        expiresAt,
      ]
    );

    const row = result.rows[0];

    // Audit log (already handled by trigger, but add manual entry for creation details)
    await client.query(
      `INSERT INTO api_key_audit (key_id, app_id, action, actor_id, metadata)
       VALUES ($1, $2, 'created', $3, $4)`,
      [
        row.id,
        request.appId,
        request.createdBy || null,
        JSON.stringify({
          kid,
          scopes: request.scopes,
          environment: request.environment,
          expiresAt: expiresAt?.toISOString() || null,
        }),
      ]
    );

    console.log('API key created', {
      keyId: row.id,
      kid,
      appId: request.appId,
      environment: request.environment,
    });

    return {
      keyId: row.id,
      kid: row.kid,
      secret,
      secretPreview: secret.slice(0, 12) + '...',
      scopes: row.scopes,
      environment: row.environment,
      expiresAt: row.expires_at,
      created: true,
    };
  });
}

// ========================================
// Get API Key Info
// ========================================

export async function getApiKey(keyId: string): Promise<ApiKeyInfo | null> {
  const result = await pool.query(
    `SELECT id, app_id, kid, name, scopes, environment, status, last_used_at, expires_at, created_at
     FROM api_keys
     WHERE id = $1`,
    [keyId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    appId: row.app_id,
    kid: row.kid,
    name: row.name,
    scopes: row.scopes,
    environment: row.environment,
    status: row.status,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

// ========================================
// List Keys for App
// ========================================

export async function listKeysForApp(appId: string): Promise<ApiKeyInfo[]> {
  const result = await pool.query(
    `SELECT id, app_id, kid, name, scopes, environment, status, last_used_at, expires_at, created_at
     FROM api_keys
     WHERE app_id = $1
     ORDER BY created_at DESC`,
    [appId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    appId: row.app_id,
    kid: row.kid,
    name: row.name,
    scopes: row.scopes,
    environment: row.environment,
    status: row.status,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}

// ========================================
// Rotate API Key
// ========================================

export async function rotateApiKey(request: RotateKeyRequest): Promise<CreateKeyResult> {
  return await transaction(async (client) => {
    // Get old key
    const oldKeyResult = await client.query(
      `SELECT id, app_id, scopes, environment, name FROM api_keys WHERE id = $1`,
      [request.keyId]
    );

    if (oldKeyResult.rows.length === 0) {
      throw new Error('Key not found');
    }

    const oldKey = oldKeyResult.rows[0];

    // Mark old key as retiring
    await client.query(
      `UPDATE api_keys SET status = 'retiring' WHERE id = $1`,
      [request.keyId]
    );

    // Create new key with same permissions
    const newKeyData = await createApiKey({
      appId: oldKey.app_id,
      name: oldKey.name,
      scopes: oldKey.scopes,
      environment: oldKey.environment,
      createdBy: request.rotatedBy,
    });

    // Audit rotation
    await client.query(
      `INSERT INTO api_key_audit (key_id, app_id, action, actor_id, metadata)
       VALUES ($1, $2, 'rotated', $3, $4)`,
      [
        request.keyId,
        oldKey.app_id,
        request.rotatedBy,
        JSON.stringify({
          oldKid: oldKey.kid,
          newKid: newKeyData.kid,
          reason: request.reason || 'Manual rotation',
        }),
      ]
    );

    // Invalidate cache
    await deleteCache(CacheKeys.apiKey(oldKey.kid));

    console.log('API key rotated', {
      oldKeyId: request.keyId,
      newKeyId: newKeyData.keyId,
    });

    return newKeyData;
  });
}

// ========================================
// Revoke API Key
// ========================================

export async function revokeApiKey(request: RevokeKeyRequest): Promise<void> {
  await transaction(async (client) => {
    // Update key status
    const result = await client.query(
      `UPDATE api_keys
       SET status = 'revoked', revoked_at = NOW(), revoked_by = $2, revoked_reason = $3
       WHERE id = $1
       RETURNING kid, app_id`,
      [request.keyId, request.revokedBy, request.reason]
    );

    if (result.rows.length === 0) {
      throw new Error('Key not found');
    }

    const { kid, app_id } = result.rows[0];

    // Audit log (trigger handles basic audit, add manual entry for revocation details)
    await client.query(
      `INSERT INTO api_key_audit (key_id, app_id, action, actor_id, metadata)
       VALUES ($1, $2, 'revoked', $3, $4)`,
      [
        request.keyId,
        app_id,
        request.revokedBy,
        JSON.stringify({
          reason: request.reason,
          revokedAt: new Date().toISOString(),
        }),
      ]
    );

    // Invalidate cache
    await deleteCache(CacheKeys.apiKey(kid));

    console.log('API key revoked', {
      keyId: request.keyId,
      kid,
      reason: request.reason,
    });
  });
}

// ========================================
// Verify API Key (for auth middleware)
// ========================================

export async function verifyApiKey(
  kid: string,
  providedSecret: string
): Promise<{ valid: boolean; keyId?: string; appId?: string; scopes?: string[] }> {
  try {
    // Query key
    const result = await pool.query(
      `SELECT id, app_id, secret_hash, secret_ciphertext, scopes, status, expires_at
       FROM api_keys
       WHERE kid = $1`,
      [kid]
    );

    if (result.rows.length === 0) {
      return { valid: false };
    }

    const key = result.rows[0];

    // Check status
    if (key.status !== 'active') {
      return { valid: false };
    }

    // Check expiry
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      return { valid: false };
    }

    // Verify secret (fast hash check first)
    const hashMatch = await verifySecret(providedSecret, key.secret_hash);
    if (!hashMatch) {
      return { valid: false };
    }

    // Update last_used_at (async, don't wait)
    pool.query(
      `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
      [key.id]
    ).catch(err => console.error('Failed to update last_used_at', err));

    return {
      valid: true,
      keyId: key.id,
      appId: key.app_id,
      scopes: key.scopes,
    };
  } catch (error) {
    console.error('Error verifying API key', { kid, error });
    return { valid: false };
  }
}

// ========================================
// Update Key Last Used
// ========================================

export async function updateKeyLastUsed(keyId: string, ipAddress?: string): Promise<void> {
  await pool.query(
    `UPDATE api_keys SET last_used_at = NOW(), last_used_ip = $2 WHERE id = $1`,
    [keyId, ipAddress || null]
  );
}
