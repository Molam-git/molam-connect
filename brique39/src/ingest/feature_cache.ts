import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

export async function cacheFeatureVector(userId: string, vector: any) {
    const key = `features:user:${userId}`;
    await redis.set(key, JSON.stringify(vector), "EX", 120);
}

export async function getCachedFeatureVector(userId: string) {
    const key = `features:user:${userId}`;
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
}