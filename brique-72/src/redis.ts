/**
 * Redis client for caching and fast enforcement decisions
 * Brique 72 - Account Capabilities & Limits
 */

import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// Redis client singleton
let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        console.log(`Redis reconnecting in ${delay}ms (attempt ${times})`);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    redisClient.on('connect', () => {
      console.log('Redis client connected');
    });

    redisClient.on('error', (err) => {
      console.error('Redis client error:', err);
    });

    redisClient.on('ready', () => {
      console.log('Redis client ready');
    });

    redisClient.on('close', () => {
      console.log('Redis client connection closed');
    });
  }

  return redisClient;
}

// Cache key builders
export const CacheKeys = {
  // User capabilities: capabilities:{user_id}
  userCapabilities: (userId: string) => `capabilities:${userId}`,

  // User limits: limits:{user_id}:{currency}
  userLimits: (userId: string, currency: string) => `limits:${userId}:${currency}`,

  // User usage: usage:{user_id}:{limit_key}:{currency}:{date}
  userUsage: (userId: string, limitKey: string, currency: string, date: string) =>
    `usage:${userId}:${limitKey}:${currency}:${date}`,

  // Enforcement snapshot: enforce:{user_id}:{limit_key}:{currency}
  enforcementSnapshot: (userId: string, limitKey: string, currency: string) =>
    `enforce:${userId}:${limitKey}:${currency}`,

  // Active overrides: overrides:{user_id}
  activeOverrides: (userId: string) => `overrides:${userId}`,

  // KYC level cache: kyc:{user_id}
  userKyc: (userId: string) => `kyc:${userId}`,
};

// Cache TTLs (in seconds)
export const CacheTTL = {
  capabilities: 60,          // 1 minute (semi-static)
  limits: 30,                // 30 seconds (can change via ops)
  usage: 10,                 // 10 seconds (real-time tracking)
  enforcement: 30,           // 30 seconds (fast enforcement)
  overrides: 60,             // 1 minute (temporary changes)
  kyc: 300,                  // 5 minutes (rarely changes)
};

// Helper: Set JSON value with TTL
export async function setCache(
  key: string,
  value: any,
  ttlSeconds: number = CacheTTL.enforcement
): Promise<void> {
  const client = getRedisClient();
  await client.setex(key, ttlSeconds, JSON.stringify(value));
}

// Helper: Get JSON value
export async function getCache<T = any>(key: string): Promise<T | null> {
  const client = getRedisClient();
  const value = await client.get(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.error('Failed to parse cached value', { key, error });
    return null;
  }
}

// Helper: Delete key(s)
export async function deleteCache(pattern: string): Promise<number> {
  const client = getRedisClient();

  // If exact key (no wildcards), delete directly
  if (!pattern.includes('*')) {
    const result = await client.del(pattern);
    return result;
  }

  // Otherwise, scan and delete matching keys
  const keys = await client.keys(pattern);
  if (keys.length === 0) return 0;

  return await client.del(...keys);
}

// Helper: Increment counter with TTL
export async function incrementCounter(
  key: string,
  increment: number = 1,
  ttlSeconds: number = CacheTTL.usage
): Promise<number> {
  const client = getRedisClient();
  const pipeline = client.pipeline();
  pipeline.incrby(key, increment);
  pipeline.expire(key, ttlSeconds);
  const results = await pipeline.exec();

  if (!results || results.length === 0) {
    throw new Error('Failed to increment counter');
  }

  const [incrResult] = results;
  if (incrResult[0]) throw incrResult[0]; // Error
  return incrResult[1] as number;
}

// Helper: Get counter value
export async function getCounter(key: string): Promise<number> {
  const client = getRedisClient();
  const value = await client.get(key);
  return value ? parseInt(value, 10) : 0;
}

// Helper: Check if key exists
export async function exists(key: string): Promise<boolean> {
  const client = getRedisClient();
  const result = await client.exists(key);
  return result === 1;
}

// Health check
export async function redisHealthCheck(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const pong = await client.ping();
    return pong === 'PONG';
  } catch (error) {
    console.error('Redis health check failed', error);
    return false;
  }
}

// Graceful shutdown
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('Redis client closed');
  }
}

process.on('SIGINT', async () => {
  await closeRedis();
});

process.on('SIGTERM', async () => {
  await closeRedis();
});
