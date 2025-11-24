import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
    user?: any;
}

export const authenticate = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Implémentation simplifiée de l'authentification
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
        // Vérifier le token et extraire l'utilisateur
        // Pour l'exemple, on simule un user
        req.user = { id: 'user-123' };
        next();
    } else {
        res.status(401).json({ error: 'UNAUTHENTICATED' });
    }
};