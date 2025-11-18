/**
 * Redis Service
 *
 * Caching and rate limiting with Redis
 */

import Redis from 'ioredis';
import { logger } from '../utils/logger';

export class RedisService {
  private client: Redis;
  private isConnected: boolean = false;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    this.client.on('connect', () => {
      this.isConnected = true;
      logger.info('Redis connected');
    });

    this.client.on('error', (err) => {
      logger.error({ err }, 'Redis error');
      this.isConnected = false;
    });

    this.client.on('close', () => {
      this.isConnected = false;
      logger.warn('Redis connection closed');
    });
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (!value) return null;

      return JSON.parse(value) as T;
    } catch (error) {
      logger.error({ error, key }, 'Redis GET error');
      return null;
    }
  }

  /**
   * Set value in cache with optional TTL
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);

      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, serialized);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (error) {
      logger.error({ error, key }, 'Redis SET error');
    }
  }

  /**
   * Delete key
   */
  async delete(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      logger.error({ error, key }, 'Redis DEL error');
    }
  }

  /**
   * Increment counter (for rate limiting)
   */
  async increment(key: string, ttlSeconds?: number): Promise<number> {
    try {
      const value = await this.client.incr(key);

      if (ttlSeconds && value === 1) {
        await this.client.expire(key, ttlSeconds);
      }

      return value;
    } catch (error) {
      logger.error({ error, key }, 'Redis INCR error');
      return 0;
    }
  }

  /**
   * Check rate limit (sliding window)
   */
  async checkRateLimit(
    identifier: string,
    maxRequests: number,
    windowSeconds: number
  ): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
    const key = `ratelimit:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;

    try {
      // Remove old entries
      await this.client.zremrangebyscore(key, 0, windowStart);

      // Count current entries
      const count = await this.client.zcard(key);

      if (count >= maxRequests) {
        const oldest = await this.client.zrange(key, 0, 0, 'WITHSCORES');
        const resetAt = new Date(parseInt(oldest[1] || '0', 10) + windowSeconds * 1000);

        return {
          allowed: false,
          remaining: 0,
          resetAt,
        };
      }

      // Add new entry
      await this.client.zadd(key, now, `${now}`);
      await this.client.expire(key, windowSeconds);

      return {
        allowed: true,
        remaining: maxRequests - count - 1,
        resetAt: new Date(now + windowSeconds * 1000),
      };
    } catch (error) {
      logger.error({ error, identifier }, 'Rate limit check error');
      // Fail open on error
      return {
        allowed: true,
        remaining: maxRequests,
        resetAt: new Date(now + windowSeconds * 1000),
      };
    }
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    await this.client.quit();
    logger.info('Redis connection closed');
  }
}
