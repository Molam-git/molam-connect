// middleware/simple-auth.ts - Solution ultra-simple
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from '../db';

export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        email: string;
        role: string;
    };
}

// Fonction helper pour obtenir le secret
const getSecret = (): string => {
    return process.env.JWT_SECRET || 'fallback-secret-change-in-production';
};

export const authenticateJWT = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader?.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Token manquant' });
            return;
        }

        const token = authHeader.split(' ')[1];
        const secret = getSecret();

        const decoded: any = jwt.verify(token, secret);

        const user = await db.oneOrNone(
            'SELECT id, email, role FROM molam_users WHERE id = $1 AND is_active = true',
            [decoded.userId]
        );

        if (!user) {
            res.status(401).json({ error: 'Utilisateur non trouvé' });
            return;
        }

        req.user = user;
        next();
    } catch (error: any) {
        if (error.name === 'JsonWebTokenError') {
            res.status(401).json({ error: 'Token invalide' });
        } else if (error.name === 'TokenExpiredError') {
            res.status(401).json({ error: 'Token expiré' });
        } else {
            console.error('Auth error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }
};

export const authorizeRole = (roles: string[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role)) {
            res.status(403).json({ error: 'Accès non autorisé' });
            return;
        }
        next();
    };
};

export const generateToken = (payload: { userId: string; email: string; role: string }) => {
    const secret = getSecret();

    // Solution simple : utiliser un nombre fixe pour expiresIn
    const expiresIn = 7 * 24 * 60 * 60; // 7 jours en secondes

    return jwt.sign(payload, secret, {
        expiresIn: expiresIn
    });
};

export const verifyToken = (token: string): any => {
    const secret = getSecret();
    return jwt.verify(token, secret);
};