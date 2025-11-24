import { Request, Response, NextFunction } from 'express';

export interface AuthUser {
    id: number;
    role: string;
    permissions: string[];
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}

export function requireRole(roles: string | string[]) {
    const roleArray = Array.isArray(roles) ? roles : [roles];

    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        if (!roleArray.includes(req.user.role)) {
            res.status(403).json({
                error: 'Insufficient permissions',
                required: roleArray,
                user_role: req.user.role
            });
            return;
        }

        next();
    };
}

export function requirePermission(permission: string) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        if (!req.user.permissions.includes(permission)) {
            res.status(403).json({
                error: 'Missing permission',
                required: permission,
                user_permissions: req.user.permissions
            });
            return;
        }

        next();
    };
}