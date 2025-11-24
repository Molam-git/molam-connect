import { Request, Response, NextFunction } from 'express';

export const authzMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ error: 'token_required' });
    }

    try {
        // Décoder et vérifier le JWT
        // const decoded = verifyToken(token);
        // req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'invalid_token' });
    }
};

export const requireRole = (roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        // Vérifier les rôles de l'utilisateur
        // if (!roles.includes(req.user.role)) {
        //   return res.status(403).json({ error: 'insufficient_permissions' });
        // }
        next();
    };
};