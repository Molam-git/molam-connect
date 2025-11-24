-- Grant all RBAC permissions to test user
-- This allows the test user to access all RBAC endpoints
-- Using a proper UUID for the test user

INSERT INTO grants (user_id, permission_id, created_by, reason)
SELECT
  '00000000-0000-0000-0000-000000000123'::uuid,
  p.id,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'Test user permissions'
FROM permissions p
WHERE p.code LIKE 'rbac:%'
ON CONFLICT (user_id, permission_id, organisation_id) DO NOTHING;

-- Verify
SELECT COUNT(*) as granted_permissions
FROM grants
WHERE user_id = '00000000-0000-0000-0000-000000000123';
