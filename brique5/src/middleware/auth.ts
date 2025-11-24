// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

declare global {
    namespace Express {
        interface Request {
            user?: {
                sub: string;
                scope: string[];
            };
        }
    }
}

export const requireAuth = () => {
    return (req: Request, res: Response, next: NextFunction) => {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const token = authHeader.slice(7);

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
            req.user = {
                sub: decoded.sub,
                scope: decoded.scope || []
            };
            next();
        } catch (error) {
            return res.status(401).json({ error: 'Invalid token' });
        }
    };
};

export const requireScope = (scope: string) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user || !req.user.scope.includes(scope)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
};