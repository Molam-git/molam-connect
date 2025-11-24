// src/security/authz.ts
import { Request, Response, NextFunction } from "express";

export interface AuthUser {
    sub: string;
    type: "external" | "internal";
    scopes: string[];
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}

export function requireAuth() {
    return (req: Request, res: Response, next: NextFunction) => {
        // Implémentation simplifiée: suppose que l'utilisateur est attaché à req.user par un middleware d'auth antérieur
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        next();
    };
}

export function requireScope(scope: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user || !req.user.scopes.includes(scope)) {
            return res.status(403).json({ error: "Forbidden" });
        }
        next();
    };
}