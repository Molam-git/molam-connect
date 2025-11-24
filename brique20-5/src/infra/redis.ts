import Redis from "ioredis";
import { config } from "../config/env.js";

const redisOptions = {
  maxRetriesPerRequest: 3,
  retryDelay: (times: number) => Math.min(times * 50, 2000),
  lazyConnect: true,
  connectTimeout: 10000,
  commandTimeout: 5000,
};

export const redis = new Redis(config.redisUrl, redisOptions);

// Événements
redis.on('connect', () => {
  console.log('✅ Redis connected');
});

redis.on('error', (err) => {
  console.error('❌ Redis error:', err);
});

// Test de connexion
export async function testRedisConnection(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch (error) {
    return false;
  }
}