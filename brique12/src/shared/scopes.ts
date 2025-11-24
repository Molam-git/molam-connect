import { Request, Response, NextFunction } from 'express';

export const requireScopes = (scopes: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user;

        // Simplified scope check - in production, validate OAuth2 scopes
        if (!user) {
            return res.status(403).json({ error: 'insufficient_scopes' });
        }

        next();
    };
};