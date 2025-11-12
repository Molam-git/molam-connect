/**
 * API Key Authentication Middleware
 * Brique 73 - Developer Console
 */

import { Request, Response, NextFunction } from 'express';
import { verifyApiKey, updateKeyLastUsed } from '../services/keyManagement';
import { checkRateLimit } from '../utils/rateLimiter';
import { pool } from '../db';

export interface AuthRequest extends Request {
  apiKey?: {
    keyId: string;
    appId: string;
    scopes: string[];
    kid: string;
  };
}

/**
 * Middleware: Verify API key from Authorization header
 * Format: Authorization: Bearer mk_abc123xyz...
 */
export async function apiKeyAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      res.status(401).json({ error: 'missing_authorization_header' });
      return;
    }

    // Parse header
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      res.status(401).json({ error: 'invalid_authorization_format' });
      return;
    }

    const secret = parts[1];

    // Extract kid from secret (format: mk_timestamp-random)
    if (!secret.startsWith('mk_')) {
      res.status(401).json({ error: 'invalid_api_key_format' });
      return;
    }

    // For demo, kid is first 20 chars of secret
    // In production, use separate kid header or parse from secret structure
    const kid = secret.substring(0, 20);

    // Verify key
    const verification = await verifyApiKey(kid, secret);

    if (!verification.valid || !verification.keyId || !verification.appId) {
      res.status(401).json({ error: 'invalid_api_key' });
      return;
    }

    // Attach key info to request
    req.apiKey = {
      keyId: verification.keyId,
      appId: verification.appId,
      scopes: verification.scopes || [],
      kid,
    };

    // Update last used (async)
    updateKeyLastUsed(verification.keyId, req.ip).catch(err =>
      console.error('Failed to update last used', err)
    );

    // Log request (async - see requestLogger middleware)

    next();
  } catch (error) {
    console.error('API key auth error', error);
    res.status(500).json({ error: 'authentication_error' });
  }
}

/**
 * Middleware: Check rate limit
 */
export function rateLimitMiddleware(maxPerMinute: number = 60) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.apiKey) {
        return next();
      }

      const result = await checkRateLimit(req.apiKey.keyId, {
        maxRequests: maxPerMinute,
        windowSeconds: 60,
        burstMultiplier: 1.5,
      });

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', result.limit);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', result.resetAt);

      if (!result.allowed) {
        res.status(429).json({
          error: 'rate_limit_exceeded',
          message: `Rate limit of ${result.limit} requests per minute exceeded`,
          retryAfter: result.resetAt - Math.floor(Date.now() / 1000),
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Rate limit error', error);
      next(); // Fail open
    }
  };
}

/**
 * Middleware: Check required scopes
 */
export function requireScopes(requiredScopes: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.apiKey) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const hasAllScopes = requiredScopes.every(scope =>
      req.apiKey!.scopes.includes(scope)
    );

    if (!hasAllScopes) {
      res.status(403).json({
        error: 'insufficient_scopes',
        required: requiredScopes,
        provided: req.apiKey.scopes,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware: Log API request (high-volume async)
 */
export async function requestLogger(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const startTime = Date.now();

  // Capture response
  res.on('finish', async () => {
    const latency = Date.now() - startTime;

    if (!req.apiKey) return;

    // Log to database (async - don't block response)
    try {
      await pool.query(
        `INSERT INTO api_request_logs (
          app_id, key_id, method, path, status_code, latency_ms,
          request_bytes, response_bytes, ip_address, user_agent, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [
          req.apiKey.appId,
          req.apiKey.keyId,
          req.method,
          req.path,
          res.statusCode,
          latency,
          parseInt(req.headers['content-length'] || '0', 10),
          parseInt(res.getHeader('content-length')?.toString() || '0', 10),
          req.ip,
          req.headers['user-agent'] || null,
        ]
      );
    } catch (error) {
      console.error('Failed to log request', error);
    }
  });

  next();
}
