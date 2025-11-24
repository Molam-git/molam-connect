import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

export async function rateLimitCheck(msisdn: string): Promise<void> {
    const key = `ussd:rl:${msisdn}`;
    const count = await redis.incr(key);

    if (count === 1) {
        await redis.expire(key, 5);
    }

    if (count > 10) {
        throw new Error("Rate limit exceeded");
    }
}