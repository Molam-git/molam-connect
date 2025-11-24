/**
 * RBAC Middleware Integration for Molam Connect
 * Bridges TypeScript RBAC (Brique 68) with main JavaScript server
 */

const path = require('path');

// Import compiled TypeScript modules from Brique 68
const rbacPath = path.join(__dirname, '../../brique-68/dist/middleware/authzEnforce.js');
const {
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  getUserPermissions,
  invalidateUserPermissions,
} = require(rbacPath);

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
