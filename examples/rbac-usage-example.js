/**
 * RBAC Usage Example for Molam Connect
 *
 * This example demonstrates how to use RBAC in your application
 */

const { Pool } = require('pg');
const RBACService = require('../src/services/rbacService');
const { requirePermission, requireAnyPermission } = require('../src/middleware/rbac');
const express = require('express');

// ============================================================================
// Setup
// ============================================================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/molam_connect',
});

const rbacService = new RBACService(pool);
const app = express();

app.use(express.json());

// ============================================================================
// Example 1: Protecting Endpoints with Middleware
// ============================================================================

// Mock authentication middleware (replace with real JWT auth)
app.use((req, res, next) => {
  // In production, extract user from JWT token
  req.user = {
    id: req.headers['x-user-id'] || 'demo-user-123',
    email: req.headers['x-user-email'] || 'demo@molam.com',
  };
  next();
});

// Protected endpoint: Single permission
app.get('/api/payments',
  requirePermission('connect:payments:read'),
  async (req, res) => {
    res.json({
      message: 'You have access to view payments',
      user: req.user,
    });
  }
);

// Protected endpoint: Multiple permissions (OR logic)
app.get('/api/reports',
  requireAnyPermission([
    'analytics:read',
    'analytics:export'
  ]),
  async (req, res) => {
    res.json({
      message: 'You have access to reports',
      user: req.user,
    });
  }
);

// ============================================================================
// Example 2: Programmatic Permission Checks
// ============================================================================

app.post('/api/process-refund', async (req, res) => {
  const { amount, paymentId } = req.body;
  const userId = req.user.id;

  try {
    // Check if user has refund permission
    const canRefund = await rbacService.userHasPermission(
      userId,
      'connect:payments:refund'
    );

    if (!canRefund) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'You do not have permission to process refunds',
      });
    }

    // Additional business logic for high-value refunds
    if (amount > 100000) {
      const canRefundHighValue = await rbacService.userHasPermission(
        userId,
        'connect:payments:refund:high_value'
      );

      if (!canRefundHighValue) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'High-value refunds require additional permissions',
        });
      }
    }

    // Process refund
    res.json({
      success: true,
      message: `Refund processed for payment ${paymentId}`,
      amount,
    });
  } catch (error) {
    console.error('Refund processing error:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

// ============================================================================
// Example 3: Role Management
// ============================================================================

app.post('/api/admin/assign-role', async (req, res) => {
  const { roleId, targetUserId, expiresAt, reason } = req.body;
  const adminUserId = req.user.id;

  try {
    // Check if admin has permission to assign roles
    const canAssign = await rbacService.userHasPermission(
      adminUserId,
      'rbac:roles:assign'
    );

    if (!canAssign) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'You do not have permission to assign roles',
      });
    }

    // Assign role
    const result = await rbacService.assignRole(
      roleId,
      targetUserId,
      adminUserId,
      {
        expires_at: expiresAt,
        reason: reason || 'Role assignment via API',
      }
    );

    res.json(result);
  } catch (error) {
    console.error('Role assignment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Example 4: Getting User's Roles and Permissions
// ============================================================================

app.get('/api/my-profile', async (req, res) => {
  const userId = req.user.id;

  try {
    // Get user's roles
    const roles = await rbacService.getUserRoles(userId);

    // Get user's permissions
    const permissions = await rbacService.getUserPermissions(userId);

    res.json({
      user: req.user,
      roles: roles.map(role => ({
        id: role.role_id,
        name: role.role_name,
        organisation_id: role.organisation_id,
        template: role.template_name,
        is_sensitive: role.sensitive,
        expires_at: role.expires_at,
      })),
      permissions: Array.from(permissions),
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Example 5: Direct Permission Grants
// ============================================================================

app.post('/api/admin/grant-permission', async (req, res) => {
  const { userId, permissionId, organisationId, expiresAt, reason } = req.body;
  const adminUserId = req.user.id;

  try {
    // Check if admin has permission to grant permissions
    const canGrant = await rbacService.userHasPermission(
      adminUserId,
      'rbac:grants:create'
    );

    if (!canGrant) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'You do not have permission to grant permissions',
      });
    }

    // Grant permission
    await rbacService.grantPermission(
      userId,
      permissionId,
      adminUserId,
      {
        organisation_id: organisationId,
        expires_at: expiresAt,
        reason: reason || 'Direct grant via API',
      }
    );

    res.json({
      success: true,
      message: 'Permission granted successfully',
    });
  } catch (error) {
    console.error('Permission grant error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Example 6: Revoking Roles
// ============================================================================

app.delete('/api/admin/revoke-role/:roleId/user/:userId', async (req, res) => {
  const { roleId, userId } = req.params;
  const adminUserId = req.user.id;

  try {
    // Check if admin has permission to revoke roles
    const canRevoke = await rbacService.userHasPermission(
      adminUserId,
      'rbac:roles:revoke'
    );

    if (!canRevoke) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'You do not have permission to revoke roles',
      });
    }

    // Revoke role
    await rbacService.revokeRole(roleId, userId, adminUserId);

    res.json({
      success: true,
      message: 'Role revoked successfully',
    });
  } catch (error) {
    console.error('Role revocation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Standalone Usage Examples (for scripts, workers, etc.)
// ============================================================================

async function standaloneExample() {
  const userId = 'demo-user-123';

  console.log('\n=== Standalone RBAC Examples ===\n');

  // Example 1: Check if user has permission
  const canRead = await rbacService.userHasPermission(
    userId,
    'connect:payments:read'
  );
  console.log(`Can read payments: ${canRead}`);

  // Example 2: Get all user permissions
  const permissions = await rbacService.getUserPermissions(userId);
  console.log(`\nUser permissions (${permissions.size}):`);
  console.log(Array.from(permissions).join(', '));

  // Example 3: Get all user roles
  const roles = await rbacService.getUserRoles(userId);
  console.log(`\nUser roles (${roles.length}):`);
  roles.forEach(role => {
    console.log(`  - ${role.role_name} (${role.template_name})`);
  });
}

// ============================================================================
// Start Server (for demonstration)
// ============================================================================

if (require.main === module) {
  const PORT = 4000;

  app.listen(PORT, async () => {
    console.log(`\n🚀 RBAC Example Server running on port ${PORT}\n`);
    console.log('Example endpoints:');
    console.log(`  - GET  http://localhost:${PORT}/api/payments`);
    console.log(`  - GET  http://localhost:${PORT}/api/reports`);
    console.log(`  - POST http://localhost:${PORT}/api/process-refund`);
    console.log(`  - POST http://localhost:${PORT}/api/admin/assign-role`);
    console.log(`  - GET  http://localhost:${PORT}/api/my-profile`);
    console.log(`  - POST http://localhost:${PORT}/api/admin/grant-permission`);
    console.log(`  - DELETE http://localhost:${PORT}/api/admin/revoke-role/:roleId/user/:userId`);
    console.log('\nUse headers: -H "x-user-id: your-user-id" -H "x-user-email: your@email.com"');

    // Run standalone examples
    try {
      await standaloneExample();
    } catch (error) {
      console.error('Standalone example error:', error);
    }
  });
}

module.exports = app;
