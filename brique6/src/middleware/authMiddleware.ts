import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    // En développement, accepter un token de test
    if (process.env.NODE_ENV === 'development' && token === 'test-token') {
        (req as any).user = {
            id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', // ID d'un user existant dans votre DB
            name: 'Test User'
        };
        return next();
    }

    if (!token) {
        return res.status(401).json({ error: 'Accès non autorisé' });
    }

    try {
        // Pour la production, utiliser JWT réel
        const decoded = jwt.verify(token, process.env.JWT_SECRET!);
        (req as any).user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Token invalide' });
    }
};