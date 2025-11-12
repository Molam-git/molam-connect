/**
 * Cache Invalidation Worker
 * Invalidates user permission caches on role/grant changes
 */
import { redis, cacheKeys } from '../utils/redis';

/**
 * Invalidate user permissions cache
 */
export async function invalidateUserPermissions(userId: string): Promise<void> {
  try {
    const cacheKey = cacheKeys.userPermissions(userId);
    await redis.del(cacheKey);
    console.log(`[CACHE] Invalidated permissions for user ${userId}`);
  } catch (err) {
    console.error(`[CACHE] Error invalidating permissions for user ${userId}:`, err);
  }
}

/**
 * Invalidate multiple users' permissions (batch)
 */
export async function invalidateMultipleUsers(userIds: string[]): Promise<void> {
  try {
    if (userIds.length === 0) return;

    const keys = userIds.map((userId) => cacheKeys.userPermissions(userId));
    await redis.del(...keys);
    console.log(`[CACHE] Invalidated permissions for ${userIds.length} users`);
  } catch (err) {
    console.error(`[CACHE] Error invalidating multiple users:`, err);
  }
}

/**
 * Invalidate all users with a specific role
 * (Call when role permissions are modified)
 */
export async function invalidateUsersWithRole(roleId: string): Promise<void> {
  try {
    const { pool } = await import('../utils/db');

    // Find all users with this role
    const { rows } = await pool.query(
      `SELECT DISTINCT user_id FROM role_bindings WHERE role_id = $1`,
      [roleId]
    );

    const userIds = rows.map((row) => row.user_id);
    await invalidateMultipleUsers(userIds);

    console.log(
      `[CACHE] Invalidated permissions for ${userIds.length} users with role ${roleId}`
    );
  } catch (err) {
    console.error(`[CACHE] Error invalidating users with role ${roleId}:`, err);
  }
}

/**
 * Invalidate all users in an organisation
 * (Call when organisation-level policies change)
 */
export async function invalidateOrganisation(organisationId: string): Promise<void> {
  try {
    const { pool } = await import('../utils/db');

    // Find all users with roles in this organisation
    const { rows } = await pool.query(
      `SELECT DISTINCT rb.user_id
       FROM role_bindings rb
       JOIN roles r ON r.id = rb.role_id
       WHERE r.organisation_id = $1`,
      [organisationId]
    );

    const userIds = rows.map((row) => row.user_id);
    await invalidateMultipleUsers(userIds);

    console.log(
      `[CACHE] Invalidated permissions for ${userIds.length} users in organisation ${organisationId}`
    );
  } catch (err) {
    console.error(
      `[CACHE] Error invalidating organisation ${organisationId}:`,
      err
    );
  }
}

/**
 * Flush all permission caches (emergency use only)
 */
export async function flushAllPermissionCaches(): Promise<void> {
  try {
    const pattern = 'rbac:user_perms:*';
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`[CACHE] Flushed ${keys.length} permission caches`);
    }
  } catch (err) {
    console.error('[CACHE] Error flushing all caches:', err);
  }
}

/**
 * Warm up cache for frequently accessed users
 * (Run on startup or periodically)
 */
export async function warmUpCache(userIds: string[]): Promise<void> {
  try {
    const { getUserPermissions } = await import('../middleware/authzEnforce');

    console.log(`[CACHE] Warming up cache for ${userIds.length} users...`);

    for (const userId of userIds) {
      try {
        await getUserPermissions(userId);
      } catch (err) {
        console.error(`[CACHE] Error warming up cache for user ${userId}:`, err);
      }
    }

    console.log('[CACHE] Cache warm-up complete');
  } catch (err) {
    console.error('[CACHE] Error during cache warm-up:', err);
  }
}

/**
 * Monitor cache performance (metrics for observability)
 */
export async function getCacheMetrics(): Promise<{
  total_keys: number;
  permission_keys: number;
  memory_used: string;
}> {
  try {
    const info = await redis.info('memory');
    const keys = await redis.keys('rbac:user_perms:*');

    const memoryMatch = info.match(/used_memory_human:(.+)/);
    const memoryUsed = memoryMatch ? memoryMatch[1].trim() : 'unknown';

    return {
      total_keys: await redis.dbsize(),
      permission_keys: keys.length,
      memory_used: memoryUsed,
    };
  } catch (err) {
    console.error('[CACHE] Error getting metrics:', err);
    return {
      total_keys: 0,
      permission_keys: 0,
      memory_used: 'unknown',
    };
  }
}