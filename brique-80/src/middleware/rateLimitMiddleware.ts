// =====================================================================
// Rate Limiting Middleware
// =====================================================================
// Express middleware for API rate limiting
// Date: 2025-11-12
// =====================================================================

import { Request, Response, NextFunction } from 'express';
import { RateLimitService } from '../services/rateLimitService';
import { Pool } from 'pg';

// =====================================================================
// Types
// =====================================================================

export interface RateLimitOptions {
  /**
   * Check quota in addition to rate limit
   * Default: true
   */
  checkQuota?: boolean;

  /**
   * Fail-closed if rate limiting service unavailable
   * Default: false (fail-open)
   */
  failClosed?: boolean;

  /**
   * Require API key for this route
   * Default: true
   */
  requireApiKey?: boolean;

  /**
   * Skip rate limiting based on custom logic
   */
  skip?: (req: Request) => boolean | Promise<boolean>;

  /**
   * Custom rate limit config override (for specific endpoints)
   */
  configOverride?: {
    rate_per_second?: number;
    burst_capacity?: number;
    daily_quota?: number;
    monthly_quota?: number;
  };

  /**
   * Emit metrics to external system
   */
  onThrottle?: (req: Request, result: any) => void | Promise<void>;

  /**
   * Emit metrics for allowed requests
   */
  onAllow?: (req: Request, result: any) => void | Promise<void>;
}

// Extend Express Request to include rate limit context
declare global {
  namespace Express {
    interface Request {
      apiKey?: {
        id: string;
        key_id: string;
        tenant_id: string;
        tenant_type: string;
        mode: string;
        scopes: string[];
        status: string;
        restrictions?: any;
      };
      rateLimitInfo?: {
        allowed: boolean;
        tokensRemaining?: number;
        dailyUsage?: number;
        monthlyUsage?: number;
        retryAfter?: number;
        reason?: string;
      };
      requestId?: string;
    }
  }
}

// =====================================================================
// Middleware Factory
// =====================================================================

export function createRateLimitMiddleware(pool: Pool, options: RateLimitOptions = {}) {
  const {
    checkQuota = true,
    failClosed = false,
    requireApiKey = true,
    skip,
    configOverride,
    onThrottle,
    onAllow,
  } = options;

  const rateLimitService = new RateLimitService(pool);

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if should skip rate limiting
      if (skip && (await skip(req))) {
        return next();
      }

      // Extract API key from previous middleware (apiKeyAuth)
      const apiKey = req.apiKey;

      if (!apiKey) {
        if (requireApiKey) {
          return res.status(401).json({
            error: 'unauthorized',
            message: 'API key required',
          });
        } else {
          // No API key, skip rate limiting
          return next();
        }
      }

      // Extract request context
      const endpoint = req.path;
      const method = req.method;
      const ipAddress = getClientIp(req);
      const requestId = req.requestId || req.headers['x-request-id'] as string;
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

      // Check rate limit
      const result = await rateLimitService.checkRateLimit({
        apiKeyId: apiKey.key_id,
        tenantId: apiKey.tenant_id,
        endpoint,
        ipAddress,
        idempotencyKey,
      });

      // Store rate limit info on request object
      req.rateLimitInfo = {
        allowed: result.allowed,
        tokensRemaining: result.tokensRemaining,
        dailyUsage: result.dailyUsage,
        monthlyUsage: result.monthlyUsage,
        retryAfter: result.retry_after,
        reason: result.reason,
      };

      // Set rate limit headers (always, even if denied)
      if (result.config) {
        res.setHeader('X-RateLimit-Limit', result.config.rate_per_second.toString());
        res.setHeader('X-RateLimit-Burst', result.config.burst_capacity.toString());
        res.setHeader('X-RateLimit-Daily-Quota', result.config.daily_quota.toString());
        res.setHeader('X-RateLimit-Monthly-Quota', result.config.monthly_quota.toString());
      }

      if (result.tokensRemaining !== undefined) {
        res.setHeader('X-RateLimit-Remaining', result.tokensRemaining.toString());
      }

      if (result.dailyUsage !== undefined) {
        res.setHeader('X-RateLimit-Daily-Usage', result.dailyUsage.toString());

        // Calculate percentage and warn if approaching limit
        if (result.config) {
          const dailyPercent = (result.dailyUsage / result.config.daily_quota) * 100;
          res.setHeader('X-RateLimit-Daily-Percent', dailyPercent.toFixed(1));
        }
      }

      if (result.monthlyUsage !== undefined) {
        res.setHeader('X-RateLimit-Monthly-Usage', result.monthlyUsage.toString());
      }

      // Check if allowed
      if (!result.allowed) {
        // Set Retry-After header
        if (result.retry_after) {
          res.setHeader('Retry-After', result.retry_after.toString());
        }

        // Emit throttle event
        if (onThrottle) {
          try {
            await onThrottle(req, result);
          } catch (error) {
            console.error('[RateLimitMiddleware] onThrottle callback error:', error);
          }
        }

        // Return 429 Too Many Requests
        return res.status(429).json({
          error: 'rate_limit_exceeded',
          message: getRateLimitMessage(result.reason),
          retry_after: result.retry_after,
          limit: result.config?.rate_per_second,
          daily_quota: result.config?.daily_quota,
          daily_usage: result.dailyUsage,
          monthly_quota: result.config?.monthly_quota,
          monthly_usage: result.monthlyUsage,
          documentation: 'https://docs.molam.com/api/rate-limits',
        });
      }

      // Request allowed, emit allow event
      if (onAllow) {
        try {
          await onAllow(req, result);
        } catch (error) {
          console.error('[RateLimitMiddleware] onAllow callback error:', error);
        }
      }

      // Continue to next middleware
      next();
    } catch (error: any) {
      console.error('[RateLimitMiddleware] Error:', error);

      // Fail-open or fail-closed based on configuration
      if (failClosed) {
        return res.status(503).json({
          error: 'service_unavailable',
          message: 'Rate limiting service temporarily unavailable',
          retry_after: 60,
        });
      } else {
        // Fail-open: allow request but log error
        console.warn('[RateLimitMiddleware] Failing open due to error');
        next();
      }
    }
  };
}

// =====================================================================
// Convenience Middleware Presets
// =====================================================================

/**
 * Standard rate limiting (check quota)
 */
export function rateLimitMiddleware(pool: Pool, options: RateLimitOptions = {}) {
  return createRateLimitMiddleware(pool, {
    checkQuota: true,
    requireApiKey: true,
    ...options,
  });
}

/**
 * Strict rate limiting (fail-closed)
 */
export function strictRateLimitMiddleware(pool: Pool, options: RateLimitOptions = {}) {
  return createRateLimitMiddleware(pool, {
    checkQuota: true,
    requireApiKey: true,
    failClosed: true,
    ...options,
  });
}

/**
 * Lenient rate limiting (no quota check, fail-open)
 */
export function lenientRateLimitMiddleware(pool: Pool, options: RateLimitOptions = {}) {
  return createRateLimitMiddleware(pool, {
    checkQuota: false,
    requireApiKey: false,
    failClosed: false,
    ...options,
  });
}

/**
 * Rate limiting for public endpoints (no API key required)
 * Uses IP-based rate limiting
 */
export function publicRateLimitMiddleware(pool: Pool, options: RateLimitOptions = {}) {
  return createRateLimitMiddleware(pool, {
    checkQuota: true,
    requireApiKey: false,
    failClosed: false,
    ...options,
  });
}

// =====================================================================
// Utility Functions
// =====================================================================

/**
 * Get client IP address from request
 */
function getClientIp(req: Request): string {
  // Check common proxy headers
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded;
    return ips[0].trim();
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return typeof realIp === 'string' ? realIp : realIp[0];
  }

  const cfConnectingIp = req.headers['cf-connecting-ip'];
  if (cfConnectingIp) {
    return typeof cfConnectingIp === 'string' ? cfConnectingIp : cfConnectingIp[0];
  }

  // Fallback to socket address
  return req.socket.remoteAddress || 'unknown';
}

/**
 * Get user-friendly rate limit message
 */
function getRateLimitMessage(reason?: string): string {
  switch (reason) {
    case 'rate_limit':
      return 'Too many requests. Please slow down and try again.';
    case 'daily_quota':
      return 'Daily quota exceeded. Your quota will reset at midnight UTC.';
    case 'monthly_quota':
      return 'Monthly quota exceeded. Please upgrade your plan or wait until next month.';
    case 'blocked:ops_manual':
      return 'Your API key has been temporarily blocked. Please contact support.';
    case 'blocked:sira_fraud':
      return 'Suspicious activity detected. Your API key has been blocked for security reasons.';
    case 'blocked:sira_abuse':
      return 'Abuse detected. Please contact support to resolve this issue.';
    case 'blocked:quota_exceeded':
      return 'Your quota has been exceeded and your key is temporarily blocked.';
    case 'blocked:security':
      return 'Security incident detected. Your API key has been blocked.';
    case 'blocked:payment_failed':
      return 'Payment method failed. Please update your billing information.';
    case 'blocked:tos_violation':
      return 'Terms of Service violation. Your API key has been suspended.';
    default:
      return 'Rate limit exceeded. Please try again later.';
  }
}

// =====================================================================
// Express Response Extensions (Optional)
// =====================================================================

/**
 * Add helper method to Response object for rate limit info
 */
export function extendExpressResponse() {
  const response = (global as any).Response || require('express').response;

  // Add method to check if request was rate limited
  response.wasRateLimited = function (this: Response) {
    return this.statusCode === 429;
  };

  // Add method to get remaining rate limit
  response.getRateLimitRemaining = function (this: Response): number | null {
    const header = this.getHeader('X-RateLimit-Remaining');
    return header ? parseInt(header as string, 10) : null;
  };

  // Add method to get daily quota usage
  response.getDailyQuotaUsage = function (this: Response): number | null {
    const header = this.getHeader('X-RateLimit-Daily-Usage');
    return header ? parseInt(header as string, 10) : null;
  };
}

// =====================================================================
// Rate Limit Reset Utility (for testing)
// =====================================================================

/**
 * Reset rate limit for a specific API key (testing/admin only)
 */
export async function resetRateLimit(pool: Pool, apiKeyId: string): Promise<void> {
  const rateLimitService = new RateLimitService(pool);

  // Clear cache
  rateLimitService.clearCache();

  // Reset Redis counters
  const { rateLimitRedis } = require('../utils/redisClient');
  await rateLimitRedis.resetRateLimit(apiKeyId);

  console.log(`[RateLimitMiddleware] Rate limit reset for ${apiKeyId}`);
}

// =====================================================================
// Export
// =====================================================================

export default rateLimitMiddleware;
