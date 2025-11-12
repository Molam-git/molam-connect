/**
 * Brique 79 - Redis Utilities
 *
 * Redis client for rate limiting and quota management.
 *
 * @version 1.0.0
 * @date 2025-11-12
 */

import { createClient, RedisClientType } from 'redis';

// =======================================================================
// REDIS CLIENT
// =======================================================================

let redisClient: RedisClientType | null = null;

/**
 * Get Redis client (singleton)
 */
export async function getRedisClient(): Promise<RedisClientType> {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          return new Error('Redis reconnection failed');
        }
        return Math.min(retries * 100, 3000);
      },
    },
  });

  redisClient.on('error', (err) => {
    console.error('[Redis] Error:', err);
  });

  redisClient.on('connect', () => {
    console.log('[Redis] Connected');
  });

  await redisClient.connect();

  return redisClient;
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    redisClient = null;
  }
}

// =======================================================================
// RATE LIMITING
// =======================================================================

/**
 * Increment counter with TTL
 *
 * Returns current count after increment.
 */
export async function redisIncrWithTTL(
  key: string,
  increment: number = 1,
  ttl: number = 3600
): Promise<number> {
  const client = await getRedisClient();

  // Increment
  const count = await client.incrBy(key, increment);

  // Set TTL if new key
  if (count === increment) {
    await client.expire(key, ttl);
  }

  return count;
}

/**
 * Get current count
 */
export async function redisGet(key: string): Promise<number> {
  const client = await getRedisClient();
  const value = await client.get(key);
  return value ? parseInt(value, 10) : 0;
}

/**
 * Delete key
 */
export async function redisDel(key: string): Promise<void> {
  const client = await getRedisClient();
  await client.del(key);
}

/**
 * Check rate limit using sliding window
 *
 * Returns true if allowed, false if rate limited.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; current: number; remaining: number; resetAt: Date }> {
  const client = await getRedisClient();

  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  // Use sorted set with timestamps
  const zkey = `ratelimit:${key}`;

  // Remove old entries
  await client.zRemRangeByScore(zkey, 0, windowStart);

  // Count current entries
  const current = await client.zCard(zkey);

  if (current >= limit) {
    // Get oldest entry to determine reset time
    const oldest = await client.zRange(zkey, 0, 0, { REV: false });
    const resetAt = oldest.length > 0
      ? new Date(parseFloat(oldest[0]) + windowSeconds * 1000)
      : new Date(now + windowSeconds * 1000);

    return {
      allowed: false,
      current,
      remaining: 0,
      resetAt,
    };
  }

  // Add current request
  await client.zAdd(zkey, { score: now, value: `${now}` });

  // Set TTL
  await client.expire(zkey, windowSeconds);

  return {
    allowed: true,
    current: current + 1,
    remaining: limit - current - 1,
    resetAt: new Date(now + windowSeconds * 1000),
  };
}

/**
 * Token bucket rate limiter
 *
 * More efficient for high-throughput scenarios.
 */
export async function checkTokenBucket(
  key: string,
  capacity: number,
  refillRate: number, // tokens per second
  tokensRequired: number = 1
): Promise<{ allowed: boolean; tokens: number }> {
  const client = await getRedisClient();

  const now = Date.now() / 1000;
  const bucketKey = `bucket:${key}`;

  // Get current bucket state
  const result = await client.hGetAll(bucketKey);

  let tokens = result.tokens ? parseFloat(result.tokens) : capacity;
  let lastRefill = result.lastRefill ? parseFloat(result.lastRefill) : now;

  // Refill tokens based on elapsed time
  const elapsed = now - lastRefill;
  const tokensToAdd = elapsed * refillRate;
  tokens = Math.min(capacity, tokens + tokensToAdd);

  // Check if enough tokens
  if (tokens >= tokensRequired) {
    tokens -= tokensRequired;

    // Update bucket
    await client.hSet(bucketKey, {
      tokens: tokens.toString(),
      lastRefill: now.toString(),
    });
    await client.expire(bucketKey, 3600);

    return { allowed: true, tokens };
  }

  return { allowed: false, tokens };
}

// =======================================================================
// QUOTA MANAGEMENT
// =======================================================================

/**
 * Increment daily quota counter
 */
export async function incrementDailyQuota(
  keyId: string,
  increment: number = 1
): Promise<number> {
  const date = new Date().toISOString().slice(0, 10);
  const key = `quota:daily:${keyId}:${date}`;
  return redisIncrWithTTL(key, increment, 86400); // 24 hours
}

/**
 * Increment monthly quota counter
 */
export async function incrementMonthlyQuota(
  keyId: string,
  increment: number = 1
): Promise<number> {
  const month = new Date().toISOString().slice(0, 7);
  const key = `quota:monthly:${keyId}:${month}`;
  return redisIncrWithTTL(key, increment, 2592000); // 30 days
}

/**
 * Get quota counters
 */
export async function getQuotaCounters(
  keyId: string
): Promise<{ daily: number; monthly: number }> {
  const date = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);

  const dailyKey = `quota:daily:${keyId}:${date}`;
  const monthlyKey = `quota:monthly:${keyId}:${month}`;

  const [daily, monthly] = await Promise.all([
    redisGet(dailyKey),
    redisGet(monthlyKey),
  ]);

  return { daily, monthly };
}

// =======================================================================
// CACHING
// =======================================================================

/**
 * Cache value with TTL
 */
export async function cacheSet(
  key: string,
  value: string,
  ttl: number = 3600
): Promise<void> {
  const client = await getRedisClient();
  await client.setEx(key, ttl, value);
}

/**
 * Get cached value
 */
export async function cacheGet(key: string): Promise<string | null> {
  const client = await getRedisClient();
  return client.get(key);
}

/**
 * Delete cached value
 */
export async function cacheDel(key: string): Promise<void> {
  await redisDel(key);
}

// =======================================================================
// EXPORTS
// =======================================================================

export default {
  getRedisClient,
  closeRedis,
  redisIncrWithTTL,
  redisGet,
  redisDel,
  checkRateLimit,
  checkTokenBucket,
  incrementDailyQuota,
  incrementMonthlyQuota,
  getQuotaCounters,
  cacheSet,
  cacheGet,
  cacheDel,
};
