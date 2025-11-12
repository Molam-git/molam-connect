/**
 * Brique 79 - API Keys Service
 *
 * Core service for API key management:
 * - Create keys (test/live) with ops approval for live keys
 * - Rotate keys with grace period
 * - Revoke keys
 * - Validate keys with scope and restriction enforcement
 * - Usage tracking and analytics
 *
 * @version 1.0.0
 * @date 2025-11-12
 */

import { Pool, PoolClient } from 'pg';
import {
  encryptWithKMS,
  decryptWithKMS,
  generateSecret,
  hashSecret,
  constantTimeCompare,
  generateRandomId,
} from '../utils/kms';
import {
  incrementDailyQuota,
  incrementMonthlyQuota,
  getQuotaCounters,
} from '../utils/redis';

// =======================================================================
// TYPES
// =======================================================================

export type KeyMode = 'test' | 'live';
export type KeyStatus = 'active' | 'retiring' | 'revoked' | 'disabled';
export type SecretStatus = 'active' | 'retiring' | 'revoked';

export interface APIKey {
  id: string;
  tenant_type: string;
  tenant_id: string;
  key_id: string;
  mode: KeyMode;
  name?: string;
  description?: string;
  scopes: string[];
  restrictions: KeyRestrictions;
  status: KeyStatus;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
  last_used_at?: Date;
  last_used_ip?: string;
  expires_at?: Date;
}

export interface KeyRestrictions {
  ip_allowlist?: string[];
  allowed_currencies?: string[];
  allowed_origins?: string[];
  allowed_countries?: string[];
  quotas?: {
    daily?: number;
    monthly?: number;
  };
  rate_limit?: {
    requests_per_second?: number;
    burst?: number;
  };
}

export interface APIKeySecret {
  id: string;
  api_key_id: string;
  version: number;
  secret_ciphertext: Buffer;
  secret_hash: string;
  status: SecretStatus;
  created_at: Date;
  retiring_at?: Date;
  revoked_at?: Date;
}

export interface KeyUsage {
  id: string;
  api_key_id: string;
  date_day: Date;
  scope: string;
  request_count: number;
  success_count: number;
  error_count: number;
  last_seen_at?: Date;
}

export interface CreateKeyParams {
  tenant_type: string;
  tenant_id: string;
  mode: KeyMode;
  name?: string;
  description?: string;
  scopes?: string[];
  restrictions?: KeyRestrictions;
  created_by?: string;
  idempotency_key?: string;
}

export interface ValidatedKey {
  key: APIKey;
  scopes: string[];
  tenant_id: string;
  tenant_type: string;
}

// =======================================================================
// DATABASE CONNECTION
// =======================================================================

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'molam_connect',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// =======================================================================
// CORE FUNCTIONS
// =======================================================================

/**
 * Generate key_id based on mode
 */
function generateKeyId(mode: KeyMode): string {
  const prefix = mode === 'live' ? 'MK_live' : 'TK_test';
  const randomPart = generateRandomId(12);
  return `${prefix}_${randomPart}`;
}

/**
 * Create API key
 *
 * For live keys: checks KYC status and may require ops approval.
 */
export async function createAPIKey(
  params: CreateKeyParams
): Promise<{ key: APIKey; secret: string; requires_approval?: boolean; ops_action_id?: string }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check idempotency
    if (params.idempotency_key) {
      const existingResult = await client.query<APIKey>(
        `SELECT * FROM api_keys WHERE tenant_id = $1 AND key_id LIKE $2`,
        [params.tenant_id, `%${params.idempotency_key}%`]
      );

      if (existingResult.rows.length > 0) {
        await client.query('COMMIT');
        // Cannot return secret for existing key (security)
        throw new Error('Key with this idempotency key already exists. Secret cannot be retrieved.');
      }
    }

    // For live keys, check KYC status
    if (params.mode === 'live' && params.tenant_type === 'merchant') {
      const merchantResult = await client.query(
        `SELECT is_kyc_verified FROM merchants WHERE id = $1`,
        [params.tenant_id]
      );

      if (merchantResult.rows.length === 0 || !merchantResult.rows[0].is_kyc_verified) {
        // Requires ops approval
        await client.query('ROLLBACK');

        // TODO: Integrate with Brique 78 (Ops Approval)
        // const { createOpsAction } = require('../../brique-78/services/approvalService');
        // const action = await createOpsAction({
        //   origin: 'ops_ui',
        //   action_type: 'CREATE_LIVE_API_KEY',
        //   params: { tenant_type: params.tenant_type, tenant_id: params.tenant_id, name: params.name },
        //   created_by: params.created_by || 'system'
        // });

        return {
          key: null as any,
          secret: '',
          requires_approval: true,
          ops_action_id: 'pending-approval-placeholder',
        };
      }
    }

    // Generate key_id and secret
    const keyId = generateKeyId(params.mode);
    const secret = generateSecret();
    const secretHash = hashSecret(secret);

    // Encrypt secret
    const ciphertext = await encryptWithKMS(Buffer.from(secret, 'utf8'));

    // Insert key
    const keyResult = await client.query<APIKey>(
      `INSERT INTO api_keys (
        tenant_type, tenant_id, key_id, mode, name, description, scopes, restrictions, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        params.tenant_type,
        params.tenant_id,
        keyId,
        params.mode,
        params.name,
        params.description,
        params.scopes || ['payments:read'],
        JSON.stringify(params.restrictions || {}),
        params.created_by,
      ]
    );

    const key = keyResult.rows[0];

    // Insert secret
    await client.query(
      `INSERT INTO api_key_secrets (api_key_id, version, secret_ciphertext, secret_hash)
       VALUES ($1, $2, $3, $4)`,
      [key.id, 1, ciphertext, secretHash]
    );

    // Audit event
    await client.query(
      `INSERT INTO api_key_events (api_key_id, event_type, actor_id, actor_type, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        key.id,
        'created',
        params.created_by,
        'user',
        JSON.stringify({ key_id: key.key_id, mode: key.mode, scopes: key.scopes }),
      ]
    );

    await client.query('COMMIT');

    console.log(`[APIKeys] Created key ${key.key_id} for ${params.tenant_type}:${params.tenant_id}`);

    return { key, secret };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[APIKeys] Create key failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * List API keys for tenant
 */
export async function listAPIKeys(
  tenantType: string,
  tenantId: string,
  mode?: KeyMode
): Promise<APIKey[]> {
  let query = `SELECT * FROM api_keys WHERE tenant_type = $1 AND tenant_id = $2`;
  const params: any[] = [tenantType, tenantId];

  if (mode) {
    query += ` AND mode = $3`;
    params.push(mode);
  }

  query += ` ORDER BY created_at DESC`;

  const result = await pool.query<APIKey>(query, params);

  return result.rows;
}

/**
 * Get API key by key_id
 */
export async function getAPIKey(keyId: string): Promise<APIKey | null> {
  const result = await pool.query<APIKey>(
    `SELECT * FROM api_keys WHERE key_id = $1`,
    [keyId]
  );

  return result.rows[0] || null;
}

/**
 * Rotate API key
 *
 * Creates new secret version, marks old as retiring.
 */
export async function rotateAPIKey(
  keyId: string,
  actorId?: string,
  gracePeriodSeconds: number = 600
): Promise<{ key: APIKey; secret: string; new_version: number }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get key
    const keyResult = await client.query<APIKey>(
      `SELECT * FROM api_keys WHERE key_id = $1`,
      [keyId]
    );

    if (keyResult.rows.length === 0) {
      throw new Error('API key not found');
    }

    const key = keyResult.rows[0];

    if (key.status !== 'active') {
      throw new Error(`Cannot rotate key with status: ${key.status}`);
    }

    // Get current max version
    const versionResult = await client.query<{ max_version: number }>(
      `SELECT COALESCE(MAX(version), 0) as max_version FROM api_key_secrets WHERE api_key_id = $1`,
      [key.id]
    );

    const newVersion = versionResult.rows[0].max_version + 1;

    // Generate new secret
    const secret = generateSecret();
    const secretHash = hashSecret(secret);
    const ciphertext = await encryptWithKMS(Buffer.from(secret, 'utf8'));

    // Insert new secret
    await client.query(
      `INSERT INTO api_key_secrets (api_key_id, version, secret_ciphertext, secret_hash, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [key.id, newVersion, ciphertext, secretHash, 'active']
    );

    // Mark previous versions as retiring
    const retiringAt = new Date(Date.now() + gracePeriodSeconds * 1000);
    await client.query(
      `UPDATE api_key_secrets
       SET status = $1, retiring_at = $2
       WHERE api_key_id = $3 AND version < $4 AND status = $5`,
      ['retiring', retiringAt, key.id, newVersion, 'active']
    );

    // Audit event
    await client.query(
      `INSERT INTO api_key_events (api_key_id, event_type, actor_id, actor_type, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        key.id,
        'rotated',
        actorId,
        'user',
        JSON.stringify({ old_version: newVersion - 1, new_version: newVersion, grace_period_seconds: gracePeriodSeconds }),
      ]
    );

    await client.query('COMMIT');

    console.log(`[APIKeys] Rotated key ${keyId} to version ${newVersion}`);

    return { key, secret, new_version: newVersion };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[APIKeys] Rotate key failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Revoke API key
 *
 * Immediately revokes key and all secrets.
 */
export async function revokeAPIKey(
  keyId: string,
  actorId?: string,
  reason?: string
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get key
    const keyResult = await client.query<APIKey>(
      `SELECT * FROM api_keys WHERE key_id = $1`,
      [keyId]
    );

    if (keyResult.rows.length === 0) {
      throw new Error('API key not found');
    }

    const key = keyResult.rows[0];

    // Update key status
    await client.query(
      `UPDATE api_keys SET status = $1, updated_at = now() WHERE id = $2`,
      ['revoked', key.id]
    );

    // Revoke all secrets
    await client.query(
      `UPDATE api_key_secrets SET status = $1, revoked_at = now() WHERE api_key_id = $2`,
      ['revoked', key.id]
    );

    // Audit event
    await client.query(
      `INSERT INTO api_key_events (api_key_id, event_type, actor_id, actor_type, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        key.id,
        'revoked',
        actorId,
        'user',
        JSON.stringify({ reason: reason || 'manual_revocation' }),
      ]
    );

    await client.query('COMMIT');

    console.log(`[APIKeys] Revoked key ${keyId}`);
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[APIKeys] Revoke key failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Validate API key and secret
 *
 * Checks:
 * - Key exists and is active
 * - Secret matches (constant-time comparison)
 * - Key has not expired
 * - Restrictions (IP, scope, etc.)
 */
export async function validateAPIKey(
  keyId: string,
  providedSecret: string,
  context?: {
    ip?: string;
    scope?: string;
    currency?: string;
    country?: string;
    origin?: string;
  }
): Promise<{ valid: boolean; key?: ValidatedKey; error?: string }> {
  try {
    // Get key
    const keyResult = await pool.query<APIKey>(
      `SELECT * FROM api_keys WHERE key_id = $1`,
      [keyId]
    );

    if (keyResult.rows.length === 0) {
      await recordAuthEvent(null, 'auth_failed', { reason: 'key_not_found', ip: context?.ip });
      return { valid: false, error: 'invalid_key' };
    }

    const key = keyResult.rows[0];

    // Check status
    if (key.status !== 'active') {
      await recordAuthEvent(key.id, 'auth_failed', { reason: 'key_not_active', status: key.status, ip: context?.ip });
      return { valid: false, error: 'key_not_active' };
    }

    // Check expiration
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      await recordAuthEvent(key.id, 'auth_failed', { reason: 'key_expired', ip: context?.ip });
      return { valid: false, error: 'key_expired' };
    }

    // Get active/retiring secrets
    const secretsResult = await pool.query<APIKeySecret>(
      `SELECT * FROM api_key_secrets
       WHERE api_key_id = $1 AND status IN ('active', 'retiring')
       ORDER BY version DESC`,
      [key.id]
    );

    // Validate secret (constant-time comparison)
    const providedHash = hashSecret(providedSecret);
    let secretValid = false;

    for (const secret of secretsResult.rows) {
      if (constantTimeCompare(secret.secret_hash, providedHash)) {
        // Check if retiring secret is still in grace period
        if (secret.status === 'retiring' && secret.retiring_at && new Date(secret.retiring_at) < new Date()) {
          continue; // Grace period expired
        }
        secretValid = true;
        break;
      }
    }

    if (!secretValid) {
      await recordAuthEvent(key.id, 'auth_failed', { reason: 'invalid_secret', ip: context?.ip });
      return { valid: false, error: 'invalid_secret' };
    }

    // Check restrictions
    const restrictions = key.restrictions as KeyRestrictions;

    // IP allowlist
    if (restrictions.ip_allowlist && restrictions.ip_allowlist.length > 0 && context?.ip) {
      if (!restrictions.ip_allowlist.includes(context.ip)) {
        await recordAuthEvent(key.id, 'ip_restricted', { ip: context.ip });
        return { valid: false, error: 'ip_not_allowed' };
      }
    }

    // Scope check
    if (context?.scope && !key.scopes.includes(context.scope)) {
      await recordAuthEvent(key.id, 'scope_denied', { scope: context.scope, ip: context?.ip });
      return { valid: false, error: 'scope_denied' };
    }

    // Currency check
    if (restrictions.allowed_currencies && restrictions.allowed_currencies.length > 0 && context?.currency) {
      if (!restrictions.allowed_currencies.includes(context.currency)) {
        return { valid: false, error: 'currency_not_allowed' };
      }
    }

    // Country check
    if (restrictions.allowed_countries && restrictions.allowed_countries.length > 0 && context?.country) {
      if (!restrictions.allowed_countries.includes(context.country)) {
        return { valid: false, error: 'country_not_allowed' };
      }
    }

    // Origin check
    if (restrictions.allowed_origins && restrictions.allowed_origins.length > 0 && context?.origin) {
      if (!restrictions.allowed_origins.includes(context.origin)) {
        return { valid: false, error: 'origin_not_allowed' };
      }
    }

    // Update last used
    await pool.query(
      `UPDATE api_keys SET last_used_at = now(), last_used_ip = $1 WHERE id = $2`,
      [context?.ip, key.id]
    );

    return {
      valid: true,
      key: {
        key,
        scopes: key.scopes,
        tenant_id: key.tenant_id,
        tenant_type: key.tenant_type,
      },
    };
  } catch (error: any) {
    console.error('[APIKeys] Validation failed:', error);
    return { valid: false, error: 'internal_error' };
  }
}

/**
 * Record authentication event
 */
async function recordAuthEvent(
  apiKeyId: string | null,
  eventType: string,
  payload: any
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO api_key_events (api_key_id, event_type, actor_type, payload, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [apiKeyId, eventType, 'system', JSON.stringify(payload), payload.ip]
    );
  } catch (error) {
    console.error('[APIKeys] Failed to record auth event:', error);
  }
}

/**
 * Check quota
 */
export async function checkQuota(
  keyId: string
): Promise<{ allowed: boolean; daily_remaining?: number; monthly_remaining?: number; error?: string }> {
  try {
    // Get key
    const key = await getAPIKey(keyId);
    if (!key) {
      return { allowed: false, error: 'key_not_found' };
    }

    // Check quota in database
    const quotaResult = await pool.query(
      `SELECT * FROM check_api_key_quota($1)`,
      [key.id]
    );

    if (quotaResult.rows.length === 0 || !quotaResult.rows[0].quota_ok) {
      await recordAuthEvent(key.id, 'quota_exceeded', { daily_remaining: quotaResult.rows[0]?.daily_remaining });
      return {
        allowed: false,
        daily_remaining: quotaResult.rows[0]?.daily_remaining,
        monthly_remaining: quotaResult.rows[0]?.monthly_remaining,
        error: 'quota_exceeded',
      };
    }

    // Increment quota counter
    await pool.query(`SELECT increment_quota_counter($1)`, [key.id]);

    return {
      allowed: true,
      daily_remaining: quotaResult.rows[0].daily_remaining,
      monthly_remaining: quotaResult.rows[0].monthly_remaining,
    };
  } catch (error: any) {
    console.error('[APIKeys] Quota check failed:', error);
    return { allowed: true }; // Fail open for availability
  }
}

/**
 * Record usage
 */
export async function recordUsage(
  keyId: string,
  scope: string,
  success: boolean = true
): Promise<void> {
  try {
    const key = await getAPIKey(keyId);
    if (!key) return;

    await pool.query(
      `SELECT increment_api_key_usage($1, $2, $3)`,
      [key.id, scope, success]
    );

    // Also increment Redis counters
    await incrementDailyQuota(keyId);
    await incrementMonthlyQuota(keyId);
  } catch (error) {
    console.error('[APIKeys] Failed to record usage:', error);
  }
}

/**
 * Get usage statistics
 */
export async function getUsageStats(
  keyId: string,
  days: number = 30
): Promise<any[]> {
  const key = await getAPIKey(keyId);
  if (!key) {
    throw new Error('API key not found');
  }

  const result = await pool.query(
    `SELECT * FROM get_api_key_usage_stats($1, $2)`,
    [key.id, days]
  );

  return result.rows;
}

// =======================================================================
// EXPORTS
// =======================================================================

export default {
  createAPIKey,
  listAPIKeys,
  getAPIKey,
  rotateAPIKey,
  revokeAPIKey,
  validateAPIKey,
  checkQuota,
  recordUsage,
  getUsageStats,
};
