import { Response, NextFunction } from 'express';
import { AuthRequest, User } from '../types';

export function requireRole(allowedRoles: string[]) {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'authentication_required' });
        }

        const hasRole = req.user.roles.some(role => allowedRoles.includes(role));
        if (!hasRole) {
            return res.status(403).json({ error: 'insufficient_permissions' });
        }

        next();
    };
}