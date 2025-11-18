/**
 * Authorization middleware
 * Validates Molam ID JWT tokens and enforces access control
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production';

export interface MolamUser {
  id: string;
  email: string;
  role: string;
  merchant_id?: string;
  permissions: string[];
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: MolamUser;
    }
  }
}

/**
 * Main authentication middleware
 * Validates JWT from Authorization header
 */
export async function authzMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Missing or invalid Authorization header'
      });
      return;
    }

    const token = authHeader.substring(7);

    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Attach user to request
    req.user = {
      id: decoded.user_id || decoded.sub,
      email: decoded.email,
      role: decoded.role || 'user',
      merchant_id: decoded.merchant_id,
      permissions: decoded.permissions || []
    };

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        error: 'token_expired',
        message: 'JWT token has expired'
      });
    } else if (error.name === 'JsonWebTokenError') {
      res.status(401).json({
        error: 'invalid_token',
        message: 'Invalid JWT token'
      });
    } else {
      res.status(500).json({
        error: 'auth_error',
        message: 'Authentication failed'
      });
    }
  }
}

/**
 * Role-based access control
 */
export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Authentication required'
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: 'forbidden',
        message: `Requires one of: ${allowedRoles.join(', ')}`
      });
      return;
    }

    next();
  };
}

/**
 * Permission-based access control
 */
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Authentication required'
      });
      return;
    }

    if (!req.user.permissions.includes(permission) && req.user.role !== 'admin') {
      res.status(403).json({
        error: 'forbidden',
        message: `Requires permission: ${permission}`
      });
      return;
    }

    next();
  };
}

/**
 * Optional authentication - doesn't fail if no token
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      req.user = {
        id: decoded.user_id || decoded.sub,
        email: decoded.email,
        role: decoded.role || 'user',
        merchant_id: decoded.merchant_id,
        permissions: decoded.permissions || []
      };
    }

    next();
  } catch (error) {
    // Continue without user
    next();
  }
}

/**
 * Generate JWT token (for testing)
 */
export function generateToken(user: Partial<MolamUser>, expiresIn: string = '1h'): string {
  return jwt.sign(
    {
      user_id: user.id,
      email: user.email,
      role: user.role,
      merchant_id: user.merchant_id,
      permissions: user.permissions || []
    },
    JWT_SECRET,
    { expiresIn }
  );
}
