/**
 * Authorization Enforcement Middleware
 * Performance target: P50 < 5ms (cache hit), P95 < 30ms (DB fallback)
 */
import { Request, Response, NextFunction } from 'express';
import { pool } from '../utils/db';
import { redis, cacheKeys, cacheTTL } from '../utils/redis';

/**
 * Extended Request with user context
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    roles?: string[];
    org_roles?: Record<string, string[]>;
    agent_id?: string;
    country?: string;
    currency?: string;
    kyc_level?: string;
    sira_score?: number;
  };
}

/**
 * Permission structure
 */
export interface Permission {
  code: string;
  name: string;
  resource_kind: string;
  actions: string[];
}

/**
 * Fetch user permissions from cache or DB
 * Returns Set of permission codes for fast lookup
 */
export async function getUserPermissions(userId: string): Promise<Set<string>> {
  const start = Date.now();
  const cacheKey = cacheKeys.userPermissions(userId);

  try {
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      const latency = Date.now() - start;
      console.log(`[AUTHZ] Cache HIT for user ${userId} (${latency}ms)`);
      return new Set(JSON.parse(cached));
    }

    // Cache MISS - fetch from database
    console.log(`[AUTHZ] Cache MISS for user ${userId}, fetching from DB...`);

    const permSet = new Set<string>();

    // 1. Fetch direct grants
    const grantsQuery = `
      SELECT p.code
      FROM grants g
      JOIN permissions p ON p.id = g.permission_id
      WHERE g.user_id = $1
        AND (g.expires_at IS NULL OR g.expires_at > now())
    `;
    const grantsResult = await pool.query(grantsQuery, [userId]);
    grantsResult.rows.forEach((row) => permSet.add(row.code));

    // 2. Fetch permissions from role bindings
    const rolesQuery = `
      SELECT DISTINCT p.code
      FROM role_bindings rb
      JOIN roles r ON r.id = rb.role_id
      JOIN role_templates rt ON rt.id = r.template_id,
      UNNEST(rt.permissions) AS perm_id
      JOIN permissions p ON p.id = perm_id
      WHERE rb.user_id = $1
        AND (rb.expires_at IS NULL OR rb.expires_at > now())
    `;
    const rolesResult = await pool.query(rolesQuery, [userId]);
    rolesResult.rows.forEach((row) => permSet.add(row.code));

    // Cache the result
    const permArray = Array.from(permSet);
    await redis.set(cacheKey, JSON.stringify(permArray), 'EX', cacheTTL.permissions);

    const latency = Date.now() - start;
    console.log(`[AUTHZ] Fetched ${permSet.size} permissions for user ${userId} (${latency}ms)`);

    return permSet;
  } catch (err: any) {
    console.error(`[AUTHZ] Error fetching permissions for user ${userId}:`, err);
    throw err;
  }
}

/**
 * Invalidate user permission cache
 */
export async function invalidateUserPermissions(userId: string): Promise<void> {
  const cacheKey = cacheKeys.userPermissions(userId);
  await redis.del(cacheKey);
  console.log(`[AUTHZ] Invalidated cache for user ${userId}`);
}

/**
 * Middleware: Require specific permission
 * Usage: app.get('/payments', requirePermission('connect:payments:read'), handler)
 */
export function requirePermission(permission: string, options?: { failOpen?: boolean }) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.user;

    // Check authentication
    if (!user || !user.id) {
      return res.status(401).json({
        error: 'unauthenticated',
        message: 'Authentication required',
      });
    }

    try {
      // Fetch user permissions
      const permissions = await getUserPermissions(user.id);

      // Check permission
      if (!permissions.has(permission)) {
        // ABAC checks (optional contextual attributes)
        const abacPassed = await checkABAC(user, permission, req);
        if (!abacPassed) {
          console.warn(
            `[AUTHZ] Permission denied for user ${user.id}: ${permission}`
          );
          return res.status(403).json({
            error: 'forbidden',
            message: `Permission denied: ${permission}`,
            required_permission: permission,
          });
        }
      }

      // Permission granted
      next();
    } catch (err: any) {
      console.error('[AUTHZ] Authorization error:', err);

      // Fail-open mode (allow on errors, use for gradual rollout)
      if (options?.failOpen) {
        console.warn(`[AUTHZ] FAIL-OPEN mode: allowing request despite error`);
        return next();
      }

      // Fail-closed mode (deny on errors, production default)
      return res.status(500).json({
        error: 'authz_failure',
        message: 'Authorization check failed',
      });
    }
  };
}

/**
 * Middleware: Require ANY of the listed permissions (OR logic)
 */
export function requireAnyPermission(permissionsNeeded: string[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user || !user.id) {
      return res.status(401).json({ error: 'unauthenticated' });
    }

    try {
      const permissions = await getUserPermissions(user.id);

      // Check if user has ANY of the required permissions
      const hasAny = permissionsNeeded.some((perm) => permissions.has(perm));

      if (!hasAny) {
        console.warn(
          `[AUTHZ] Permission denied for user ${user.id}: requires one of ${permissionsNeeded.join(', ')}`
        );
        return res.status(403).json({
          error: 'forbidden',
          message: 'Insufficient permissions',
          required_permissions: permissionsNeeded,
        });
      }

      return next();
    } catch (err: any) {
      console.error('[AUTHZ] Authorization error:', err);
      return res.status(500).json({ error: 'authz_failure' });
    }
  };
}

/**
 * Middleware: Require ALL of the listed permissions (AND logic)
 */
export function requireAllPermissions(permissionsNeeded: string[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user || !user.id) {
      return res.status(401).json({ error: 'unauthenticated' });
    }

    try {
      const permissions = await getUserPermissions(user.id);

      // Check if user has ALL required permissions
      const hasAll = permissionsNeeded.every((perm) => permissions.has(perm));

      if (!hasAll) {
        const missing = permissionsNeeded.filter((perm) => !permissions.has(perm));
        console.warn(
          `[AUTHZ] Permission denied for user ${user.id}: missing ${missing.join(', ')}`
        );
        return res.status(403).json({
          error: 'forbidden',
          message: 'Insufficient permissions',
          required_permissions: permissionsNeeded,
          missing_permissions: missing,
        });
      }

      return next();
    } catch (err: any) {
      console.error('[AUTHZ] Authorization error:', err);
      return res.status(500).json({ error: 'authz_failure' });
    }
  };
}

/**
 * ABAC (Attribute-Based Access Control) checks
 * Example: Allow connect:payments:create only if kyc_level >= P2 and sira_score > 0.5
 */
async function checkABAC(
  user: AuthenticatedRequest['user'],
  permission: string,
  req: Request
): Promise<boolean> {
  // Example ABAC rules
  // In production, these rules should be configurable per organization

  // Example 1: High-value payment creation requires KYC P2+
  if (permission === 'connect:payments:create') {
    const amount = (req.body as any)?.amount || 0;
    if (amount > 100000) {
      // $100k threshold
      const kycLevel = user?.kyc_level || 'P0';
      if (kycLevel < 'P2') {
        console.warn(
          `[ABAC] High-value payment requires KYC P2+, user has ${kycLevel}`
        );
        return false;
      }
    }
  }

  // Example 2: Refunds require good SIRA score
  if (permission === 'connect:payments:refund') {
    const siraScore = user?.sira_score || 0;
    if (siraScore < 0.5) {
      console.warn(`[ABAC] Refund requires SIRA score > 0.5, user has ${siraScore}`);
      return false;
    }
  }

  // Example 3: Country-specific restrictions
  if (permission.startsWith('connect:payouts')) {
    const targetCountry = (req.body as any)?.country || user?.country;
    const restrictedCountries = ['KP', 'IR', 'SY']; // Example sanctions list
    if (restrictedCountries.includes(targetCountry)) {
      console.warn(`[ABAC] Payouts blocked for sanctioned country: ${targetCountry}`);
      return false;
    }
  }

  // Default: allow (no ABAC restrictions)
  return true;
}

/**
 * Check if user has permission (programmatic check)
 * For use in business logic (non-middleware)
 */
export async function userHasPermission(
  userId: string,
  permission: string
): Promise<boolean> {
  try {
    const permissions = await getUserPermissions(userId);
    return permissions.has(permission);
  } catch (err) {
    console.error(`[AUTHZ] Error checking permission for user ${userId}:`, err);
    return false;
  }
}

/**
 * Get all permissions for a user (for debugging/admin UI)
 */
export async function getAllUserPermissions(userId: string): Promise<string[]> {
  const permissions = await getUserPermissions(userId);
  return Array.from(permissions);
}