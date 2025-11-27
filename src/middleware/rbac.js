/**
 * RBAC Middleware Integration for Molam Connect
 * Simplified version for Docker (without brique-68 dependency)
 */

/**
 * Stub functions for RBAC (TODO: Implement with database queries)
 */

// Stub: Get user permissions from database
async function getUserPermissions(userId) {
  console.log(`[RBAC] Get permissions for user: ${userId}`);
  // TODO: Query database for user permissions
  return new Set(['connect:payments:read', 'connect:payments:write']);
}

// Stub: Invalidate cached user permissions
async function invalidateUserPermissions(userId) {
  console.log(`[RBAC] Invalidate permissions cache for user: ${userId}`);
  // TODO: Clear Redis cache for user permissions
}

// Middleware: Require specific permission
function requirePermission(permission) {
  return async (req, res, next) => {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: {
          code: 'authentication_required',
          message: 'Authentication required'
        }
      });
    }

    const permissions = await getUserPermissions(userId);

    if (!permissions.has(permission)) {
      return res.status(403).json({
        error: {
          code: 'insufficient_permissions',
          message: `Permission required: ${permission}`
        }
      });
    }

    next();
  };
}

// Middleware: Require ANY of the permissions (OR logic)
function requireAnyPermission(permissionsArray) {
  return async (req, res, next) => {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: {
          code: 'authentication_required',
          message: 'Authentication required'
        }
      });
    }

    const permissions = await getUserPermissions(userId);
    const hasAny = permissionsArray.some((perm) => permissions.has(perm));

    if (!hasAny) {
      return res.status(403).json({
        error: {
          code: 'insufficient_permissions',
          message: `One of these permissions required: ${permissionsArray.join(', ')}`
        }
      });
    }

    next();
  };
}

// Middleware: Require ALL of the permissions (AND logic)
function requireAllPermissions(permissionsArray) {
  return async (req, res, next) => {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: {
          code: 'authentication_required',
          message: 'Authentication required'
        }
      });
    }

    const permissions = await getUserPermissions(userId);
    const hasAll = permissionsArray.every((perm) => permissions.has(perm));

    if (!hasAll) {
      return res.status(403).json({
        error: {
          code: 'insufficient_permissions',
          message: `All of these permissions required: ${permissionsArray.join(', ')}`
        }
      });
    }

    next();
  };
}

/**
 * Export middleware functions for use in Express routes
 */
module.exports = {
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  getUserPermissions,
  invalidateUserPermissions,

  /**
   * Helper: Check if user has permission (programmatic check)
   * @param {string} userId - User ID
   * @param {string} permission - Permission code (e.g., 'connect:payments:read')
   * @returns {Promise<boolean>}
   */
  async userHasPermission(userId, permission) {
    const permissions = await getUserPermissions(userId);
    return permissions.has(permission);
  },

  /**
   * Helper: Check if user has ANY of the permissions (OR logic)
   * @param {string} userId - User ID
   * @param {string[]} permissionsArray - Array of permission codes
   * @returns {Promise<boolean>}
   */
  async userHasAnyPermission(userId, permissionsArray) {
    const permissions = await getUserPermissions(userId);
    return permissionsArray.some((perm) => permissions.has(perm));
  },

  /**
   * Helper: Check if user has ALL of the permissions (AND logic)
   * @param {string} userId - User ID
   * @param {string[]} permissionsArray - Array of permission codes
   * @returns {Promise<boolean>}
   */
  async userHasAllPermissions(userId, permissionsArray) {
    const permissions = await getUserPermissions(userId);
    return permissionsArray.every((perm) => permissions.has(perm));
  },
};
