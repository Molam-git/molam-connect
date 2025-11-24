import { Request, Response, NextFunction } from 'express';

export interface AuthUser {
    id: string;
    roles: string[];
    permissions: string[];
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}

export function authzMiddleware(req: Request, res: Response, next: NextFunction) {
    // Extract JWT from header and validate
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "authentication_required" });
    }

    // In real implementation, validate JWT with Molam ID service
    // This is a simplified version
    try {
        const token = authHeader.substring(7);
        // const user = await verifyJWT(token); // Actual JWT verification

        // Mock user for demonstration
        req.user = {
            id: 'user-123',
            roles: ['pay_module'],
            permissions: ['create_payout', 'read_payout']
        };

        next();
    } catch (error) {
        return res.status(401).json({ error: "invalid_token" });
    }
}

export function requireRole(allowedRoles: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: "authentication_required" });
        }

        const hasRole = req.user.roles.some(role => allowedRoles.includes(role));

        if (!hasRole) {
            return res.status(403).json({ error: "insufficient_permissions" });
        }

        next();
    };
}