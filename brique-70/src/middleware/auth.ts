import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthUser {
  userId: string;
  merchantId?: string;
  role: 'merchant' | 'customer' | 'ops' | 'admin';
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Authenticate JWT token
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as any;

    req.user = {
      userId: decoded.sub || decoded.userId,
      merchantId: decoded.merchantId,
      role: decoded.role || 'customer',
      permissions: decoded.permissions || [],
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Require specific permission
 */
export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Admin has all permissions
    if (req.user.role === 'admin') {
      return next();
    }

    // Check if user has any of the required permissions
    const hasPermission = permissions.some((perm) =>
      req.user!.permissions.includes(perm)
    );

    if (!hasPermission) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: permissions,
      });
    }

    next();
  };
}

/**
 * Require specific role
 */
export function requireRole(...roles: AuthUser['role'][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required_role: roles,
        current_role: req.user.role,
      });
    }

    next();
  };
}

/**
 * Get merchant ID filter for queries
 * Returns merchantId from user context, or from query param if ops/admin
 */
export function getMerchantFilter(req: Request, queryParamMerchantId?: string): string | undefined {
  if (!req.user) {
    return undefined;
  }

  // Ops and admin can query any merchant
  if (req.user.role === 'ops' || req.user.role === 'admin') {
    return queryParamMerchantId;
  }

  // Merchant can only query their own data
  if (req.user.role === 'merchant') {
    return req.user.merchantId;
  }

  // Customers cannot access merchant data
  return undefined;
}

/**
 * Ensure merchant access (user must be merchant or ops/admin with merchant_id param)
 */
export function requireMerchantAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const merchantId = req.params.merchantId || req.body.merchant_id || req.query.merchant_id;

  // Ops/admin can access any merchant with merchantId param
  if (req.user.role === 'ops' || req.user.role === 'admin') {
    if (!merchantId) {
      return res.status(400).json({ error: 'merchant_id required for ops/admin' });
    }
    return next();
  }

  // Merchant can only access their own data
  if (req.user.role === 'merchant') {
    if (merchantId && merchantId !== req.user.merchantId) {
      return res.status(403).json({ error: 'Cannot access other merchant data' });
    }
    return next();
  }

  return res.status(403).json({ error: 'Insufficient permissions' });
}
