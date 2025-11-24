import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

export function authzMiddleware(req: any, res: any, next: NextFunction) {
    const hdr = req.headers.authorization || "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
    if (!token) return res.status(401).json({ error: "missing_token" });
    try {
        const payload = jwt.verify(token, process.env.MOLAM_ID_JWT_PUBLIC as string, { algorithms: ["RS256"] }) as any;
        req.user = {
            id: payload.sub,
            roles: payload.roles || [],
            country: payload.country || "US",
            currency: payload.currency || "USD",
            lang: payload.lang || "en"
        };
        next();
    } catch {
        return res.status(401).json({ error: "invalid_token" });
    }
}

export function requireRole(roles: string[]) {
    return (req: any, res: any, next: any) => {
        const uroles = req.user?.roles || [];
        if (!uroles.some((r: string) => roles.includes(r))) return res.status(403).json({ error: "forbidden" });
        next();
    };
}

export async function idemMiddleware(req: any, res: any, next: any) {
    const key = (req.headers["idempotency-key"] as string) || "";
    if (!key) return res.status(400).json({ error: "missing_idempotency_key" });
    const cacheKey = `idem:${key}`;
    const exists = await redis.get(cacheKey);
    if (exists) return res.status(409).json({ error: "duplicate_request", replay_of: exists });
    await redis.set(cacheKey, "1", "EX", 60 * 30);
    next();
}

export async function antiReplay(req: any, res: any, next: any) {
    const nonce = (req.headers["x-nonce"] as string) || "";
    const ts = parseInt((req.headers["x-ts"] as string) || "0", 10);
    if (!nonce || !ts) return res.status(400).json({ error: "missing_nonce_ts" });
    if (Math.abs(Date.now() - ts) > 5 * 60_000) return res.status(400).json({ error: "stale_request" });
    const ok = await redis.setnx(`nonce:${nonce}`, "1");
    if (!ok) return res.status(409).json({ error: "replay_detected" });
    await redis.expire(`nonce:${nonce}`, 600);
    next();
}

export function verifyHmac(signatureHeader: string, body: string, secret: string) {
    const expected = crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
    return crypto.timingSafeEqual(Buffer.from(signatureHeader, "hex"), Buffer.from(expected, "hex"));
}