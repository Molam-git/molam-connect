/**
 * Enforcement Service - Fast limit and capability enforcement with Redis cache
 * Brique 72 - Account Capabilities & Limits
 *
 * Target: <5ms response time (cached)
 */

import { pool, transaction } from '../db';
import {
  getCache,
  setCache,
  deleteCache,
  CacheKeys,
  CacheTTL,
  getCounter,
  incrementCounter,
} from '../redis';

// ========================================
// Types
// ========================================

export type EnforcementDecision = 'allow' | 'block' | 'require_otp' | 'require_manual_approval';

export interface EnforcementRequest {
  userId: string;
  limitKey: string;
  amount: number;
  currency: string;
  context?: {
    ipAddress?: string;
    userAgent?: string;
    transactionType?: string;
    merchantId?: string;
    [key: string]: any;
  };
  idempotencyKey?: string;
}

export interface EnforcementResult {
  decision: EnforcementDecision;
  allowed: boolean;
  reason: string;
  appliedLimit?: {
    limitKey: string;
    limitValue: number;
    currency: string;
    origin: string;
  };
  currentUsage?: {
    amount: number;
    count: number;
    remaining: number;
  };
  requiresReview?: boolean;
  metadata?: Record<string, any>;
}

export interface UserCapability {
  capabilityKey: string;
  enabled: boolean;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  origin: string;
}

export interface UserLimit {
  limitKey: string;
  limitValue: number;
  currency: string;
  origin: string;
  unit: string;
  timeWindow: string | null;
}

export interface LimitUsage {
  userId: string;
  limitKey: string;
  currency: string;
  timeWindow: string;
  usageAmount: number;
  usageCount: number;
}

// ========================================
// Capability Enforcement
// ========================================

/**
 * Check if user has a specific capability
 * Cached for fast access
 */
export async function hasCapability(
  userId: string,
  capabilityKey: string
): Promise<{ has: boolean; reason: string }> {
  const startTime = Date.now();

  try {
    // Try cache first
    const cacheKey = CacheKeys.userCapabilities(userId);
    let capabilities = await getCache<Record<string, UserCapability>>(cacheKey);

    if (!capabilities) {
      // Cache miss - load from database
      capabilities = await loadUserCapabilities(userId);
      await setCache(cacheKey, capabilities, CacheTTL.capabilities);
    }

    const capability = capabilities[capabilityKey];

    if (!capability) {
      return {
        has: false,
        reason: `Capability '${capabilityKey}' not granted to user`,
      };
    }

    if (!capability.enabled) {
      return {
        has: false,
        reason: `Capability '${capabilityKey}' is disabled`,
      };
    }

    // Check temporal validity
    const now = new Date();
    if (capability.effectiveFrom && new Date(capability.effectiveFrom) > now) {
      return {
        has: false,
        reason: `Capability '${capabilityKey}' not yet effective`,
      };
    }

    if (capability.effectiveTo && new Date(capability.effectiveTo) < now) {
      return {
        has: false,
        reason: `Capability '${capabilityKey}' has expired`,
      };
    }

    const duration = Date.now() - startTime;
    console.log(`Capability check completed in ${duration}ms (cached: ${!!capabilities})`);

    return {
      has: true,
      reason: `Capability '${capabilityKey}' granted (${capability.origin})`,
    };
  } catch (error) {
    console.error('Error checking capability', { userId, capabilityKey, error });
    throw error;
  }
}

/**
 * Load all user capabilities from database
 */
async function loadUserCapabilities(userId: string): Promise<Record<string, UserCapability>> {
  const result = await pool.query<UserCapability>(
    `SELECT capability_key, enabled, effective_from, effective_to, origin
     FROM account_capabilities
     WHERE user_id = $1
       AND (effective_from IS NULL OR effective_from <= NOW())
       AND (effective_to IS NULL OR effective_to >= NOW())`,
    [userId]
  );

  const capabilities: Record<string, UserCapability> = {};
  for (const row of result.rows) {
    capabilities[row.capabilityKey] = row;
  }

  return capabilities;
}

// ========================================
// Limit Enforcement
// ========================================

/**
 * Enforce limit for a transaction
 * Returns decision: allow, block, require_otp, require_manual_approval
 */
export async function enforceLimit(request: EnforcementRequest): Promise<EnforcementResult> {
  const startTime = Date.now();

  try {
    // Step 1: Get effective limit for user
    const effectiveLimit = await getEffectiveLimit(
      request.userId,
      request.limitKey,
      request.currency
    );

    if (!effectiveLimit) {
      return {
        decision: 'block',
        allowed: false,
        reason: `No limit defined for '${request.limitKey}' in ${request.currency}`,
      };
    }

    // Step 2: Check if limit is unlimited (NULL value)
    if (effectiveLimit.limitValue === null || effectiveLimit.limitValue < 0) {
      return {
        decision: 'allow',
        allowed: true,
        reason: 'Unlimited',
        appliedLimit: effectiveLimit,
      };
    }

    // Step 3: Get current usage
    const usage = await getCurrentUsage(
      request.userId,
      request.limitKey,
      request.currency,
      effectiveLimit.timeWindow
    );

    const projectedUsage = usage.usageAmount + request.amount;
    const remaining = effectiveLimit.limitValue - usage.usageAmount;

    // Step 4: Enforce limit
    if (projectedUsage > effectiveLimit.limitValue) {
      return {
        decision: 'block',
        allowed: false,
        reason: `Limit exceeded: ${projectedUsage} > ${effectiveLimit.limitValue} ${request.currency}`,
        appliedLimit: effectiveLimit,
        currentUsage: {
          amount: usage.usageAmount,
          count: usage.usageCount,
          remaining: Math.max(0, remaining),
        },
      };
    }

    // Step 5: Check if approaching limit (80% threshold) → require OTP
    const utilizationPercent = (projectedUsage / effectiveLimit.limitValue) * 100;

    if (utilizationPercent >= 80 && utilizationPercent < 95) {
      return {
        decision: 'require_otp',
        allowed: false,
        reason: `Approaching limit: ${utilizationPercent.toFixed(1)}% utilized`,
        appliedLimit: effectiveLimit,
        currentUsage: {
          amount: usage.usageAmount,
          count: usage.usageCount,
          remaining,
        },
        requiresReview: true,
      };
    }

    // Step 6: Check if very close to limit (95% threshold) → require manual approval
    if (utilizationPercent >= 95) {
      return {
        decision: 'require_manual_approval',
        allowed: false,
        reason: `Near limit: ${utilizationPercent.toFixed(1)}% utilized`,
        appliedLimit: effectiveLimit,
        currentUsage: {
          amount: usage.usageAmount,
          count: usage.usageCount,
          remaining,
        },
        requiresReview: true,
      };
    }

    // Step 7: Allow transaction
    const duration = Date.now() - startTime;
    console.log(`Enforcement check completed in ${duration}ms`);

    return {
      decision: 'allow',
      allowed: true,
      reason: `Within limit: ${projectedUsage} / ${effectiveLimit.limitValue} ${request.currency}`,
      appliedLimit: effectiveLimit,
      currentUsage: {
        amount: usage.usageAmount,
        count: usage.usageCount,
        remaining,
      },
    };
  } catch (error) {
    console.error('Error enforcing limit', { request, error });
    throw error;
  }
}

/**
 * Get effective limit for user (with caching)
 * Priority: 1) Active overrides, 2) User-specific limits, 3) KYC defaults
 */
async function getEffectiveLimit(
  userId: string,
  limitKey: string,
  currency: string
): Promise<UserLimit | null> {
  const cacheKey = CacheKeys.enforcementSnapshot(userId, limitKey, currency);

  // Try cache first
  let limit = await getCache<UserLimit>(cacheKey);

  if (!limit) {
    // Cache miss - load from database using helper function
    const result = await pool.query<{ limit_value: number; origin: string; unit: string; time_window: string | null }>(
      `SELECT
         get_effective_limit($1, $2, $3) AS limit_value,
         ld.unit,
         ld.time_window,
         COALESCE(
           (SELECT 'override' FROM limit_overrides WHERE user_id = $1 AND limit_key = $2 AND currency = $3 AND status = 'active' AND expires_at > NOW() LIMIT 1),
           (SELECT origin FROM account_limits WHERE user_id = $1 AND limit_key = $2 AND currency = $3 LIMIT 1),
           'default'
         ) AS origin
       FROM limit_definitions ld
       WHERE ld.limit_key = $2`,
      [userId, limitKey, currency]
    );

    if (result.rows.length === 0 || result.rows[0].limit_value === null) {
      return null;
    }

    const row = result.rows[0];
    limit = {
      limitKey,
      limitValue: row.limit_value,
      currency,
      origin: row.origin,
      unit: row.unit,
      timeWindow: row.time_window,
    };

    // Cache for fast subsequent access
    await setCache(cacheKey, limit, CacheTTL.limits);
  }

  return limit;
}

/**
 * Get current usage for user (with caching)
 */
async function getCurrentUsage(
  userId: string,
  limitKey: string,
  currency: string,
  timeWindow: string | null
): Promise<LimitUsage> {
  const today = new Date().toISOString().split('T')[0];
  const cacheKey = CacheKeys.userUsage(userId, limitKey, currency, today);

  // Try cache first
  let usage = await getCache<LimitUsage>(cacheKey);

  if (!usage) {
    // Determine time window for query
    let windowDate: string;
    if (!timeWindow) {
      windowDate = today; // Single transaction (no aggregation)
    } else if (timeWindow === 'daily') {
      windowDate = today;
    } else if (timeWindow === 'weekly') {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      windowDate = weekStart.toISOString().split('T')[0];
    } else if (timeWindow === 'monthly') {
      const monthStart = new Date();
      monthStart.setDate(1);
      windowDate = monthStart.toISOString().split('T')[0];
    } else {
      windowDate = today;
    }

    // Load from database
    const result = await pool.query<{ usage_amount: number; usage_count: number }>(
      `SELECT COALESCE(usage_amount, 0) AS usage_amount, COALESCE(usage_count, 0) AS usage_count
       FROM limit_usage
       WHERE user_id = $1 AND limit_key = $2 AND currency = $3 AND time_window = $4`,
      [userId, limitKey, currency, windowDate]
    );

    usage = {
      userId,
      limitKey,
      currency,
      timeWindow: windowDate,
      usageAmount: result.rows[0]?.usage_amount || 0,
      usageCount: result.rows[0]?.usage_count || 0,
    };

    // Cache briefly (usage changes frequently)
    await setCache(cacheKey, usage, CacheTTL.usage);
  }

  return usage;
}

// ========================================
// Usage Tracking
// ========================================

/**
 * Record usage for a transaction (idempotent)
 * Called after transaction succeeds
 */
export async function recordUsage(
  userId: string,
  limitKey: string,
  amount: number,
  currency: string,
  idempotencyKey?: string
): Promise<void> {
  await transaction(async (client) => {
    // Check idempotency
    if (idempotencyKey) {
      const existing = await client.query(
        `SELECT id FROM limit_audit WHERE payload->>'idempotency_key' = $1`,
        [idempotencyKey]
      );

      if (existing.rows.length > 0) {
        console.log('Usage already recorded (idempotent)', { idempotencyKey });
        return;
      }
    }

    // Determine time window
    const today = new Date().toISOString().split('T')[0];

    // Upsert usage
    await client.query(
      `INSERT INTO limit_usage (user_id, limit_key, currency, time_window, usage_amount, usage_count)
       VALUES ($1, $2, $3, $4, $5, 1)
       ON CONFLICT (user_id, limit_key, currency, time_window)
       DO UPDATE SET
         usage_amount = limit_usage.usage_amount + EXCLUDED.usage_amount,
         usage_count = limit_usage.usage_count + 1`,
      [userId, limitKey, currency, today, amount]
    );

    // Create audit log
    await client.query(
      `INSERT INTO limit_audit (user_id, action, entity_type, payload)
       VALUES ($1, 'record_usage', 'usage', $2)`,
      [
        userId,
        JSON.stringify({
          limitKey,
          amount,
          currency,
          timeWindow: today,
          idempotencyKey,
        }),
      ]
    );

    // Invalidate cache
    const cacheKey = CacheKeys.userUsage(userId, limitKey, currency, today);
    await deleteCache(cacheKey);
  });
}

// ========================================
// Cache Invalidation
// ========================================

/**
 * Invalidate all caches for a user
 * Called when limits/capabilities change
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  await deleteCache(`*:${userId}:*`);
  await deleteCache(CacheKeys.userCapabilities(userId));
  console.log('Invalidated cache for user', { userId });
}

/**
 * Invalidate specific limit cache
 */
export async function invalidateLimitCache(
  userId: string,
  limitKey: string,
  currency: string
): Promise<void> {
  const enforcementKey = CacheKeys.enforcementSnapshot(userId, limitKey, currency);
  await deleteCache(enforcementKey);
  console.log('Invalidated limit cache', { userId, limitKey, currency });
}

// ========================================
// Batch Operations
// ========================================

/**
 * Enforce multiple limits at once
 * Useful for complex transactions that affect multiple limits
 */
export async function enforceMultipleLimits(
  userId: string,
  checks: Array<{ limitKey: string; amount: number; currency: string }>
): Promise<{ allowed: boolean; results: EnforcementResult[] }> {
  const results: EnforcementResult[] = [];
  let allAllowed = true;

  for (const check of checks) {
    const result = await enforceLimit({
      userId,
      limitKey: check.limitKey,
      amount: check.amount,
      currency: check.currency,
    });

    results.push(result);

    if (!result.allowed) {
      allAllowed = false;
    }
  }

  return { allowed: allAllowed, results };
}

/**
 * Warm cache for user (useful after login or KYC upgrade)
 */
export async function warmUserCache(userId: string): Promise<void> {
  // Load capabilities
  const capabilities = await loadUserCapabilities(userId);
  await setCache(CacheKeys.userCapabilities(userId), capabilities, CacheTTL.capabilities);

  // Load limits for common currencies
  const currencies = ['USD', 'XOF', 'EUR'];
  const limitKeys = ['max_single_tx', 'max_daily_out', 'max_monthly_volume'];

  for (const currency of currencies) {
    for (const limitKey of limitKeys) {
      const limit = await getEffectiveLimit(userId, limitKey, currency);
      if (limit) {
        const cacheKey = CacheKeys.enforcementSnapshot(userId, limitKey, currency);
        await setCache(cacheKey, limit, CacheTTL.limits);
      }
    }
  }

  console.log('Warmed cache for user', { userId });
}
