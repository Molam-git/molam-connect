/**
 * Merchant Authentication Middleware
 * Supports both JWT (Molam ID) and API Key authentication
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pool } from './db';

export interface MerchantUser {
  merchantId: string;
  roles: string[];
  country: string;
  currency: string;
  locale: string;
  authType: 'jwt' | 'apikey';
}

export interface AuthenticatedRequest extends Request {
  merchant: MerchantUser;
}

/**
 * JWT-based authentication (for web dashboard)
 */
export async function jwtAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = String(req.headers.authorization || '');

  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'missing_token',
      message: 'Authorization header must start with Bearer'
    });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const publicKey = process.env.MOLAM_ID_JWT_PUBLIC;
    if (!publicKey) {
      throw new Error('MOLAM_ID_JWT_PUBLIC not configured');
    }

    const payload = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: 'molam-id',
      audience: 'molam-services'
    }) as any;

    // Check if user has merchant role
    if (!payload.roles?.includes('merchant') && !payload.roles?.includes('admin')) {
      res.status(403).json({
        error: 'forbidden',
        message: 'Merchant role required'
      });
      return;
    }

    const merchant: MerchantUser = {
      merchantId: payload.merchant_id || payload.sub,
      roles: payload.roles || ['merchant'],
      country: payload.country || 'SN',
      currency: payload.currency || 'XOF',
      locale: payload.lang || 'fr',
      authType: 'jwt'
    };

    (req as AuthenticatedRequest).merchant = merchant;
    next();
  } catch (error: any) {
    console.error('JWT verification failed:', error.message);

    res.status(401).json({
      error: 'invalid_token',
      message: error.message,
      detail: error.name
    });
  }
}

/**
 * API Key authentication (for server-to-server)
 */
export async function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({
      error: 'missing_api_key',
      message: 'X-API-Key header required'
    });
    return;
  }

  try {
    // Extract key prefix (first 8 chars)
    const keyPrefix = apiKey.substring(0, 8);

    // Hash the full key
    const keyHash = crypto
      .createHash('sha256')
      .update(apiKey)
      .digest('hex');

    // Look up key in database
    const { rows } = await pool.query(
      `SELECT m.merchant_id, m.country, m.currency, m.status, k.id as key_id
       FROM merchant_api_keys k
       JOIN merchants m ON k.merchant_id = m.merchant_id
       WHERE k.key_prefix = $1
         AND k.key_hash = $2
         AND k.status = 'active'
         AND (k.expires_at IS NULL OR k.expires_at > now())
       LIMIT 1`,
      [keyPrefix, keyHash]
    );

    if (rows.length === 0) {
      res.status(401).json({
        error: 'invalid_api_key',
        message: 'API key not found or expired'
      });
      return;
    }

    const row = rows[0];

    if (row.status !== 'active') {
      res.status(403).json({
        error: 'merchant_suspended',
        message: 'Merchant account is not active'
      });
      return;
    }

    // Update last_used_at
    await pool.query(
      `UPDATE merchant_api_keys SET last_used_at = now() WHERE id = $1`,
      [row.key_id]
    );

    const merchant: MerchantUser = {
      merchantId: row.merchant_id,
      roles: ['merchant'],
      country: row.country,
      currency: row.currency,
      locale: 'fr',
      authType: 'apikey'
    };

    (req as AuthenticatedRequest).merchant = merchant;
    next();
  } catch (error: any) {
    console.error('API key verification failed:', error);

    res.status(500).json({
      error: 'auth_failed',
      message: error.message
    });
  }
}

/**
 * Combined auth middleware (tries JWT first, then API key)
 */
export async function merchantAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const hasBearer = req.headers.authorization?.startsWith('Bearer ');
  const hasApiKey = !!req.headers['x-api-key'];

  if (hasBearer) {
    return jwtAuth(req, res, next);
  } else if (hasApiKey) {
    return apiKeyAuth(req, res, next);
  } else {
    res.status(401).json({
      error: 'missing_auth',
      message: 'Authorization header or X-API-Key required'
    });
  }
}

export default merchantAuth;
