import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

declare global {
    namespace Express {
        interface Request {
            user?: {
                sub: string;
                user_id: string;
                kyc_level: string;
                country: string;
                roles: string[];
            };
        }
    }
}

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'access_token_required' });
    }

    try {
        const decoded = jwt.verify(token, config.jwtSecret) as any;
        req.user = {
            sub: decoded.sub,
            user_id: decoded.user_id,
            kyc_level: decoded.kyc_level,
            country: decoded.country,
            roles: decoded.roles || []
        };
        next();
    } catch (error) {
        return res.status(403).json({ error: 'invalid_or_expired_token' });
    }
}

export function requireKYC(level: string = 'P1') {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'authentication_required' });
        }

        const kycLevels = ['P1', 'P2', 'P3']; // P3 being highest
        const userLevelIndex = kycLevels.indexOf(req.user.kyc_level);
        const requiredLevelIndex = kycLevels.indexOf(level);

        if (userLevelIndex < requiredLevelIndex) {
            return res.status(403).json({ error: 'kyc_insufficient' });
        }

        next();
    };
}

// Rate limiting middleware (stub)
export function rateLimit() {
    return (req: Request, res: Response, next: NextFunction) => {
        // In production, implement proper rate limiting with Redis
        next();
    };
}