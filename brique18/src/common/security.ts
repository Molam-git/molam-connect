// src/common/security.ts
import { Request } from "express";
import Redis from "ioredis";

const redis = new Redis();

export function requireMTLS(req: Request): void {
    // Vérification plus robuste de mTLS
    const client = req.client;
    const socket = (req.socket as any); // Accès alternatif via socket

    if (!client?.authorized && !socket?.authorized) {
        throw new Error("mTLS certificate required or not authorized");
    }
}

export async function verifyAgentJWT(req: Request): Promise<any> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        throw new Error("JWT token required");
    }

    const token = authHeader.substring(7);

    try {
        // Implémentation simplifiée - à compléter avec la logique JWT réelle
        // Exemple avec jsonwebtoken :
        // const decoded = jwt.verify(token, process.env.JWT_SECRET!);

        const decoded = {
            agentId: 1,
            terminalId: 1,
            country_code: "SN",
            kyc_level: "P1",
            partner_code: "MOLAM001"
        };
        return decoded;
    } catch (error) {
        throw new Error("Invalid JWT token");
    }
}

export async function checkRateLimit(key: string, windowSeconds: number, maxRequests: number): Promise<void> {
    const current = Math.floor(Date.now() / 1000);
    const windowStart = current - windowSeconds;

    await redis.zremrangebyscore(key, 0, windowStart);
    const requests = await redis.zcard(key);

    if (requests >= maxRequests) {
        throw new Error("Rate limit exceeded");
    }

    await redis.zadd(key, current, `${current}-${Math.random()}`);
    await redis.expire(key, windowSeconds);
}

// Fonction utilitaire pour vérifier le certificat client
export function getClientCertificate(req: Request): any {
    const client = req.client;
    const socket = (req.socket as any);

    if (client?.getPeerCertificate) {
        return client.getPeerCertificate();
    } else if (socket?.getPeerCertificate) {
        return socket.getPeerCertificate();
    }

    return null;
}