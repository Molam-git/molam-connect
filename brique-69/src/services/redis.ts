import Redis from 'ioredis';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError(err) {
        console.error('Redis connection error:', err);
        return true;
      },
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis connected');
    });

    redisClient.on('error', (err) => {
      console.error('Redis error:', err);
    });
  }

  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('Redis connection closed');
  }
}

// Cache helpers
export async function getCached<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  const cached = await redis.get(key);
  return cached ? JSON.parse(cached) : null;
}

export async function setCached<T>(
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<void> {
  const redis = getRedisClient();
  const serialized = JSON.stringify(value);

  if (ttlSeconds) {
    await redis.set(key, serialized, 'EX', ttlSeconds);
  } else {
    await redis.set(key, serialized);
  }
}

export async function incrementCounter(
  key: string,
  amount: number = 1,
  ttlSeconds?: number
): Promise<number> {
  const redis = getRedisClient();
  const newValue = await redis.incrby(key, amount);

  if (ttlSeconds) {
    await redis.expire(key, ttlSeconds);
  }

  return newValue;
}

export async function incrementFloat(
  key: string,
  amount: number,
  ttlSeconds?: number
): Promise<number> {
  const redis = getRedisClient();
  const newValue = await redis.incrbyfloat(key, amount);

  if (ttlSeconds) {
    await redis.expire(key, ttlSeconds);
  }

  return parseFloat(newValue);
}

export async function getMovingAverage(
  key: string,
  windowSize: number = 24
): Promise<number | null> {
  const redis = getRedisClient();
  const values = await redis.lrange(key, 0, windowSize - 1);

  if (values.length === 0) return null;

  const sum = values.reduce((acc, val) => acc + parseFloat(val), 0);
  return sum / values.length;
}

export async function pushToMovingAverage(
  key: string,
  value: number,
  windowSize: number = 24,
  ttlSeconds: number = 86400
): Promise<void> {
  const redis = getRedisClient();

  await redis.lpush(key, value.toString());
  await redis.ltrim(key, 0, windowSize - 1);
  await redis.expire(key, ttlSeconds);
}
