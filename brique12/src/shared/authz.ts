import { Request, Response, NextFunction } from 'express';

export const authz = () => {
    return (req: Request, res: Response, next: NextFunction) => {
        // Mock authentication - in production, validate JWT/mTLS
        const authHeader = req.headers.authorization;

        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            // Decode and verify token (simplified)
            try {
                (req as any).user = { id: 'user-id-from-token', roles: ['user'] };
            } catch (error) {
                return res.status(401).json({ error: 'invalid_token' });
            }
        } else if (req.headers['x-internal-auth'] === process.env.INTERNAL_AUTH_SECRET) {
            (req as any).user = { id: 'internal-service', roles: ['internal'] };
        } else {
            return res.status(401).json({ error: 'authentication_required' });
        }

        next();
    };
};