/**
 * Authentication & Authorization Middleware
 * Integrates with Brique 68 RBAC system
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    roles: string[];
    permissions: string[];
    merchant_id?: string;
    organization_id?: string;
  };
}

/**
 * Verify JWT token and attach user info to request
 */
export function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;

    req.user = {
      id: decoded.sub || decoded.id,
      email: decoded.email,
      roles: decoded.roles || [],
      permissions: decoded.permissions || [],
      merchant_id: decoded.merchant_id,
      organization_id: decoded.organization_id,
    };

    next();
  } catch (error) {
    console.error('JWT verification failed:', error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Check if user has required permission
 */
export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const hasPermission = req.user.permissions.includes(permission) ||
                          req.user.permissions.includes('*') ||
                          req.user.roles.includes('admin') ||
                          req.user.roles.includes('super_admin');

    if (!hasPermission) {
      console.warn(`Permission denied: User ${req.user.id} lacks ${permission}`);
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: permission,
      });
    }

    next();
  };
}

/**
 * Check if user has any of the required permissions
 */
export function requireAnyPermission(...permissions: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const hasAnyPermission = permissions.some(permission =>
      req.user!.permissions.includes(permission) ||
      req.user!.permissions.includes('*') ||
      req.user!.roles.includes('admin')
    );

    if (!hasAnyPermission) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required_any: permissions,
      });
    }

    next();
  };
}

/**
 * Check if user can access merchant data
 */
export function canAccessMerchant(merchantId: string | null | undefined, req: AuthenticatedRequest): boolean {
  if (!req.user) return false;

  // Admins and ops can access all merchants
  if (req.user.roles.includes('admin') ||
      req.user.roles.includes('ops') ||
      req.user.permissions.includes('analytics:ops')) {
    return true;
  }

  // Merchants can only access their own data
  if (merchantId && req.user.merchant_id === merchantId) {
    return true;
  }

  // If no specific merchant requested, allow (will be filtered by user's merchant)
  if (!merchantId) {
    return true;
  }

  return false;
}

/**
 * Get merchant filter for queries based on user role
 */
export function getMerchantFilter(req: AuthenticatedRequest, requestedMerchantId?: string): string | null {
  if (!req.user) return null;

  // Admins can see all
  if (req.user.roles.includes('admin') ||
      req.user.roles.includes('ops') ||
      req.user.permissions.includes('analytics:ops')) {
    return requestedMerchantId || null;
  }

  // Merchants can only see their own data
  return req.user.merchant_id || null;
}
