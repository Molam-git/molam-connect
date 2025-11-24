// src/middlewares/auth.ts
import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

export interface MolamUser {
    id: string;
    roles: string[];
    lang?: string;
    agentId?: string;
    email?: string;
}

declare global {
    namespace Express {
        interface Request {
            user?: MolamUser;
        }
    }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const auth = req.headers["authorization"];
    if (!auth || !auth.startsWith("Bearer ")) {
        return res.status(401).json({ error: "missing_token" });
    }
    const token = auth.substring(7);

    try {
        const decoded = jwt.verify(token, process.env.MOLAM_ID_PUBLIC_KEY || "", { algorithms: ["RS256"] }) as JwtPayload;
        req.user = {
            id: decoded.sub as string,
            roles: (decoded.roles || []) as string[],
            lang: decoded.lang as string,
            agentId: decoded.agentId as string,
            email: decoded.email as string,
        };
        next();
    } catch (err: any) {
        return res.status(401).json({ error: "invalid_token", detail: err.message });
    }
}