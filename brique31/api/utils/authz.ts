import { Request, Response, NextFunction } from 'express';

export function requireRole(allowedRoles: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userRoles = user.roles || [];
        const hasRole = allowedRoles.some(role => userRoles.includes(role));
        if (!hasRole) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        next();
    };
}