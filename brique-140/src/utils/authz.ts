/**
 * BRIQUE 140 — Authorization utilities (Molam ID JWT)
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export function authzMiddleware(req: Request, res: Response, next: NextFunction) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'missing_token' });
  }

  try {
    const publicKey = process.env.MOLAM_ID_JWT_PUBLIC || process.env.JWT_SECRET;

    if (!publicKey) {
      throw new Error('JWT key not configured');
    }

    const payload = jwt.verify(token, publicKey, {
      algorithms: ['RS256', 'HS256'],
    }) as any;

    (req as any).user = {
      id: payload.sub || payload.user_id,
      roles: payload.roles || [],
      dev_account_id: payload.dev_account_id || null,
      country: payload.country || 'SN',
      currency: payload.currency || 'XOF',
      lang: payload.lang || 'fr',
      email: payload.email,
    };

    next();
  } catch (error) {
    console.error('[Auth] Token verification failed:', error);
    return res.status(401).json({ error: 'invalid_token' });
  }
}

export function requireRole(roles: string[]) {
  return (req: any, res: any, next: any) => {
    const userRoles = req.user?.roles || [];
    if (!userRoles.some((r: string) => roles.includes(r))) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}
