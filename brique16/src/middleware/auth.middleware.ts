import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const authServiceMTLS = (req: Request, res: Response, next: NextFunction) => {
    const serviceToken = req.headers['x-service-jwt'] as string;

    if (!serviceToken) {
        return res.status(401).json({ error: 'Service token required' });
    }

    try {
        // In production, verify against proper public key and mTLS certificate
        const decoded = jwt.verify(serviceToken, process.env.SERVICE_JWT_SECRET!);
        (req as any).service = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid service token' });
    }
};

export const authUserJWT = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'User token required' });
    }

    const token = authHeader.substring(7);

    try {
        const decoded = jwt.verify(token, process.env.USER_JWT_SECRET!);
        (req as any).user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid user token' });
    }
};