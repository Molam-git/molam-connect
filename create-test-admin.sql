-- Create test admin user with full RBAC permissions
-- Run this with: psql -U postgres -d molam_connect -f create-test-admin.sql

-- 1. Create test organisation (if not exists)
INSERT INTO organisations (id, name, slug, owner_id, metadata)
VALUES (
  'org-test-123',
  'Test Organisation',
  'test-org',
  'test-123',
  '{"created_for": "testing"}'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- 2. Get all RBAC permission IDs
DO $$
DECLARE
  admin_role_id UUID;
  perm_ids UUID[];
BEGIN
  -- Get all RBAC permission IDs
  SELECT array_agg(id) INTO perm_ids
  FROM permissions
  WHERE code LIKE 'rbac:%';

  -- Create admin role template (if not exists)
  INSERT INTO role_templates (id, name, description, permissions, sensitive)
  VALUES (
    'tmpl-test-admin',
    'Test Super Admin',
    'Full RBAC permissions for testing',
    perm_ids,
    false
  ) ON CONFLICT (id) DO UPDATE SET permissions = perm_ids;

  -- Create role instance for test organisation
  INSERT INTO roles (id, organisation_id, name, description, permissions, template_id, sensitive)
  VALUES (
    'role-test-admin',
    'org-test-123',
    'Test Super Admin',
    'Full RBAC permissions for testing',
    perm_ids,
    'tmpl-test-admin',
    false
  ) ON CONFLICT (id) DO UPDATE SET permissions = perm_ids;

  -- Assign role to test user
  INSERT INTO role_assignments (role_id, user_id, assigned_by, organisation_id)
  VALUES (
    'role-test-admin',
    'test-123',
    'system',
    'org-test-123'
  ) ON CONFLICT (role_id, user_id, organisation_id) DO NOTHING;

END $$;

-- 3. Verify the setup
SELECT
  'Test Admin Created' AS status,
  (SELECT COUNT(*) FROM permissions WHERE code LIKE 'rbac:%') AS rbac_permissions,
  (SELECT COUNT(*) FROM role_assignments WHERE user_id = 'test-123') AS user_roles;
