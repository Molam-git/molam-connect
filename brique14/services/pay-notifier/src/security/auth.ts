import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthUser {
    sub: string;
    scopes: string[];
}

declare module "express" {
    interface Request {
        user?: AuthUser;
    }
}

export function requireScopes(scopes: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        const auth = req.headers.authorization || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

        if (!token) {
            return res.status(401).json({ error: "missing_token" });
        }

        try {
            const payload = jwt.verify(token, process.env.SERVICE_JWT_PUBLIC!, {
                algorithms: ["RS256"]
            }) as any;

            req.user = {
                sub: payload.sub,
                scopes: payload.scopes || []
            };

            const hasAllScopes = scopes.every(s => req.user!.scopes.includes(s));
            if (!hasAllScopes) {
                return res.status(403).json({ error: "insufficient_scopes" });
            }

            next();
        } catch (error) {
            return res.status(401).json({ error: "invalid_token" });
        }
    };
}