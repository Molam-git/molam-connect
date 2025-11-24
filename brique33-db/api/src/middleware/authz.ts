// api/src/middleware/authz.ts
import { Request, Response, NextFunction } from 'express';

export const authzMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const user = verifyJWT(token); // Implémenter la vérification JWT
        (req as any).user = user;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

export const requireRole = (roles: string[]) => {
    return (req: any, res: Response, next: NextFunction) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
};

function verifyJWT(token: string) {
    throw new Error('Function not implemented.');
}
