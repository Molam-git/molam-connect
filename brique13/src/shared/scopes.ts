import { Request, Response, NextFunction } from "express";

export function requireScopes(scopes: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: "unauthorized" });
            return; // ← AJOUT DU RETURN
        }

        const got = req.user.scopes;
        const ok = scopes.every(s => got.includes(s));

        if (!ok) {
            res.status(403).json({
                error: "forbidden",
                message: `Required scopes: ${scopes.join(", ")}`
            });
            return; // ← AJOUT DU RETURN
        }

        next();
    };
}

export function requireRoleOrScopes(roles: string[], scopes: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: "unauthorized" });
            return; // ← AJOUT DU RETURN
        }

        const gotScopes = req.user.scopes;
        const gotRoles = req.user.roles;

        const hasRole = roles.some(r => gotRoles.includes(r));
        const hasScopes = scopes.every(s => gotScopes.includes(s));

        if (!hasRole && !hasScopes) {
            res.status(403).json({
                error: "forbidden",
                message: `Required roles: ${roles.join(", ")} OR scopes: ${scopes.join(", ")}`
            });
            return; // ← AJOUT DU RETURN
        }

        next();
    };
}