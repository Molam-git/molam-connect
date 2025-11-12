// ============================================================================
// Authentication & Authorization Middleware
// ============================================================================

import { Request, Response, NextFunction } from 'express';

export interface AuthUser {
  id: string;
  platform_id?: string;
  merchant_id?: string;
  roles: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * JWT authentication middleware (simplified - integrate with real auth system)
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    return;
  }

  // TODO: Verify JWT token and extract user info
  // For now, mock user extraction
  req.user = {
    id: 'user-123',
    platform_id: 'platform-456',
    merchant_id: 'merchant-789',
    roles: ['platform_admin', 'finance_ops'],
  };

  next();
}

/**
 * Role-based access control middleware
 */
export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized: No user context' });
      return;
    }

    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));

    if (!hasRole) {
      res.status(403).json({
        error: 'Forbidden: Insufficient permissions',
        required_roles: allowedRoles,
        user_roles: req.user.roles,
      });
      return;
    }

    next();
  };
}

/**
 * Platform ownership validation
 */
export function requirePlatformAccess(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const platform_id = req.params.platform_id || req.body.platform_id || req.query.platform_id;

  if (!platform_id) {
    res.status(400).json({ error: 'Missing platform_id' });
    return;
  }

  // Platform admins can access any platform, others need matching platform_id
  if (
    !req.user.roles.includes('super_admin') &&
    req.user.platform_id !== platform_id
  ) {
    res.status(403).json({ error: 'Forbidden: Platform access denied' });
    return;
  }

  next();
}
