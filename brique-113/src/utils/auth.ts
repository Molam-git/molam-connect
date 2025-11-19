/**
 * Brique 113: Authentication Middleware
 * Supports Molam ID JWT + mTLS for internal services
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from './logger';

export interface AuthenticatedUser {
  user_id: string;
  roles: string[];
  merchant_id?: string;
  sira_threshold?: number;
  [key: string]: any;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  isInternal?: boolean;
}

const JWT_SECRET = process.env.JWT_SECRET || 'molam-jwt-secret-change-me';
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;

/**
 * Auth middleware - validates JWT or internal service token
 */
export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // Skip auth for health and metrics endpoints
  if (req.path === '/healthz' || req.path === '/readyz' || req.path === '/metrics') {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'missing_authorization_header' });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({ error: 'invalid_authorization_format' });
    return;
  }

  const token = parts[1];

  // Check if internal service token
  if (INTERNAL_SERVICE_TOKEN && token === INTERNAL_SERVICE_TOKEN) {
    req.isInternal = true;
    req.user = {
      user_id: 'internal_service',
      roles: ['internal_service', 'sira_service', 'ml_ops'],
    };
    return next();
  }

  // Verify JWT
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    req.user = {
      user_id: decoded.sub || decoded.user_id,
      roles: decoded.roles || [],
      merchant_id: decoded.merchant_id,
      sira_threshold: decoded.sira_threshold,
      ...decoded,
    };

    logger.debug('User authenticated', {
      user_id: req.user.user_id,
      roles: req.user.roles,
    });

    next();
  } catch (err: any) {
    logger.warn('JWT verification failed', {
      error: err.message,
      token: token.substring(0, 20) + '...',
    });

    res.status(401).json({ error: 'invalid_token', detail: err.message });
  }
}

/**
 * Role-based access control middleware
 */
export function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }

    // Internal services have all permissions
    if (req.isInternal) {
      return next();
    }

    const userRoles = req.user.roles || [];
    const hasRole = userRoles.some((role) => allowedRoles.includes(role));

    if (!hasRole) {
      logger.warn('Access denied - insufficient permissions', {
        user_id: req.user.user_id,
        user_roles: userRoles,
        required_roles: allowedRoles,
      });

      res.status(403).json({
        error: 'forbidden',
        required_roles: allowedRoles,
        user_roles: userRoles,
      });
      return;
    }

    next();
  };
}

/**
 * Extract service-to-service mTLS client certificate (if present)
 */
export function extractMTLSIdentity(req: Request): string | null {
  const clientCert = (req as any).client?.getPeerCertificate?.();

  if (clientCert && clientCert.subject) {
    return clientCert.subject.CN || null;
  }

  // Fallback: check x-client-cert header (set by ingress/proxy)
  const certHeader = req.headers['x-client-cert'] as string;
  if (certHeader) {
    try {
      const decoded = Buffer.from(certHeader, 'base64').toString('utf-8');
      const cnMatch = decoded.match(/CN=([^,]+)/);
      return cnMatch ? cnMatch[1] : null;
    } catch {
      return null;
    }
  }

  return null;
}
