import { RequestHandler } from "express";

export interface AuthUser {
    sub: string;
    type: "external" | "internal";
    roles: string[];
    permissions: string[];
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
            device?: any;
        }
    }
}

export const requireAuth = (): RequestHandler => {
    return (req, res, next) => {
        // JWT validation implementation
        // This is a simplified version
        const authHeader = req.headers.authorization;

        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Authentication required" });
        }

        // In real implementation, validate JWT and set req.user
        // For now, mock user data
        req.user = {
            sub: 'user-123',
            type: 'external',
            roles: ['customer'],
            permissions: ['pay.topup:create']
        };

        next();
    };
};

export const requireScope = (scope: string): RequestHandler => {
    return (req, res, next) => {
        if (!req.user?.permissions.includes(scope)) {
            return res.status(403).json({ error: "Insufficient permissions" });
        }
        next();
    };
};

export const requireRole = (role: string): RequestHandler => {
    return (req, res, next) => {
        if (!req.user?.roles.includes(role)) {
            return res.status(403).json({ error: "Insufficient role" });
        }
        next();
    };
};