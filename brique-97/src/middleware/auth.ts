/**
 * Brique 97 — Authentication & Authorization Middleware
 *
 * Handles JWT validation, role-based access control (RBAC),
 * and tenant isolation
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export interface User {
  id: string;
  email: string;
  roles: string[];
  tenant_type?: string;
  tenant_id?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Require authentication (valid JWT)
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Missing or invalid authorization header',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as User;
      req.user = decoded;
      next();
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'token_expired',
          message: 'JWT token has expired',
        });
      }

      return res.status(401).json({
        error: 'invalid_token',
        message: 'Invalid JWT token',
      });
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Require specific role(s)
 */
export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Authentication required',
      });
    }

    const hasRole = allowedRoles.some((role) => req.user!.roles.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Insufficient permissions',
        required_roles: allowedRoles,
      });
    }

    next();
  };
}

/**
 * Require tenant ownership (for tenant-scoped resources)
 */
export function requireTenantOwnership(tenantTypeParam: string = 'tenant_type', tenantIdParam: string = 'tenant_id') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Authentication required',
      });
    }

    const requestedTenantType = req.body[tenantTypeParam] || req.query[tenantTypeParam];
    const requestedTenantId = req.body[tenantIdParam] || req.query[tenantIdParam];

    // Admin can access all tenants
    if (req.user.roles.includes('admin') || req.user.roles.includes('super_admin')) {
      return next();
    }

    // Check ownership
    if (req.user.tenant_type !== requestedTenantType || req.user.tenant_id !== requestedTenantId) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Cannot access resources of another tenant',
      });
    }

    next();
  };
}

/**
 * Optional authentication (JWT if provided, but not required)
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No auth provided, continue without user
    return next();
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as User;
    req.user = decoded;
  } catch (error) {
    // Invalid token, but continue anyway (optional auth)
    console.warn('Invalid JWT in optional auth:', error);
  }

  next();
}

/**
 * Generate JWT token (for testing/demo)
 */
export function generateToken(user: User, expiresIn: string = '24h'): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn });
}
