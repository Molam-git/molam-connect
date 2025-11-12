import { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    roles: string[];
    merchantId?: string;
  };
}

export function authzMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Mock user (en production: jwt.verify())
  req.user = {
    id: 'user-123',
    email: 'merchant@example.com',
    roles: ['merchant_admin'],
    merchantId: 'merchant-123',
  };

  next();
}

export function requireRole(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const hasRole = allowedRoles.some(role => req.user!.roles.includes(role));
    if (!hasRole) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    next();
  };
}
