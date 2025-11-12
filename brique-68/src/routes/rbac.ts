/**
 * RBAC Admin API Routes
 * Role management, assignment, and approval workflows
 */
import { Router } from 'express';
import { pool } from '../utils/db';
import {
  requirePermission,
  requireAnyPermission,
  AuthenticatedRequest,
  invalidateUserPermissions,
} from '../middleware/authzEnforce';

const router = Router();

// ========================================================================
// Role Templates Management
// ========================================================================

/**
 * GET /api/rbac/templates - List role templates
 */
router.get(
  '/templates',
  requirePermission('rbac:roles:read'),
  async (_req: AuthenticatedRequest, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT
          rt.*,
          (SELECT json_agg(json_build_object('id', p.id, 'code', p.code, 'name', p.name))
           FROM unnest(rt.permissions) perm_id
           JOIN permissions p ON p.id = perm_id) AS permissions_details
        FROM role_templates rt
        ORDER BY rt.created_at DESC`
      );

      return res.json({ templates: rows });
    } catch (err: any) {
      console.error('[RBAC] Error fetching templates:', err);
      return res.status(500).json({ error: 'fetch_failed', message: err.message });
    }
  }
);

/**
 * POST /api/rbac/templates - Create role template
 */
router.post(
  '/templates',
  requirePermission('rbac:templates:create'),
  async (req: AuthenticatedRequest, res) => {
    const { name, description, permissions, sensitive } = req.body;

    if (!name || !permissions || !Array.isArray(permissions)) {
      return res.status(400).json({ error: 'invalid_input' });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO role_templates(name, description, permissions, sensitive)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [name, description, permissions, sensitive || false]
      );

      // Audit log
      await pool.query(
        `INSERT INTO rbac_audit_logs(actor_id, action, target, details)
         VALUES ($1, 'create_template', $2, $3)`,
        [
          req.user?.id,
          JSON.stringify({ template_id: rows[0].id }),
          JSON.stringify(req.body),
        ]
      );

      return res.status(201).json({ template: rows[0] });
    } catch (err: any) {
      console.error('[RBAC] Error creating template:', err);
      return res.status(500).json({ error: 'create_failed', message: err.message });
    }
  }
);

// ========================================================================
// Roles Management (Organisation-specific)
// ========================================================================

/**
 * GET /api/rbac/organisations/:orgId/roles - List roles for organisation
 */
router.get(
  '/organisations/:orgId/roles',
  requirePermission('rbac:roles:read'),
  async (req: AuthenticatedRequest, res) => {
    const { orgId } = req.params;

    try {
      const { rows } = await pool.query(
        `SELECT
          r.*,
          rt.name AS template_name,
          rt.sensitive AS template_sensitive,
          (SELECT COUNT(*) FROM role_bindings WHERE role_id = r.id) AS member_count
        FROM roles r
        LEFT JOIN role_templates rt ON rt.id = r.template_id
        WHERE r.organisation_id = $1
        ORDER BY r.created_at DESC`,
        [orgId]
      );

      return res.json({ roles: rows });
    } catch (err: any) {
      console.error('[RBAC] Error fetching roles:', err);
      return res.status(500).json({ error: 'fetch_failed', message: err.message });
    }
  }
);

/**
 * POST /api/rbac/roles - Create role for organisation
 */
router.post(
  '/roles',
  requirePermission('rbac:roles:create'),
  async (req: AuthenticatedRequest, res) => {
    const { template_id, organisation_id, name, metadata } = req.body;

    if (!template_id || !organisation_id || !name) {
      return res.status(400).json({ error: 'invalid_input' });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO roles(template_id, organisation_id, name, metadata, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [template_id, organisation_id, name, metadata || {}, req.user?.id]
      );

      // Audit log
      await pool.query(
        `INSERT INTO rbac_audit_logs(actor_id, action, target, details)
         VALUES ($1, 'create_role', $2, $3)`,
        [
          req.user?.id,
          JSON.stringify({ role_id: rows[0].id, organisation_id }),
          JSON.stringify(req.body),
        ]
      );

      return res.status(201).json({ role: rows[0] });
    } catch (err: any) {
      console.error('[RBAC] Error creating role:', err);
      return res.status(500).json({ error: 'create_failed', message: err.message });
    }
  }
);

// ========================================================================
// Role Bindings (Assign/Revoke)
// ========================================================================

/**
 * POST /api/rbac/roles/:roleId/assign - Assign role to user
 */
router.post(
  '/roles/:roleId/assign',
  requirePermission('rbac:roles:assign'),
  async (req: AuthenticatedRequest, res) => {
    const { roleId } = req.params;
    const { target_user_id, expires_at, context, reason } = req.body;

    if (!target_user_id) {
      return res.status(400).json({ error: 'target_user_id_required' });
    }

    try {
      // Check if role is sensitive (requires approval)
      const { rows: roleRows } = await pool.query(
        `SELECT rt.sensitive, r.organisation_id, r.name
         FROM roles r
         JOIN role_templates rt ON rt.id = r.template_id
         WHERE r.id = $1`,
        [roleId]
      );

      if (roleRows.length === 0) {
        return res.status(404).json({ error: 'role_not_found' });
      }

      const role = roleRows[0];

      if (role.sensitive) {
        // Create role request for approval
        const { rows: [request] } = await pool.query(
          `INSERT INTO role_requests(
            role_id, target_user_id, requested_by, required_approvals, reason
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING *`,
          [
            roleId,
            target_user_id,
            req.user?.id,
            2, // Default: 2 approvals for sensitive roles
            reason || 'No reason provided',
          ]
        );

        // Audit log
        await pool.query(
          `INSERT INTO rbac_audit_logs(actor_id, action, target, details)
           VALUES ($1, 'request_role_assignment', $2, $3)`,
          [
            req.user?.id,
            JSON.stringify({ role_request_id: request.id, target_user_id }),
            JSON.stringify(req.body),
          ]
        );

        return res.status(202).json({
          status: 'approval_required',
          message: 'Role assignment request created, pending approval',
          request,
        });
      } else {
        // Direct assignment (non-sensitive role)
        await pool.query(
          `INSERT INTO role_bindings(role_id, user_id, assigned_by, expires_at, context)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (role_id, user_id) DO NOTHING`,
          [roleId, target_user_id, req.user?.id, expires_at || null, context || {}]
        );

        // Invalidate cache for target user
        await invalidateUserPermissions(target_user_id);

        // Audit log
        await pool.query(
          `INSERT INTO rbac_audit_logs(actor_id, action, target, details)
           VALUES ($1, 'assign_role', $2, $3)`,
          [
            req.user?.id,
            JSON.stringify({ role_id: roleId, user_id: target_user_id }),
            JSON.stringify(req.body),
          ]
        );

        res.status(201).json({
          status: 'assigned',
          message: 'Role assigned successfully',
        });
      }
    } catch (err: any) {
      console.error('[RBAC] Error assigning role:', err);
      res.status(500).json({ error: 'assign_failed', message: err.message });
    }
  }
);

/**
 * DELETE /api/rbac/roles/:roleId/bindings/:userId - Revoke role from user
 */
router.delete(
  '/roles/:roleId/bindings/:userId',
  requirePermission('rbac:roles:revoke'),
  async (req: AuthenticatedRequest, res) => {
    const { roleId, userId } = req.params;

    try {
      const { rowCount } = await pool.query(
        `DELETE FROM role_bindings
         WHERE role_id = $1 AND user_id = $2`,
        [roleId, userId]
      );

      if (rowCount === 0) {
        return res.status(404).json({ error: 'binding_not_found' });
      }

      // Invalidate cache
      await invalidateUserPermissions(userId);

      // Audit log
      await pool.query(
        `INSERT INTO rbac_audit_logs(actor_id, action, target, details)
         VALUES ($1, 'revoke_role', $2, $3)`,
        [
          req.user?.id,
          JSON.stringify({ role_id: roleId, user_id: userId }),
          JSON.stringify({ revoked_at: new Date() }),
        ]
      );

      return res.json({ status: 'revoked', message: 'Role revoked successfully' });
    } catch (err: any) {
      console.error('[RBAC] Error revoking role:', err);
      return res.status(500).json({ error: 'revoke_failed', message: err.message });
    }
  }
);

/**
 * GET /api/rbac/users/:userId/roles - Get all roles for a user
 */
router.get(
  '/users/:userId/roles',
  requirePermission('rbac:roles:read'),
  async (req: AuthenticatedRequest, res) => {
    const { userId } = req.params;

    try {
      const { rows } = await pool.query(
        `SELECT
          rb.*,
          r.name AS role_name,
          r.organisation_id,
          o.name AS organisation_name,
          rt.name AS template_name
        FROM role_bindings rb
        JOIN roles r ON r.id = rb.role_id
        LEFT JOIN organisations o ON o.id = r.organisation_id
        LEFT JOIN role_templates rt ON rt.id = r.template_id
        WHERE rb.user_id = $1
          AND (rb.expires_at IS NULL OR rb.expires_at > now())
        ORDER BY rb.assigned_at DESC`,
        [userId]
      );

      return res.json({ roles: rows });
    } catch (err: any) {
      console.error('[RBAC] Error fetching user roles:', err);
      return res.status(500).json({ error: 'fetch_failed', message: err.message });
    }
  }
);

// ========================================================================
// Role Requests (Approval Workflow)
// ========================================================================

/**
 * GET /api/rbac/requests - List pending role requests
 */
router.get(
  '/requests',
  requirePermission('rbac:approvals:manage'),
  async (req: AuthenticatedRequest, res) => {
    const { status } = req.query;

    try {
      const { rows } = await pool.query(
        `SELECT
          rr.*,
          r.name AS role_name,
          rt.sensitive AS role_sensitive,
          o.name AS organisation_name
        FROM role_requests rr
        JOIN roles r ON r.id = rr.role_id
        JOIN role_templates rt ON rt.id = r.template_id
        LEFT JOIN organisations o ON o.id = r.organisation_id
        WHERE ($1::text IS NULL OR rr.status = $1)
        ORDER BY rr.created_at DESC
        LIMIT 100`,
        [status || null]
      );

      return res.json({ requests: rows });
    } catch (err: any) {
      console.error('[RBAC] Error fetching requests:', err);
      return res.status(500).json({ error: 'fetch_failed', message: err.message });
    }
  }
);

/**
 * POST /api/rbac/requests/:requestId/approve - Approve role request
 */
router.post(
  '/requests/:requestId/approve',
  requirePermission('rbac:approvals:manage'),
  async (req: AuthenticatedRequest, res) => {
    const { requestId } = req.params;
    const { note } = req.body;

    try {
      // Get request details
      const { rows: requestRows } = await pool.query(
        `SELECT * FROM role_requests WHERE id = $1`,
        [requestId]
      );

      if (requestRows.length === 0) {
        return res.status(404).json({ error: 'request_not_found' });
      }

      const request = requestRows[0];

      if (request.status !== 'pending') {
        return res.status(400).json({ error: 'request_not_pending' });
      }

      // Add approval
      const approvals = request.approvals || [];
      approvals.push({
        by: req.user?.id,
        at: new Date(),
        note: note || '',
      });

      // Check if we have enough approvals
      const newStatus =
        approvals.length >= request.required_approvals ? 'approved' : 'pending';

      // Update request
      await pool.query(
        `UPDATE role_requests
         SET approvals = $1, status = $2, updated_at = now()
         WHERE id = $3`,
        [JSON.stringify(approvals), newStatus, requestId]
      );

      // If approved, create role binding
      if (newStatus === 'approved') {
        await pool.query(
          `INSERT INTO role_bindings(role_id, user_id, assigned_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (role_id, user_id) DO NOTHING`,
          [request.role_id, request.target_user_id, req.user?.id]
        );

        // Invalidate cache
        await invalidateUserPermissions(request.target_user_id);
      }

      // Audit log
      await pool.query(
        `INSERT INTO rbac_audit_logs(actor_id, action, target, details)
         VALUES ($1, 'approve_role_request', $2, $3)`,
        [
          req.user?.id,
          JSON.stringify({ request_id: requestId, target_user_id: request.target_user_id }),
          JSON.stringify({ approvals, new_status: newStatus }),
        ]
      );

      return res.json({
        status: newStatus,
        message:
          newStatus === 'approved'
            ? 'Role request approved and assigned'
            : 'Approval recorded, more approvals needed',
        approvals_count: approvals.length,
        required_approvals: request.required_approvals,
      });
    } catch (err: any) {
      console.error('[RBAC] Error approving request:', err);
      return res.status(500).json({ error: 'approve_failed', message: err.message });
    }
  }
);

/**
 * POST /api/rbac/requests/:requestId/reject - Reject role request
 */
router.post(
  '/requests/:requestId/reject',
  requirePermission('rbac:approvals:manage'),
  async (req: AuthenticatedRequest, res) => {
    const { requestId } = req.params;
    const { reason } = req.body;

    try {
      await pool.query(
        `UPDATE role_requests
         SET status = 'rejected', updated_at = now()
         WHERE id = $1`,
        [requestId]
      );

      // Audit log
      await pool.query(
        `INSERT INTO rbac_audit_logs(actor_id, action, target, details)
         VALUES ($1, 'reject_role_request', $2, $3)`,
        [req.user?.id, JSON.stringify({ request_id: requestId }), JSON.stringify({ reason })]
      );

      return res.json({ status: 'rejected', message: 'Role request rejected' });
    } catch (err: any) {
      console.error('[RBAC] Error rejecting request:', err);
      return res.status(500).json({ error: 'reject_failed', message: err.message });
    }
  }
);

// ========================================================================
// Direct Grants
// ========================================================================

/**
 * POST /api/rbac/grants - Create direct permission grant
 */
router.post(
  '/grants',
  requirePermission('rbac:grants:create'),
  async (req: AuthenticatedRequest, res) => {
    const { user_id, permission_id, organisation_id, expires_at, reason } = req.body;

    if (!user_id || !permission_id) {
      return res.status(400).json({ error: 'invalid_input' });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO grants(user_id, permission_id, organisation_id, created_by, expires_at, reason)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, permission_id, organisation_id) DO UPDATE
         SET expires_at = EXCLUDED.expires_at, reason = EXCLUDED.reason
         RETURNING *`,
        [user_id, permission_id, organisation_id, req.user?.id, expires_at, reason]
      );

      // Invalidate cache
      await invalidateUserPermissions(user_id);

      // Audit log
      await pool.query(
        `INSERT INTO rbac_audit_logs(actor_id, action, target, details)
         VALUES ($1, 'create_grant', $2, $3)`,
        [req.user?.id, JSON.stringify({ grant_id: rows[0].id, user_id }), JSON.stringify(req.body)]
      );

      return res.status(201).json({ grant: rows[0] });
    } catch (err: any) {
      console.error('[RBAC] Error creating grant:', err);
      return res.status(500).json({ error: 'create_failed', message: err.message });
    }
  }
);

// ========================================================================
// Permissions Catalog
// ========================================================================

/**
 * GET /api/rbac/permissions - List all permissions
 */
router.get('/permissions', async (_req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM permissions ORDER BY resource_kind, code`
    );
    return res.json({ permissions: rows });
  } catch (err: any) {
    console.error('[RBAC] Error fetching permissions:', err);
    return res.status(500).json({ error: 'fetch_failed', message: err.message });
  }
});

// ========================================================================
// Audit Logs
// ========================================================================

/**
 * GET /api/rbac/audit - Get audit logs
 */
router.get(
  '/audit',
  requireAnyPermission(['rbac:roles:read', 'connect_auditor']),
  async (req: AuthenticatedRequest, res) => {
    const { limit = 100, offset = 0, action } = req.query;

    try {
      const { rows } = await pool.query(
        `SELECT * FROM rbac_audit_logs
         WHERE ($1::text IS NULL OR action = $1)
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [action || null, Number(limit), Number(offset)]
      );

      return res.json({ logs: rows });
    } catch (err: any) {
      console.error('[RBAC] Error fetching audit logs:', err);
      return res.status(500).json({ error: 'fetch_failed', message: err.message });
    }
  }
);

export default router;