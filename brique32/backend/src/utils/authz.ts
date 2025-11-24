import { Request, Response, NextFunction } from "express";

export interface MolamUser {
    id: string;
    roles: string[];
    zone: string;
    mfa: boolean;
}

// Extended Express Request type
declare global {
    namespace Express {
        interface Request {
            user?: MolamUser;
        }
    }
}

export function authzMiddleware(req: Request, res: Response, next: NextFunction): void {
    // Extract JWT from header and validate
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    // In production, validate JWT with Molam ID service
    // For development, mock user data with proper typing
    req.user = {
        id: 'user-123',
        roles: ['ops_user'],
        zone: 'SN-DKR',
        mfa: true
    };

    next();
}

export function requireRole(allowedRoles: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        const hasRole = req.user.roles.some(role => allowedRoles.includes(role));
        if (!hasRole) {
            res.status(403).json({ error: "Insufficient permissions" });
            return;
        }

        // For critical operations, require MFA
        const criticalPaths = ['execute', 'approve', 'rollback'];
        const isCriticalOperation = criticalPaths.some(action => req.path.includes(action));

        if (isCriticalOperation && !req.user.mfa) {
            res.status(403).json({ error: "MFA required for this operation" });
            return;
        }

        next();
    };
}

// Type guard for authenticated user
export function isUserAuthenticated(user: any): user is MolamUser {
    return user &&
        typeof user.id === 'string' &&
        Array.isArray(user.roles) &&
        typeof user.zone === 'string' &&
        typeof user.mfa === 'boolean';
}