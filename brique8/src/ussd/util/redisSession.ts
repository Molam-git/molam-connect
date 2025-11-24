import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

export interface Session {
    sessionId: string;
    state: string;
    lang: string;
    country_code: string;
    currency: string;
    ctx: any;
    tries: { pin: number };
}

export async function getSession(sessionId: string, prof: any, lang: string): Promise<Session> {
    const key = `ussd:session:${sessionId}`;
    const raw = await redis.get(key);

    if (raw) {
        return JSON.parse(raw);
    }

    const newSession: Session = {
        sessionId,
        state: "HOME",
        lang: prof.language || lang,
        country_code: prof.country_code,
        currency: prof.currency,
        ctx: {},
        tries: { pin: 0 }
    };

    await setSession(sessionId, newSession);
    return newSession;
}

export async function setSession(sessionId: string, session: Session): Promise<void> {
    const key = `ussd:session:${sessionId}`;
    await redis.set(key, JSON.stringify(session), "EX", 180);
}

export async function clearSession(sessionId: string): Promise<void> {
    const key = `ussd:session:${sessionId}`;
    await redis.del(key);
}