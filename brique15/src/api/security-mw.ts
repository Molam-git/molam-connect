import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export function authUserJWT(req: any, res: Response, next: NextFunction) {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'missing token' });
    try {
        const payload = jwt.verify(token, process.env.USER_JWT_PUBLIC_KEY!, {
            algorithms: ['RS256'],
            audience: 'notify',
            issuer: 'molam-id'
        });
        req.user = payload;
        next();
    } catch {
        return res.status(401).json({ error: 'invalid token' });
    }
}

export function authServiceMTLS(req: Request, res: Response, next: NextFunction) {
    const srv = req.headers['x-service-jwt'] as string | undefined;
    if (!srv) return res.status(401).json({ error: 'missing service token' });
    try {
        jwt.verify(srv, process.env.SERVICE_JWT_PUBLIC_KEY!, {
            algorithms: ['RS256'],
            audience: 'notify-internal',
            issuer: 'molam-mesh'
        });
        next();
    } catch {
        return res.status(401).json({ error: 'bad service token' });
    }
}