// =====================================================================
// Authorization Middleware
// =====================================================================
// Role-based access control (RBAC) middleware
// Date: 2025-11-12
// =====================================================================

import { Request, Response, NextFunction } from 'express';

// =====================================================================
// Types
// =====================================================================

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    tenantId?: string;
    tenantType?: string;
    roles: string[];
    email?: string;
    name?: string;
  };
}

// =====================================================================
// Middleware
// =====================================================================

/**
 * Require user to have at least one of the specified roles
 */
export function requireRole(roles: string | string[]) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
    }

    // Check if user has any of the required roles
    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        error: 'forbidden',
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
        userRoles: req.user.roles,
      });
    }

    next();
  };
}

/**
 * Require user to be authenticated
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
  }

  next();
}

/**
 * Require user to belong to a specific tenant
 */
export function requireTenant(tenantId: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
    }

    if (req.user.tenantId !== tenantId) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Access denied. You do not belong to this tenant.',
      });
    }

    next();
  };
}

/**
 * Require user to be either ops or own the resource
 */
export function requireOpsOrOwner(getTenantId: (req: Request) => string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
    }

    // Ops can access anything
    if (req.user.roles.includes('billing_ops') || req.user.roles.includes('finance_ops')) {
      return next();
    }

    // Otherwise, must be owner
    const resourceTenantId = getTenantId(req);
    if (req.user.tenantId !== resourceTenantId) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Access denied. You can only access your own resources.',
      });
    }

    next();
  };
}

/**
 * Mock authentication middleware for development
 * (Replace with actual JWT/session middleware in production)
 */
export function mockAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // In development, create a mock user from header or use default
  const userHeader = req.headers['x-mock-user'] as string;

  if (userHeader) {
    try {
      req.user = JSON.parse(userHeader);
    } catch (error) {
      console.error('Invalid x-mock-user header:', error);
    }
  }

  // Default mock user if none provided
  if (!req.user) {
    req.user = {
      id: 'test-user-123',
      tenantId: '123e4567-e89b-12d3-a456-426614174000',
      tenantType: 'merchant',
      roles: ['merchant_admin', 'billing_admin'],
      email: 'test@example.com',
      name: 'Test User',
    };
  }

  next();
}

/**
 * Extract tenant ID from request parameter
 */
export function getTenantIdFromParams(req: Request): string {
  return req.params.tenantId || '';
}

/**
 * Extract tenant ID from preview resource
 */
export async function getTenantIdFromPreview(previewId: string): Promise<string> {
  const { pool } = require('../db');
  const { rows } = await pool.query(
    'SELECT tenant_id::text FROM overage_previews WHERE id = $1',
    [previewId]
  );
  return rows[0]?.tenant_id || '';
}
