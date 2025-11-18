// =====================================================================
// Rate Limit Service
// =====================================================================
// Core service for rate limiting with PostgreSQL config + Redis enforcement
// Date: 2025-11-12
// =====================================================================

import { Pool, PoolClient } from 'pg';
import LRU from 'lru-cache';
import { rateLimitRedis } from '../utils/redisClient';

// =====================================================================
// Types
// =====================================================================

export interface RateLimitConfig {
  rate_per_second: number;
  rate_per_minute?: number;
  rate_per_hour?: number;
  burst_capacity: number;
  daily_quota: number;
  monthly_quota: number;
  concurrent_requests?: number;
  features?: Record<string, any>;
  endpoints?: Record<string, Partial<RateLimitConfig>>;
}

export interface RateLimitPlan {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  config: RateLimitConfig;
  price_monthly?: number;
  price_currency?: string;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;
  tenant_count?: number;
  created_at: Date;
  updated_at: Date;
}

export interface RateLimitOverride {
  id: string;
  target_type: 'api_key' | 'tenant' | 'region' | 'ip' | 'endpoint';
  target_id: string;
  config: Partial<RateLimitConfig>;
  starts_at?: Date;
  expires_at?: Date;
  reason: string;
  created_by: string;
  approved_by?: string;
  approved_at?: Date;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface RateLimitBlock {
  id: string;
  target_type: 'api_key' | 'tenant' | 'region' | 'ip' | 'endpoint';
  target_id: string;
  reason: string;
  reason_detail?: string;
  starts_at: Date;
  expires_at?: Date;
  auto_remove: boolean;
  created_by?: string;
  removed_by?: string;
  removed_at?: Date;
  removal_reason?: string;
  is_active: boolean;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  reason?: string;
  retry_after?: number;
  tokensRemaining?: number;
  dailyUsage?: number;
  monthlyUsage?: number;
  config?: RateLimitConfig;
  blockInfo?: RateLimitBlock;
}

// =====================================================================
// Configuration Cache (LRU)
// =====================================================================

const CONFIG_CACHE = new LRU<string, RateLimitConfig>({
  max: 10000, // Cache up to 10k configs
  ttl: 1000 * 30, // 30 seconds TTL
  updateAgeOnGet: true,
});

const BLOCK_CACHE = new LRU<string, RateLimitBlock | null>({
  max: 10000,
  ttl: 1000 * 10, // 10 seconds TTL (shorter for blocks)
  updateAgeOnGet: true,
});

// =====================================================================
// Rate Limit Service Class
// =====================================================================

export class RateLimitService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  // ===================================================================
  // Rate Limit Checking
  // ===================================================================

  /**
   * Check rate limit for an API key
   */
  async checkRateLimit(params: {
    apiKeyId: string;
    tenantId: string;
    endpoint?: string;
    ipAddress?: string;
    idempotencyKey?: string;
    amount?: number;
  }): Promise<RateLimitCheckResult> {
    const { apiKeyId, tenantId, endpoint, ipAddress, idempotencyKey, amount = 1 } = params;

    try {
      // 1. Check blocks (cached)
      const block = await this.checkBlocks({
        apiKeyId,
        tenantId,
        ipAddress,
      });

      if (block) {
        await this.logEvent({
          event_type: 'throttle',
          target_type: 'api_key',
          target_id: apiKeyId,
          endpoint,
          ip_address: ipAddress,
          payload: { reason: 'blocked', block_id: block.id },
        });

        const retryAfter = block.expires_at
          ? Math.ceil((block.expires_at.getTime() - Date.now()) / 1000)
          : 86400; // 24h default

        return {
          allowed: false,
          reason: `blocked:${block.reason}`,
          retry_after: retryAfter,
          blockInfo: block,
        };
      }

      // 2. Get effective config (cached)
      const config = await this.getEffectiveConfig({
        apiKeyId,
        tenantId,
        endpoint,
        ipAddress,
      });

      // 3. Check Redis rate limit (atomic)
      const rlResult = await rateLimitRedis.checkRateLimit({
        keyId: apiKeyId,
        ratePerSecond: config.rate_per_second,
        burstCapacity: config.burst_capacity,
        dailyQuota: config.daily_quota,
        monthlyQuota: config.monthly_quota,
        amount,
        idempotencyKey,
      });

      // 4. Log if throttled
      if (!rlResult.allowed) {
        await this.logEvent({
          event_type: rlResult.reason === 'daily_quota' || rlResult.reason === 'monthly_quota'
            ? 'quota_exceeded'
            : 'throttle',
          target_type: 'api_key',
          target_id: apiKeyId,
          endpoint,
          ip_address: ipAddress,
          limit_type: rlResult.reason,
          limit_value: config.rate_per_second,
          current_value: rlResult.dailyCount,
          payload: {
            retry_after: rlResult.retryAfter,
            reason: rlResult.reason,
          },
        });

        // Trigger quota warning if approaching limit (80%, 90%)
        if (rlResult.dailyCount / config.daily_quota >= 0.8) {
          await this.logEvent({
            event_type: 'quota_warning',
            target_type: 'api_key',
            target_id: apiKeyId,
            payload: {
              usage_percent: Math.round((rlResult.dailyCount / config.daily_quota) * 100),
              daily_count: rlResult.dailyCount,
              daily_quota: config.daily_quota,
            },
          });
        }
      }

      return {
        allowed: rlResult.allowed,
        reason: rlResult.reason || undefined,
        retry_after: rlResult.retryAfter || undefined,
        tokensRemaining: rlResult.tokensRemaining,
        dailyUsage: rlResult.dailyCount,
        monthlyUsage: rlResult.monthlyCount,
        config,
      };
    } catch (error) {
      console.error('[RateLimitService] checkRateLimit error:', error);

      // Fail-open strategy (allow request if service unavailable)
      // For production, consider fail-closed for critical endpoints
      const failOpen = process.env.RATE_LIMIT_FAIL_OPEN !== 'false';

      if (failOpen) {
        console.warn('[RateLimitService] Failing open due to error');
        return { allowed: true, reason: 'service_unavailable' };
      } else {
        return { allowed: false, reason: 'service_error', retry_after: 60 };
      }
    }
  }

  /**
   * Get effective rate limit config with all overrides applied
   */
  async getEffectiveConfig(params: {
    apiKeyId: string;
    tenantId: string;
    endpoint?: string;
    ipAddress?: string;
  }): Promise<RateLimitConfig> {
    const { apiKeyId, tenantId, endpoint, ipAddress } = params;

    // Check cache first
    const cacheKey = `config:${apiKeyId}:${endpoint || 'default'}`;
    const cached = CONFIG_CACHE.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Query PostgreSQL function
      const result = await this.pool.query(
        'SELECT get_effective_rate_limit_config($1, $2, $3, $4) AS config',
        [apiKeyId, tenantId, endpoint || null, ipAddress || null]
      );

      const config: RateLimitConfig = result.rows[0]?.config || this.getDefaultConfig();

      // Cache result
      CONFIG_CACHE.set(cacheKey, config);

      return config;
    } catch (error) {
      console.error('[RateLimitService] getEffectiveConfig error:', error);
      return this.getDefaultConfig();
    }
  }

  /**
   * Check if target is blocked
   */
  async checkBlocks(params: {
    apiKeyId?: string;
    tenantId?: string;
    ipAddress?: string;
  }): Promise<RateLimitBlock | null> {
    const { apiKeyId, tenantId, ipAddress } = params;

    // Check cache first
    if (apiKeyId) {
      const cached = BLOCK_CACHE.get(`block:api_key:${apiKeyId}`);
      if (cached !== undefined) {
        return cached;
      }
    }

    try {
      // Check all applicable blocks
      const checks: Array<{ type: string; id: string }> = [];

      if (apiKeyId) checks.push({ type: 'api_key', id: apiKeyId });
      if (tenantId) checks.push({ type: 'tenant', id: tenantId });
      if (ipAddress) checks.push({ type: 'ip', id: ipAddress });

      for (const check of checks) {
        const result = await this.pool.query(
          'SELECT * FROM is_rate_limit_blocked($1, $2)',
          [check.type, check.id]
        );

        const row = result.rows[0];
        if (row?.is_blocked) {
          // Fetch full block details
          const blockResult = await this.pool.query(
            `SELECT * FROM rl_blocks
             WHERE target_type = $1 AND target_id = $2 AND is_active = true
             AND (expires_at IS NULL OR expires_at > now())
             AND (starts_at IS NULL OR starts_at <= now())
             ORDER BY created_at DESC
             LIMIT 1`,
            [check.type, check.id]
          );

          if (blockResult.rows.length > 0) {
            const block = blockResult.rows[0] as RateLimitBlock;

            // Cache block
            BLOCK_CACHE.set(`block:${check.type}:${check.id}`, block);

            return block;
          }
        }

        // Cache negative result
        BLOCK_CACHE.set(`block:${check.type}:${check.id}`, null);
      }

      return null;
    } catch (error) {
      console.error('[RateLimitService] checkBlocks error:', error);
      return null;
    }
  }

  // ===================================================================
  // Plan Management
  // ===================================================================

  /**
   * Get all rate limit plans
   */
  async getPlans(params?: {
    activeOnly?: boolean;
    publicOnly?: boolean;
  }): Promise<RateLimitPlan[]> {
    const { activeOnly = false, publicOnly = false } = params || {};

    try {
      let query = 'SELECT * FROM v_rl_plans_active';
      const conditions: string[] = [];

      if (activeOnly) conditions.push('is_active = true');
      if (publicOnly) conditions.push('is_public = true');

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY sort_order, name';

      const result = await this.pool.query(query);
      return result.rows as RateLimitPlan[];
    } catch (error) {
      console.error('[RateLimitService] getPlans error:', error);
      throw error;
    }
  }

  /**
   * Get plan by ID or name
   */
  async getPlan(idOrName: string): Promise<RateLimitPlan | null> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM rl_plans WHERE id = $1 OR name = $1 LIMIT 1',
        [idOrName]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('[RateLimitService] getPlan error:', error);
      throw error;
    }
  }

  /**
   * Create new rate limit plan
   */
  async createPlan(params: {
    name: string;
    display_name: string;
    description?: string;
    config: RateLimitConfig;
    price_monthly?: number;
    price_currency?: string;
    is_public?: boolean;
    sort_order?: number;
    created_by: string;
  }): Promise<RateLimitPlan> {
    const {
      name,
      display_name,
      description,
      config,
      price_monthly,
      price_currency = 'USD',
      is_public = true,
      sort_order = 0,
      created_by,
    } = params;

    try {
      const result = await this.pool.query(
        `INSERT INTO rl_plans (
          name, display_name, description, config,
          price_monthly, price_currency, is_public, sort_order, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          name,
          display_name,
          description,
          JSON.stringify(config),
          price_monthly,
          price_currency,
          is_public,
          sort_order,
          created_by,
        ]
      );

      await this.logEvent({
        event_type: 'config_updated',
        actor_type: 'ops',
        actor_id: created_by,
        target_type: 'plan',
        target_id: result.rows[0].id,
        payload: { action: 'create', name },
      });

      return result.rows[0] as RateLimitPlan;
    } catch (error) {
      console.error('[RateLimitService] createPlan error:', error);
      throw error;
    }
  }

  /**
   * Update rate limit plan
   */
  async updatePlan(
    planId: string,
    updates: Partial<{
      display_name: string;
      description: string;
      config: RateLimitConfig;
      price_monthly: number;
      price_currency: string;
      is_public: boolean;
      is_active: boolean;
      sort_order: number;
    }>,
    updatedBy: string
  ): Promise<RateLimitPlan> {
    try {
      const fields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      Object.entries(updates).forEach(([key, value]) => {
        if (key === 'config') {
          fields.push(`${key} = $${paramIndex}`);
          values.push(JSON.stringify(value));
        } else {
          fields.push(`${key} = $${paramIndex}`);
          values.push(value);
        }
        paramIndex++;
      });

      fields.push('updated_at = now()');
      values.push(planId);

      const result = await this.pool.query(
        `UPDATE rl_plans
         SET ${fields.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        throw new Error('Plan not found');
      }

      // Invalidate related caches
      CONFIG_CACHE.clear();

      await this.logEvent({
        event_type: 'config_updated',
        actor_type: 'ops',
        actor_id: updatedBy,
        target_type: 'plan',
        target_id: planId,
        payload: { action: 'update', updates },
      });

      return result.rows[0] as RateLimitPlan;
    } catch (error) {
      console.error('[RateLimitService] updatePlan error:', error);
      throw error;
    }
  }

  // ===================================================================
  // Override Management
  // ===================================================================

  /**
   * Create override
   */
  async createOverride(params: {
    target_type: 'api_key' | 'tenant' | 'region' | 'ip' | 'endpoint';
    target_id: string;
    config: Partial<RateLimitConfig>;
    reason: string;
    starts_at?: Date;
    expires_at?: Date;
    created_by: string;
  }): Promise<RateLimitOverride> {
    const { target_type, target_id, config, reason, starts_at, expires_at, created_by } = params;

    try {
      const result = await this.pool.query(
        `INSERT INTO rl_overrides (
          target_type, target_id, config, reason, starts_at, expires_at, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [target_type, target_id, JSON.stringify(config), reason, starts_at, expires_at, created_by]
      );

      // Invalidate cache
      CONFIG_CACHE.clear();

      return result.rows[0] as RateLimitOverride;
    } catch (error) {
      console.error('[RateLimitService] createOverride error:', error);
      throw error;
    }
  }

  /**
   * Remove override
   */
  async removeOverride(overrideId: string, removedBy: string): Promise<void> {
    try {
      await this.pool.query(
        'UPDATE rl_overrides SET is_active = false, updated_at = now() WHERE id = $1',
        [overrideId]
      );

      // Invalidate cache
      CONFIG_CACHE.clear();
    } catch (error) {
      console.error('[RateLimitService] removeOverride error:', error);
      throw error;
    }
  }

  // ===================================================================
  // Block Management
  // ===================================================================

  /**
   * Create block
   */
  async createBlock(params: {
    target_type: 'api_key' | 'tenant' | 'region' | 'ip' | 'endpoint';
    target_id: string;
    reason: string;
    reason_detail?: string;
    starts_at?: Date;
    expires_at?: Date;
    auto_remove?: boolean;
    created_by?: string;
    metadata?: Record<string, any>;
  }): Promise<RateLimitBlock> {
    const {
      target_type,
      target_id,
      reason,
      reason_detail,
      starts_at,
      expires_at,
      auto_remove = false,
      created_by,
      metadata,
    } = params;

    try {
      const result = await this.pool.query(
        `INSERT INTO rl_blocks (
          target_type, target_id, reason, reason_detail,
          starts_at, expires_at, auto_remove, created_by, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          target_type,
          target_id,
          reason,
          reason_detail,
          starts_at,
          expires_at,
          auto_remove,
          created_by,
          metadata ? JSON.stringify(metadata) : null,
        ]
      );

      // Invalidate cache
      BLOCK_CACHE.delete(`block:${target_type}:${target_id}`);

      return result.rows[0] as RateLimitBlock;
    } catch (error) {
      console.error('[RateLimitService] createBlock error:', error);
      throw error;
    }
  }

  /**
   * Remove block
   */
  async removeBlock(blockId: string, removedBy: string, removalReason?: string): Promise<void> {
    try {
      const result = await this.pool.query(
        `UPDATE rl_blocks
         SET is_active = false, removed_by = $2, removed_at = now(), removal_reason = $3
         WHERE id = $1
         RETURNING target_type, target_id`,
        [blockId, removedBy, removalReason]
      );

      if (result.rows.length > 0) {
        const { target_type, target_id } = result.rows[0];
        BLOCK_CACHE.delete(`block:${target_type}:${target_id}`);
      }
    } catch (error) {
      console.error('[RateLimitService] removeBlock error:', error);
      throw error;
    }
  }

  // ===================================================================
  // Metrics & Logging
  // ===================================================================

  /**
   * Log rate limit event
   */
  private async logEvent(params: {
    event_type: string;
    actor_type?: string;
    actor_id?: string;
    target_type?: string;
    target_id?: string;
    request_id?: string;
    endpoint?: string;
    method?: string;
    ip_address?: string;
    region?: string;
    limit_type?: string;
    limit_value?: number;
    current_value?: number;
    payload?: Record<string, any>;
  }): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO rl_audit_logs (
          event_type, actor_type, actor_id, target_type, target_id,
          request_id, endpoint, method, ip_address, region,
          limit_type, limit_value, current_value, payload
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          params.event_type,
          params.actor_type,
          params.actor_id,
          params.target_type,
          params.target_id,
          params.request_id,
          params.endpoint,
          params.method,
          params.ip_address,
          params.region,
          params.limit_type,
          params.limit_value,
          params.current_value,
          params.payload ? JSON.stringify(params.payload) : null,
        ]
      );
    } catch (error) {
      // Log errors but don't throw (logging should not break request flow)
      console.error('[RateLimitService] logEvent error:', error);
    }
  }

  // ===================================================================
  // Utilities
  // ===================================================================

  /**
   * Get default config (fallback)
   */
  private getDefaultConfig(): RateLimitConfig {
    return {
      rate_per_second: 10,
      burst_capacity: 50,
      daily_quota: 10000,
      monthly_quota: 300000,
      concurrent_requests: 10,
    };
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    CONFIG_CACHE.clear();
    BLOCK_CACHE.clear();
  }
}
