/**
 * Redis client for rate limiting and caching
 * Brique 73 - Developer Console
 */

import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

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
  apiKey: (kid: string) => `api:key:${kid}`,
  rateLimit: (keyId: string, window: string) => `rl:${keyId}:${window}`,
  quota: (tenantType: string, tenantId: string, period: string) => `quota:${tenantType}:${tenantId}:${period}`,
  sandbox: (appId: string) => `sandbox:${appId}`,
  appConfig: (appId: string) => `app:config:${appId}`,
};

// Cache TTLs (in seconds)
export const CacheTTL = {
  apiKey: 300,        // 5 minutes
  rateLimit: 60,      // 1 minute
  quota: 3600,        // 1 hour
  sandbox: 1800,      // 30 minutes
  appConfig: 600,     // 10 minutes
};

export async function setCache(
  key: string,
  value: any,
  ttlSeconds: number = CacheTTL.apiKey
): Promise<void> {
  const client = getRedisClient();
  await client.setex(key, ttlSeconds, JSON.stringify(value));
}

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

export async function deleteCache(pattern: string): Promise<number> {
  const client = getRedisClient();

  if (!pattern.includes('*')) {
    const result = await client.del(pattern);
    return result;
  }

  const keys = await client.keys(pattern);
  if (keys.length === 0) return 0;

  return await client.del(...keys);
}

export async function incrementCounter(
  key: string,
  increment: number = 1,
  ttlSeconds: number = CacheTTL.rateLimit
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
  if (incrResult[0]) throw incrResult[0];
  return incrResult[1] as number;
}

export async function getCounter(key: string): Promise<number> {
  const client = getRedisClient();
  const value = await client.get(key);
  return value ? parseInt(value, 10) : 0;
}

export async function exists(key: string): Promise<boolean> {
  const client = getRedisClient();
  const result = await client.exists(key);
  return result === 1;
}

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
