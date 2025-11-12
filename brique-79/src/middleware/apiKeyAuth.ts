/**
 * Brique 79 - API Key Authentication Middleware
 *
 * Middleware for authenticating and authorizing API requests using API keys.
 * Enforces:
 * - Key validation
 * - Scope enforcement
 * - IP restrictions
 * - Rate limiting
 * - Quota management
 * - Usage tracking
 *
 * @version 1.0.0
 * @date 2025-11-12
 */

import { Request, Response, NextFunction } from 'express';
import { validateAPIKey, checkQuota, recordUsage, ValidatedKey } from '../services/apiKeysService';
import { checkRateLimit, checkTokenBucket } from '../utils/redis';

// =======================================================================
// TYPES
// =======================================================================

export interface AuthenticatedRequest extends Request {
  apiKey?: ValidatedKey;
  apiKeyId?: string;
}

// =======================================================================
// MIDDLEWARE
// =======================================================================

/**
 * API Key Authentication Middleware
 *
 * Usage:
 *   app.use('/api/v1', apiKeyAuth());
 *   app.get('/api/v1/payments', requireScope('payments:read'), handler);
 */
export function apiKeyAuth(options?: {
  required?: boolean;
  checkQuota?: boolean;
  checkRateLimit?: boolean;
}) {
  const opts = {
    required: true,
    checkQuota: true,
    checkRateLimit: true,
    ...options,
  };

  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Extract API key from Authorization header
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

      // Also check X-API-Key header (alternative)
      const apiKeyHeader = req.headers['x-api-key'] as string;
      const apiKeyToken = token || apiKeyHeader;

      if (!apiKeyToken) {
        if (!opts.required) {
          return next();
        }
        res.status(401).json({ error: 'missing_api_key', message: 'API key required' });
        return;
      }

      // Parse key format: key_id.secret or just secret
      const [keyId, secret] = apiKeyToken.includes('.')
        ? apiKeyToken.split('.', 2)
        : [apiKeyToken.substring(0, apiKeyToken.indexOf('_', apiKeyToken.indexOf('_') + 1) + 13), apiKeyToken];

      if (!keyId || !secret) {
        res.status(401).json({ error: 'invalid_api_key_format', message: 'API key format invalid' });
        return;
      }

      // Get request context
      const context = {
        ip: getClientIp(req),
        scope: extractScope(req),
        currency: req.body?.currency || req.query?.currency,
        country: req.headers['x-country'] as string,
        origin: req.headers['origin'] as string,
      };

      // Validate API key
      const validation = await validateAPIKey(keyId, secret, context);

      if (!validation.valid || !validation.key) {
        res.status(401).json({ error: validation.error || 'invalid_api_key', message: 'API key validation failed' });
        return;
      }

      // Attach validated key to request
      req.apiKey = validation.key;
      req.apiKeyId = keyId;

      // Check quota
      if (opts.checkQuota) {
        const quotaCheck = await checkQuota(keyId);
        if (!quotaCheck.allowed) {
          res.status(429).json({
            error: 'quota_exceeded',
            message: 'API quota exceeded',
            daily_remaining: quotaCheck.daily_remaining,
            monthly_remaining: quotaCheck.monthly_remaining,
          });
          return;
        }

        // Add quota headers
        if (quotaCheck.daily_remaining !== undefined) {
          res.setHeader('X-RateLimit-Remaining-Day', quotaCheck.daily_remaining.toString());
        }
        if (quotaCheck.monthly_remaining !== undefined) {
          res.setHeader('X-RateLimit-Remaining-Month', quotaCheck.monthly_remaining.toString());
        }
      }

      // Check rate limit (using Redis)
      if (opts.checkRateLimit && validation.key.key.restrictions.rate_limit) {
        const rateLimit = validation.key.key.restrictions.rate_limit;

        if (rateLimit.requests_per_second) {
          const bucketCheck = await checkTokenBucket(
            keyId,
            rateLimit.burst || rateLimit.requests_per_second * 2,
            rateLimit.requests_per_second,
            1
          );

          if (!bucketCheck.allowed) {
            res.status(429).json({
              error: 'rate_limit_exceeded',
              message: 'Rate limit exceeded',
              retry_after: 1, // seconds
            });
            return;
          }

          res.setHeader('X-RateLimit-Limit', rateLimit.requests_per_second.toString());
          res.setHeader('X-RateLimit-Remaining', Math.floor(bucketCheck.tokens).toString());
        }
      }

      // Record usage (async, don't await)
      recordUsage(keyId, context.scope || 'unknown', true).catch((err) => {
        console.error('[APIKeyAuth] Failed to record usage:', err);
      });

      next();
    } catch (error: any) {
      console.error('[APIKeyAuth] Authentication failed:', error);
      res.status(500).json({ error: 'internal_error', message: 'Authentication error' });
    }
  };
}

/**
 * Require specific scope middleware
 *
 * Usage:
 *   app.post('/api/v1/payments', apiKeyAuth(), requireScope('payments:create'), handler);
 */
export function requireScope(scope: string | string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.apiKey) {
      res.status(401).json({ error: 'unauthorized', message: 'API key required' });
      return;
    }

    const requiredScopes = Array.isArray(scope) ? scope : [scope];
    const hasScope = requiredScopes.some((s) => req.apiKey!.scopes.includes(s));

    if (!hasScope) {
      res.status(403).json({
        error: 'insufficient_scope',
        message: 'API key does not have required scope',
        required: requiredScopes,
        available: req.apiKey.scopes,
      });
      return;
    }

    next();
  };
}

/**
 * Require any of the specified scopes
 */
export function requireAnyScope(...scopes: string[]) {
  return requireScope(scopes);
}

/**
 * Require all of the specified scopes
 */
export function requireAllScopes(...scopes: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.apiKey) {
      res.status(401).json({ error: 'unauthorized', message: 'API key required' });
      return;
    }

    const hasAllScopes = scopes.every((s) => req.apiKey!.scopes.includes(s));

    if (!hasAllScopes) {
      res.status(403).json({
        error: 'insufficient_scope',
        message: 'API key does not have all required scopes',
        required: scopes,
        available: req.apiKey.scopes,
      });
      return;
    }

    next();
  };
}

/**
 * Rate limit middleware (standalone, can be used without API key auth)
 */
export function rateLimit(options: {
  windowSeconds: number;
  maxRequests: number;
  keyPrefix?: string;
  keyExtractor?: (req: Request) => string;
}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = options.keyExtractor
        ? options.keyExtractor(req)
        : `${options.keyPrefix || 'ratelimit'}:${getClientIp(req)}`;

      const result = await checkRateLimit(key, options.maxRequests, options.windowSeconds);

      res.setHeader('X-RateLimit-Limit', options.maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
      res.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());

      if (!result.allowed) {
        res.status(429).json({
          error: 'rate_limit_exceeded',
          message: 'Rate limit exceeded',
          retry_after: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
        });
        return;
      }

      next();
    } catch (error: any) {
      console.error('[RateLimit] Error:', error);
      // Fail open for availability
      next();
    }
  };
}

// =======================================================================
// HELPER FUNCTIONS
// =======================================================================

/**
 * Get client IP address
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Extract scope from request
 *
 * Maps HTTP method and path to scope.
 */
function extractScope(req: Request): string {
  const method = req.method.toLowerCase();
  const path = req.path;

  // Map routes to scopes
  if (path.startsWith('/payments')) {
    if (method === 'post') return 'payments:create';
    if (method === 'get') return 'payments:read';
    if (method === 'put' || method === 'patch') return 'payments:update';
    if (method === 'delete') return 'payments:delete';
  }

  if (path.startsWith('/refunds')) {
    if (method === 'post') return 'refunds:create';
    if (method === 'get') return 'refunds:read';
  }

  if (path.startsWith('/webhooks')) {
    return 'webhooks:manage';
  }

  if (path.startsWith('/reports')) {
    return 'reports:read';
  }

  if (path.startsWith('/merchants')) {
    return 'merchants:manage';
  }

  return 'unknown';
}

/**
 * Middleware to record API usage (response hook)
 */
export function recordAPIUsage() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const originalSend = res.send;

    res.send = function (data: any): Response {
      // Record usage after response
      if (req.apiKeyId) {
        const success = res.statusCode >= 200 && res.statusCode < 400;
        const scope = extractScope(req);

        recordUsage(req.apiKeyId, scope, success).catch((err) => {
          console.error('[APIKeyAuth] Failed to record usage:', err);
        });
      }

      return originalSend.call(this, data);
    };

    next();
  };
}

// =======================================================================
// EXPORTS
// =======================================================================

export default {
  apiKeyAuth,
  requireScope,
  requireAnyScope,
  requireAllScopes,
  rateLimit,
  recordAPIUsage,
};
