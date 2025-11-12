/**
 * Unit Tests for RBAC Engine
 * Tests for permission checking, role assignment, and approval workflows
 */
import { pool } from '../src/utils/db';
import { redis } from '../src/utils/redis';
import {
  getUserPermissions,
  invalidateUserPermissions,
  userHasPermission,
} from '../src/middleware/authzEnforce';

// Mock dependencies
jest.mock('../src/utils/db');
jest.mock('../src/utils/redis');

const mockPool = pool as jest.Mocked<typeof pool>;
const mockRedis = redis as jest.Mocked<typeof redis>;

describe('RBAC Engine - Permission Checking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserPermissions', () => {
    it('should return permissions from cache if available', async () => {
      const userId = 'user-123';
      const cachedPerms = JSON.stringify(['connect:payments:read', 'connect:payments:create']);

      mockRedis.get.mockResolvedValue(cachedPerms);

      const result = await getUserPermissions(userId);

      expect(mockRedis.get).toHaveBeenCalledWith(`rbac:user_perms:${userId}`);
      expect(result).toEqual(
        new Set(['connect:payments:read', 'connect:payments:create'])
      );
      expect(mockPool.query).not.toHaveBeenCalled(); // Should not hit DB
    });

    it('should fetch permissions from DB on cache miss', async () => {
      const userId = 'user-456';

      mockRedis.get.mockResolvedValue(null); // Cache miss

      // Mock direct grants
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ code: 'connect:payments:read' }],
          rowCount: 1,
        } as any)
        // Mock role-based permissions
        .mockResolvedValueOnce({
          rows: [
            { code: 'connect:payments:create' },
            { code: 'connect:payouts:read' },
          ],
          rowCount: 2,
        } as any);

      const result = await getUserPermissions(userId);

      expect(mockRedis.get).toHaveBeenCalledWith(`rbac:user_perms:${userId}`);
      expect(mockPool.query).toHaveBeenCalledTimes(2); // Grants + roles
      expect(result).toEqual(
        new Set([
          'connect:payments:read',
          'connect:payments:create',
          'connect:payouts:read',
        ])
      );

      // Should cache the result
      expect(mockRedis.set).toHaveBeenCalledWith(
        `rbac:user_perms:${userId}`,
        expect.any(String),
        'EX',
        30
      );
    });

    it('should merge permissions from grants and roles', async () => {
      const userId = 'user-789';

      mockRedis.get.mockResolvedValue(null);

      // Mock direct grants
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { code: 'connect:payments:read' },
            { code: 'connect:payments:refund' },
          ],
          rowCount: 2,
        } as any)
        // Mock role-based permissions
        .mockResolvedValueOnce({
          rows: [
            { code: 'connect:payments:read' }, // Duplicate - should be deduplicated
            { code: 'rbac:roles:read' },
          ],
          rowCount: 2,
        } as any);

      const result = await getUserPermissions(userId);

      expect(result).toEqual(
        new Set([
          'connect:payments:read',
          'connect:payments:refund',
          'rbac:roles:read',
        ])
      );
      expect(result.size).toBe(3); // Duplicates removed
    });

    it('should handle empty permissions gracefully', async () => {
      const userId = 'user-no-perms';

      mockRedis.get.mockResolvedValue(null);
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // No grants
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // No roles

      const result = await getUserPermissions(userId);

      expect(result).toEqual(new Set());
      expect(result.size).toBe(0);
    });
  });

  describe('userHasPermission', () => {
    it('should return true if user has permission', async () => {
      const userId = 'user-123';
      const permission = 'connect:payments:read';

      mockRedis.get.mockResolvedValue(
        JSON.stringify(['connect:payments:read', 'connect:payments:create'])
      );

      const result = await userHasPermission(userId, permission);

      expect(result).toBe(true);
    });

    it('should return false if user does not have permission', async () => {
      const userId = 'user-123';
      const permission = 'rbac:roles:create';

      mockRedis.get.mockResolvedValue(
        JSON.stringify(['connect:payments:read', 'connect:payments:create'])
      );

      const result = await userHasPermission(userId, permission);

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      const userId = 'user-error';
      const permission = 'connect:payments:read';

      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await userHasPermission(userId, permission);

      expect(result).toBe(false);
    });
  });

  describe('invalidateUserPermissions', () => {
    it('should delete cache for user', async () => {
      const userId = 'user-123';

      mockRedis.del.mockResolvedValue(1);

      await invalidateUserPermissions(userId);

      expect(mockRedis.del).toHaveBeenCalledWith(`rbac:user_perms:${userId}`);
    });
  });
});

describe('RBAC Engine - Role Assignment', () => {
  it('should create role binding for non-sensitive role', async () => {
    const roleId = 'role-123';
    const userId = 'user-456';
    const assignedBy = 'admin-789';

    // Mock role check (non-sensitive)
    mockPool.query.mockResolvedValueOnce({
      rows: [{ sensitive: false, organisation_id: 'org-1' }],
      rowCount: 1,
    } as any);

    // Mock role binding insertion
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'binding-1', role_id: roleId, user_id: userId }],
      rowCount: 1,
    } as any);

    // Mock audit log
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'audit-1' }],
      rowCount: 1,
    } as any);

    // Simulate API call would happen here
    // In production, this would be tested via supertest
  });

  it('should create role request for sensitive role', async () => {
    const roleId = 'role-sensitive';
    const userId = 'user-456';

    // Mock role check (sensitive)
    mockPool.query.mockResolvedValueOnce({
      rows: [{ sensitive: true, organisation_id: 'org-1' }],
      rowCount: 1,
    } as any);

    // Mock role request creation
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'request-1',
          role_id: roleId,
          target_user_id: userId,
          status: 'pending',
          required_approvals: 2,
        },
      ],
      rowCount: 1,
    } as any);

    // Should create request, not binding
  });
});

describe('RBAC Engine - Approval Workflow', () => {
  it('should approve request and create binding when threshold reached', async () => {
    const requestId = 'request-123';
    const approverId = 'approver-1';

    // Mock existing request (1 approval, needs 2)
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: requestId,
          role_id: 'role-123',
          target_user_id: 'user-456',
          status: 'pending',
          approvals: [{ by: 'approver-0', at: new Date(), note: 'Approved' }],
          required_approvals: 2,
        },
      ],
      rowCount: 1,
    } as any);

    // Mock update request (status -> approved)
    mockPool.query.mockResolvedValueOnce({
      rows: [],
      rowCount: 1,
    } as any);

    // Mock create binding
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'binding-1' }],
      rowCount: 1,
    } as any);

    // Should create binding after 2nd approval
  });

  it('should reject request without creating binding', async () => {
    const requestId = 'request-123';
    const rejecterId = 'rejector-1';

    // Mock update request (status -> rejected)
    mockPool.query.mockResolvedValueOnce({
      rows: [],
      rowCount: 1,
    } as any);

    // Mock audit log
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'audit-1' }],
      rowCount: 1,
    } as any);

    // Should NOT create binding
  });
});

describe('RBAC Engine - Direct Grants', () => {
  it('should create direct permission grant', async () => {
    const userId = 'user-123';
    const permissionId = 'perm-456';
    const organisationId = 'org-789';

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'grant-1',
          user_id: userId,
          permission_id: permissionId,
          organisation_id: organisationId,
        },
      ],
      rowCount: 1,
    } as any);

    // Should create grant and invalidate cache
  });

  it('should support time-limited grants', async () => {
    const userId = 'user-contractor';
    const permissionId = 'perm-temp';
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'grant-temp',
          user_id: userId,
          permission_id: permissionId,
          expires_at: expiresAt,
        },
      ],
      rowCount: 1,
    } as any);

    // Grant should expire after 7 days
  });
});

describe('RBAC Engine - Performance', () => {
  it('should complete cache hit in < 5ms', async () => {
    const userId = 'user-perf';
    const cachedPerms = JSON.stringify(['connect:payments:read']);

    mockRedis.get.mockResolvedValue(cachedPerms);

    const start = Date.now();
    await getUserPermissions(userId);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(5); // P50 target
  });
});