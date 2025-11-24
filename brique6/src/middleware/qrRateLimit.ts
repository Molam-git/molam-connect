// src/middleware/qrRateLimit.ts
import { Request, Response, NextFunction } from 'express';

export const qrRateLimit = (req: Request, res: Response, next: NextFunction) => {
    // Implémentation basique - à remplacer par Redis en production
    next();
};