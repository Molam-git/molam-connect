import { Request, Response, NextFunction } from 'express';

export const requireRole = (role: string) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user;

        if (!user || !user.roles.includes(role)) {
            return res.status(403).json({ error: 'insufficient_permissions' });
        }

        next();
    };
};