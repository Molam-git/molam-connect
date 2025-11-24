/**
 * RBAC Service for Molam Connect
 * Provides RBAC operations for the main application
 */

const { Pool } = require('pg');
const path = require('path');

// Import RBAC utilities from Brique 68
const { invalidateUserPermissions, getUserPermissions } = require(path.join(__dirname, '../../brique-68/dist/middleware/authzEnforce.js'));

class RBACService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Assign role to user
   * @param {string} roleId - Role ID
   * @param {string} userId - Target user ID
   * @param {string} assignedBy - User who is assigning the role
   * @param {object} options - Optional parameters (expires_at, context, reason)
   * @returns {Promise<object>}
   */
  async assignRole(roleId, userId, assignedBy, options = {}) {
    const { expires_at, context, reason } = options;

    try {
      // Check if role is sensitive (requires approval)
      const roleQuery = `
        SELECT rt.sensitive, r.organisation_id, r.name
        FROM roles r
        JOIN role_templates rt ON rt.id = r.template_id
        WHERE r.id = $1
      `;
      const { rows: roleRows } = await this.pool.query(roleQuery, [roleId]);

      if (roleRows.length === 0) {
        throw new Error('Role not found');
      }

      const role = roleRows[0];

      if (role.sensitive) {
        // Create role request for approval
        const requestQuery = `
          INSERT INTO role_requests(
            role_id, target_user_id, requested_by, required_approvals, reason
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `;
        const { rows: [request] } = await this.pool.query(requestQuery, [
          roleId,
          userId,
          assignedBy,
          2, // Default: 2 approvals for sensitive roles
          reason || 'No reason provided',
        ]);

        // Audit log
        await this.pool.query(
          `INSERT INTO rbac_audit_logs(actor_id, action, target, details)
           VALUES ($1, 'request_role_assignment', $2, $3)`,
          [
            assignedBy,
            JSON.stringify({ role_request_id: request.id, target_user_id: userId }),
            JSON.stringify({ roleId, userId, ...options }),
          ]
        );

        return {
          status: 'approval_required',
          message: 'Role assignment request created, pending approval',
          request,
        };
      } else {
        // Direct assignment (non-sensitive role)
        await this.pool.query(
          `INSERT INTO role_bindings(role_id, user_id, assigned_by, expires_at, context)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (role_id, user_id) DO NOTHING`,
          [roleId, userId, assignedBy, expires_at || null, context || {}]
        );

        // Invalidate cache for target user
        await invalidateUserPermissions(userId);

        // Audit log
        await this.pool.query(
          `INSERT INTO rbac_audit_logs(actor_id, action, target, details)
           VALUES ($1, 'assign_role', $2, $3)`,
          [
            assignedBy,
            JSON.stringify({ role_id: roleId, user_id: userId }),
            JSON.stringify({ roleId, userId, ...options }),
          ]
        );

        return {
          status: 'assigned',
          message: 'Role assigned successfully',
        };
      }
    } catch (error) {
      console.error('[RBAC Service] Error assigning role:', error);
      throw error;
    }
  }

  /**
   * Revoke role from user
   * @param {string} roleId - Role ID
   * @param {string} userId - Target user ID
   * @param {string} revokedBy - User who is revoking the role
   * @returns {Promise<void>}
   */
  async revokeRole(roleId, userId, revokedBy) {
    try {
      await this.pool.query(
        `DELETE FROM role_bindings WHERE role_id = $1 AND user_id = $2`,
        [roleId, userId]
      );

      // Invalidate cache
      await invalidateUserPermissions(userId);

      // Audit log
      await this.pool.query(
        `INSERT INTO rbac_audit_logs(actor_id, action, target)
         VALUES ($1, 'revoke_role', $2)`,
        [revokedBy, JSON.stringify({ role_id: roleId, user_id: userId })]
      );
    } catch (error) {
      console.error('[RBAC Service] Error revoking role:', error);
      throw error;
    }
  }

  /**
   * Grant direct permission to user
   * @param {string} userId - User ID
   * @param {string} permissionId - Permission ID
   * @param {string} grantedBy - User who is granting
   * @param {object} options - Optional parameters (organisation_id, expires_at, reason)
   * @returns {Promise<void>}
   */
  async grantPermission(userId, permissionId, grantedBy, options = {}) {
    const { organisation_id, expires_at, reason } = options;

    try {
      await this.pool.query(
        `INSERT INTO grants(user_id, permission_id, organisation_id, created_by, expires_at, reason)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, permission_id, organisation_id) DO NOTHING`,
        [userId, permissionId, organisation_id || null, grantedBy, expires_at || null, reason || 'Direct grant']
      );

      // Invalidate cache
      await invalidateUserPermissions(userId);

      // Audit log
      await this.pool.query(
        `INSERT INTO rbac_audit_logs(actor_id, action, target, details)
         VALUES ($1, 'grant_permission', $2, $3)`,
        [
          grantedBy,
          JSON.stringify({ user_id: userId, permission_id: permissionId }),
          JSON.stringify(options),
        ]
      );
    } catch (error) {
      console.error('[RBAC Service] Error granting permission:', error);
      throw error;
    }
  }

  /**
   * Get user's roles
   * @param {string} userId - User ID
   * @param {string} [organisationId] - Optional organisation filter
   * @returns {Promise<Array>}
   */
  async getUserRoles(userId, organisationId = null) {
    try {
      let query = `
        SELECT
          rb.id AS binding_id,
          r.id AS role_id,
          r.name AS role_name,
          r.organisation_id,
          rt.name AS template_name,
          rt.sensitive,
          rb.assigned_at,
          rb.expires_at
        FROM role_bindings rb
        JOIN roles r ON r.id = rb.role_id
        LEFT JOIN role_templates rt ON rt.id = r.template_id
        WHERE rb.user_id = $1
          AND (rb.expires_at IS NULL OR rb.expires_at > now())
      `;
      const params = [userId];

      if (organisationId) {
        query += ` AND r.organisation_id = $2`;
        params.push(organisationId);
      }

      query += ` ORDER BY rb.assigned_at DESC`;

      const { rows } = await this.pool.query(query, params);
      return rows;
    } catch (error) {
      console.error('[RBAC Service] Error getting user roles:', error);
      throw error;
    }
  }

  /**
   * Get user's permissions
   * @param {string} userId - User ID
   * @returns {Promise<Set<string>>} Set of permission codes
   */
  async getUserPermissions(userId) {
    return await getUserPermissions(userId);
  }

  /**
   * Check if user has permission
   * @param {string} userId - User ID
   * @param {string} permissionCode - Permission code
   * @returns {Promise<boolean>}
   */
  async userHasPermission(userId, permissionCode) {
    const permissions = await getUserPermissions(userId);
    return permissions.has(permissionCode);
  }
}

module.exports = RBACService;
