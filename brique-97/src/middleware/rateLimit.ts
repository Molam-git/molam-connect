/**
 * Brique 97 — Rate Limiting Middleware
 *
 * Protects endpoints from abuse using sliding window rate limiting
 */

import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

// Redis client for rate limiting
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_RATE_LIMIT_DB || '1'),
});

redis.on('error', (err) => {
  console.error('Redis rate limiter error:', err);
});

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  max: number; // Max requests per window
  keyGenerator?: (req: Request) => string; // Custom key generator
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

/**
 * Rate limiter middleware factory
 */
export function rateLimiter(config: RateLimitConfig) {
  const {
    windowMs,
    max,
    keyGenerator = defaultKeyGenerator,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = config;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = keyGenerator(req);
      const now = Date.now();
      const windowStart = now - windowMs;

      // Redis key for this rate limit window
      const redisKey = `rate_limit:${key}`;

      // Use Redis sorted set for sliding window
      const multi = redis.multi();

      // Remove old entries outside the window
      multi.zremrangebyscore(redisKey, 0, windowStart);

      // Count requests in current window
      multi.zcard(redisKey);

      // Add current request
      multi.zadd(redisKey, now, `${now}-${Math.random()}`);

      // Set expiry
      multi.expire(redisKey, Math.ceil(windowMs / 1000));

      const results = await multi.exec();

      if (!results) {
        throw new Error('Redis multi command failed');
      }

      const count = (results[1][1] as number) || 0;

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', max.toString());
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count - 1).toString());
      res.setHeader('X-RateLimit-Reset', new Date(now + windowMs).toISOString());

      if (count >= max) {
        return res.status(429).json({
          error: 'too_many_requests',
          message: 'Rate limit exceeded',
          retry_after: Math.ceil(windowMs / 1000),
        });
      }

      // Hook into response to remove request from count if configured
      if (skipSuccessfulRequests || skipFailedRequests) {
        const originalSend = res.send;

        res.send = function (data: any) {
          const statusCode = res.statusCode;
          const shouldSkip =
            (skipSuccessfulRequests && statusCode < 400) || (skipFailedRequests && statusCode >= 400);

          if (shouldSkip) {
            // Remove this request from count
            redis.zrem(redisKey, `${now}-${Math.random()}`).catch((err) => {
              console.error('Failed to remove rate limit entry:', err);
            });
          }

          return originalSend.call(this, data);
        };
      }

      next();
    } catch (error) {
      console.error('Rate limiter error:', error);
      // Fail open (allow request) if rate limiter fails
      next();
    }
  };
}

/**
 * Default key generator (IP + user ID if authenticated)
 */
function defaultKeyGenerator(req: Request): string {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const userId = (req as any).user?.id || 'anonymous';
  return `${ip}:${userId}`;
}

/**
 * IP-based key generator
 */
export function ipKeyGenerator(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * User-based key generator
 */
export function userKeyGenerator(req: Request): string {
  return (req as any).user?.id || 'anonymous';
}

/**
 * Merchant-based key generator
 */
export function merchantKeyGenerator(req: Request): string {
  return req.body?.merchant_id || req.query?.merchant_id || 'unknown';
}

/**
 * Global rate limiter (100 req/min per IP)
 */
export const globalRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  keyGenerator: ipKeyGenerator,
});

/**
 * Strict rate limiter for sensitive endpoints (10 req/min per user)
 */
export const strictRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: userKeyGenerator,
});

/**
 * Shutdown redis connection
 */
export async function shutdownRedis() {
  await redis.quit();
}
