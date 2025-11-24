import { Request, Response, NextFunction } from 'express';

export function requireRole(allowedRoles: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        // Cette fonction suppose que l'utilisateur est attaché à `req.user` par un middleware d'authentification précédent
        const user = (req as any).user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!allowedRoles.includes(user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
    };
}