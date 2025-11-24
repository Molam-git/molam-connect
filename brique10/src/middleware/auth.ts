// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    // Implémentation simplifiée de l'authentification
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        // Décoder le token JWT
        // const decoded = verifyToken(token);
        // req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};