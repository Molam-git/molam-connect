import { Request, Response, NextFunction } from "express";

/**
 * Verifies Molam ID JWT (already issued by Molam ID service).
 * Attaches req.auth = { userId, roles, userType, tenant, ... }.
 * In production: validate signature (JWKS), check exp/aud/iss, mTLS if internal.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing token" });
    }
    // TODO: verify JWT using JWKS; mocked for brevity:
    const token = auth.slice(7);
    try {
        const parsed = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
        (req as any).auth = parsed;
        next();
    } catch {
        return res.status(401).json({ error: "Invalid token" });
    }
}

// Simple RBAC guard: external can access only own wallets; internal by role.
export function ensureWalletAccess(params: { allowInternalRoles?: string[] }) {
    return (req: any, res: any, next: any) => {
        const auth = req.auth;
        if (!auth) return res.status(401).json({ error: "Unauthenticated" });

        const isInternal = auth.userType !== "external";
        if (isInternal) {
            const allowed = params.allowInternalRoles ?? [];
            const hasRole = (auth.roles || []).some((r: string) => allowed.includes(r));
            if (!hasRole) return res.status(403).json({ error: "Forbidden" });
            return next();
        }
        // external can only operate on their own userId; path param or query must match
        const targetUserId = req.query.user_id || req.body.user_id || req.params.user_id;
        if (targetUserId && targetUserId !== auth.userId) {
            return res.status(403).json({ error: "Forbidden (not your wallet)" });
        }
        return next();
    };
}