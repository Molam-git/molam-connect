/**
 * Molam ID Authentication Middleware
 * Verifies JWT tokens from Molam ID service
 * Extracts user info: id, roles, country, currency, locale
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface MolamUser {
  id: string;
  roles: string[];
  country: string;
  currency: string;
  locale: string;
  email?: string;
  phone?: string;
}

export interface AuthenticatedRequest extends Request {
  user: MolamUser;
  i18n: {
    t: (key: string) => string;
  };
}

/**
 * Molam ID JWT authentication middleware
 * Expects: Authorization: Bearer <jwt>
 * JWT payload must contain: sub, roles[], country, currency, lang
 */
export async function molamIdAuth(
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
    // Get public key from environment (RS256)
    const publicKey = process.env.MOLAM_ID_JWT_PUBLIC;
    if (!publicKey) {
      throw new Error('MOLAM_ID_JWT_PUBLIC not configured');
    }

    // Verify JWT
    const payload = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: 'molam-id',
      audience: 'molam-services'
    }) as any;

    // Extract user info
    const user: MolamUser = {
      id: payload.sub,
      roles: payload.roles || ['customer'],
      country: payload.country || 'SN',
      currency: payload.currency || 'XOF',
      locale: payload.lang || 'fr',
      email: payload.email,
      phone: payload.phone
    };

    // Attach to request
    (req as AuthenticatedRequest).user = user;

    // Attach i18n helper (placeholder - integrate with i18next in production)
    (req as AuthenticatedRequest).i18n = {
      t: (key: string) => key // Placeholder for translation
    };

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
 * Optional: Role-based authorization middleware
 */
export function requireRole(requiredRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const hasRole = requiredRoles.some(role => user.roles.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        error: 'forbidden',
        message: `Requires one of: ${requiredRoles.join(', ')}`
      });
    }

    next();
  };
}

export default molamIdAuth;
