import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

redis.on('error', (err) => console.error('[Cache] Redis error:', err));
redis.on('connect', () => console.log('[Cache] Redis connected'));

/**
 * Check if entity is whitelisted for merchant
 */
export async function isWhitelisted(
  merchantId: string,
  entityType: 'customer' | 'card' | 'ip' | 'device',
  value: string
): Promise<boolean> {
  const key = `whitelist:${merchantId}:${entityType}:${value}`;
  const cached = await redis.get(key);
  if (cached !== null) return cached === '1';
  return false;
}

/**
 * Check if entity is blacklisted for merchant
 */
export async function isBlacklisted(
  merchantId: string,
  entityType: 'customer' | 'card' | 'ip' | 'device',
  value: string
): Promise<boolean> {
  const key = `blacklist:${merchantId}:${entityType}:${value}`;
  const cached = await redis.get(key);
  if (cached !== null) return cached === '1';
  return false;
}

/**
 * Cache whitelist entry (24h TTL)
 */
export async function cacheWhitelist(
  merchantId: string,
  entityType: string,
  value: string
): Promise<void> {
  const key = `whitelist:${merchantId}:${entityType}:${value}`;
  await redis.set(key, '1', 'EX', 86400); // 24h
}

/**
 * Cache blacklist entry (24h TTL)
 */
export async function cacheBlacklist(
  merchantId: string,
  entityType: string,
  value: string
): Promise<void> {
  const key = `blacklist:${merchantId}:${entityType}:${value}`;
  await redis.set(key, '1', 'EX', 86400); // 24h
}

/**
 * Invalidate cached entry
 */
export async function invalidateEntry(
  merchantId: string,
  listType: 'whitelist' | 'blacklist',
  entityType: string,
  value: string
): Promise<void> {
  const key = `${listType}:${merchantId}:${entityType}:${value}`;
  await redis.del(key);
}

/**
 * Preload all merchant lists into cache
 */
export async function preloadMerchantLists(merchantId: string, lists: any[]): Promise<void> {
  const pipeline = redis.pipeline();

  for (const list of lists) {
    const key = `${list.list_type}:${merchantId}:${list.entity_type}:${list.value}`;
    pipeline.set(key, '1', 'EX', 86400);
  }

  await pipeline.exec();
}

/**
 * Get fraud alert count for merchant (last 24h)
 */
export async function getAlertCount(merchantId: string): Promise<number> {
  const key = `alerts:count:${merchantId}`;
  const count = await redis.get(key);
  return count ? parseInt(count, 10) : 0;
}

/**
 * Increment alert count for merchant
 */
export async function incrementAlertCount(merchantId: string): Promise<void> {
  const key = `alerts:count:${merchantId}`;
  await redis.incr(key);
  await redis.expire(key, 86400); // 24h
}

export { redis };
