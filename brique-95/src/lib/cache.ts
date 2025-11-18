/**
 * Redis cache utilities for high-performance caching
 * Used for SIRA responses and routing decisions
 */

import Redis from 'ioredis';
import { recordRedisOperation } from '../telemetry/prom';
import { logCacheOperation } from '../telemetry/logger';

// Create Redis client
export const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('✓ Redis connected');
});

/**
 * Get value from cache
 */
export async function cacheGet<T = any>(key: string): Promise<T | null> {
  const startTime = Date.now();
  try {
    const value = await redis.get(key);
    const duration = Date.now() - startTime;

    // Determine cache type from key prefix
    const cacheType = key.startsWith('sira:') ? 'sira_cache' : 'decision_cache';

    // Record metrics
    recordRedisOperation('get', duration);
    logCacheOperation({
      operation: 'get',
      type: cacheType,
      hit: !!value,
      key: key.substring(0, 50), // Truncate for logging
      duration_ms: duration,
    });

    if (!value) return null;
    return JSON.parse(value) as T;
  } catch (error) {
    const duration = Date.now() - startTime;
    recordRedisOperation('get', duration);
    console.error(`Cache get error for key ${key}:`, error);
    return null;
  }
}

/**
 * Set value in cache with TTL
 */
export async function cacheSet(
  key: string,
  value: any,
  ttlSeconds: number = 30
): Promise<boolean> {
  const startTime = Date.now();
  try {
    const serialized = JSON.stringify(value);
    await redis.set(key, serialized, 'EX', ttlSeconds);
    const duration = Date.now() - startTime;

    const cacheType = key.startsWith('sira:') ? 'sira_cache' : 'decision_cache';

    recordRedisOperation('set', duration);
    logCacheOperation({
      operation: 'set',
      type: cacheType,
      key: key.substring(0, 50),
      duration_ms: duration,
    });

    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    recordRedisOperation('set', duration);
    console.error(`Cache set error for key ${key}:`, error);
    return false;
  }
}

/**
 * Delete value from cache
 */
export async function cacheDelete(key: string): Promise<boolean> {
  const startTime = Date.now();
  try {
    await redis.del(key);
    const duration = Date.now() - startTime;

    const cacheType = key.startsWith('sira:') ? 'sira_cache' : 'decision_cache';

    recordRedisOperation('del', duration);
    logCacheOperation({
      operation: 'delete',
      type: cacheType,
      key: key.substring(0, 50),
      duration_ms: duration,
    });

    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    recordRedisOperation('del', duration);
    console.error(`Cache delete error for key ${key}:`, error);
    return false;
  }
}

/**
 * Delete multiple keys matching a pattern
 */
export async function cacheDeletePattern(pattern: string): Promise<number> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length === 0) return 0;
    await redis.del(...keys);
    return keys.length;
  } catch (error) {
    console.error(`Cache delete pattern error for ${pattern}:`, error);
    return 0;
  }
}

/**
 * Increment counter in cache
 */
export async function cacheIncrement(key: string, ttlSeconds: number = 3600): Promise<number> {
  try {
    const value = await redis.incr(key);
    if (value === 1) {
      // First increment, set TTL
      await redis.expire(key, ttlSeconds);
    }
    return value;
  } catch (error) {
    console.error(`Cache increment error for key ${key}:`, error);
    return 0;
  }
}

/**
 * Check if key exists in cache
 */
export async function cacheExists(key: string): Promise<boolean> {
  try {
    const exists = await redis.exists(key);
    return exists === 1;
  } catch (error) {
    console.error(`Cache exists error for key ${key}:`, error);
    return false;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats() {
  try {
    const info = await redis.info('stats');
    const keyspace = await redis.info('keyspace');
    return {
      info,
      keyspace,
      connected: redis.status === 'ready'
    };
  } catch (error) {
    console.error('Cache stats error:', error);
    return {
      info: '',
      keyspace: '',
      connected: false
    };
  }
}

/**
 * Flush all cache (use with caution!)
 */
export async function cacheFlushAll(): Promise<boolean> {
  try {
    await redis.flushall();
    return true;
  } catch (error) {
    console.error('Cache flush all error:', error);
    return false;
  }
}

export default redis;
