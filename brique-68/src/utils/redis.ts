/**
 * Redis client for permission caching
 * Target: P50 < 5ms for cache hits
 */
import 'dotenv/config';
import Redis from 'ioredis';

export const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  lazyConnect: false,
});

redis.on('error', (err) => {
  console.error('[REDIS] Connection error:', err);
});

redis.on('connect', () => {
  console.log('[REDIS] Connected successfully');
});

/**
 * Cache key generators
 */
export const cacheKeys = {
  userPermissions: (userId: string) => `rbac:user_perms:${userId}`,
  userRoles: (userId: string) => `rbac:user_roles:${userId}`,
  rolePermissions: (roleId: string) => `rbac:role_perms:${roleId}`,
  orgRoles: (orgId: string) => `rbac:org_roles:${orgId}`,
};

/**
 * Cache TTL configuration (seconds)
 */
export const cacheTTL = {
  permissions: 30, // 30 seconds for permissions (fast invalidation)
  roles: 60, // 1 minute for role definitions
  longLived: 300, // 5 minutes for rarely changing data
};

/**
 * Health check
 */
export async function redisHealthCheck(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch (err) {
    console.error('[REDIS] Health check failed:', err);
    return false;
  }
}