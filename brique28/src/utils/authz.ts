// src/utils/authz.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface MolamUser {
    id: string;
    roles: string[];
    country: string;
    currency: string;
    lang: string;
    agentId: number | null;
}

declare global {
    namespace Express {
        interface Request {
            user?: MolamUser;
        }
    }
}

export function authzMiddleware(req: Request, res: Response, next: NextFunction) {
    const hdr = String(req.headers["authorization"] || "");
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
    if (!token) return res.status(401).json({ error: "missing_token" });

    try {
        const payload = jwt.verify(token, process.env.MOLAM_ID_JWT_PUBLIC as string, {
            algorithms: ["RS256"],
        }) as any;

        if (!payload.sub) return res.status(401).json({ error: "invalid_token_missing_sub" });

        req.user = {
            id: payload.sub,
            roles: payload.roles || [],
            country: payload.country || payload.zone || "US",
            currency: payload.currency || "USD",
            lang: payload.lang || "en",
            agentId: payload.agent_id || null,
        };
        next();
    } catch (err) {
        return res.status(401).json({ error: "invalid_token", detail: (err as Error).message });
    }
}

export function requireRole(roles: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        const u = req.user;
        if (!u) return res.status(401).json({ error: "missing_user" });
        if (!u.roles || !Array.isArray(u.roles)) return res.status(403).json({ error: "forbidden" });
        if (!u.roles.some((r: string) => roles.includes(r))) return res.status(403).json({ error: "forbidden" });
        next();
    };
}