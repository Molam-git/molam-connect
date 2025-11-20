/**
 * Authentication & Authorization middleware
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const MOLAM_ID_PUBLIC_KEY = process.env.MOLAM_ID_PUBLIC_KEY || '';

export interface AuthUser {
  sub: string;
  tenant_id?: string;
  roles: string[];
  email?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Verify JWT token from Molam ID
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing_auth' });
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, MOLAM_ID_PUBLIC_KEY, {
      algorithms: ['RS256', 'ES256']
    }) as AuthUser;

    req.user = payload;
    next();
  } catch (error: any) {
    return res.status(401).json({ error: 'invalid_token', message: error.message });
  }
}

/**
 * Check if user has required role
 */
export function authorize(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const userRoles = req.user.roles || [];
    const hasRole = userRoles.some(role => allowedRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        error: 'forbidden',
        message: `Required roles: ${allowedRoles.join(', ')}`,
        userRoles
      });
    }

    next();
  };
}

/**
 * Combined auth middleware
 */
export function authz(allowedRoles: string[]) {
  return [authenticate, authorize(allowedRoles)];
}
