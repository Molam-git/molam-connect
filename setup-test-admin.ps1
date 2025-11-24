# Setup Test Admin for RBAC Testing
Write-Host "`n=== Setup Test Admin ===" -ForegroundColor Cyan

# Step 1: Create organisation in database
Write-Host "`n[1/4] Creating test organisation..." -ForegroundColor Yellow
$createOrg = @"
INSERT INTO organisations (id, name, slug, owner_id, metadata)
VALUES (
  'org-test-123',
  'Test Organisation',
  'test-org',
  'test-123',
  '{"created_for": "testing"}'::jsonb
) ON CONFLICT (id) DO NOTHING;
"@

psql -U postgres -d molam_connect -c $createOrg 2>&1 | Out-Null
Write-Host "  ✅ Organisation created" -ForegroundColor Green

# Step 2: Get all RBAC permission IDs and create admin role
Write-Host "`n[2/4] Creating admin role..." -ForegroundColor Yellow
$createRole = @"
DO `$`$
DECLARE
  admin_role_id UUID := 'role-test-admin';
  perm_ids UUID[];
BEGIN
  -- Get all RBAC permission IDs
  SELECT array_agg(id) INTO perm_ids
  FROM permissions
  WHERE code LIKE 'rbac:%';

  -- Create role
  INSERT INTO roles (id, organisation_id, name, description, permissions, sensitive)
  VALUES (
    admin_role_id,
    'org-test-123',
    'Test Super Admin',
    'Full RBAC permissions for testing',
    perm_ids,
    false
  ) ON CONFLICT (id) DO UPDATE SET permissions = EXCLUDED.permissions;

  RAISE NOTICE 'Admin role created with % permissions', array_length(perm_ids, 1);
END `$`$;
"@

$roleResult = psql -U postgres -d molam_connect -c $createRole 2>&1
Write-Host "  ✅ Admin role created" -ForegroundColor Green

# Step 3: Assign role to test user
Write-Host "`n[3/4] Assigning role to test user..." -ForegroundColor Yellow
$assignRole = @"
INSERT INTO role_assignments (role_id, user_id, assigned_by, organisation_id)
VALUES (
  'role-test-admin',
  'test-123',
  'system',
  'org-test-123'
) ON CONFLICT (role_id, user_id, organisation_id) DO NOTHING;
"@

psql -U postgres -d molam_connect -c $assignRole 2>&1 | Out-Null
Write-Host "  ✅ Role assigned to user test-123" -ForegroundColor Green

# Step 4: Verify setup
Write-Host "`n[4/4] Verifying setup..." -ForegroundColor Yellow
$verify = @"
SELECT
  (SELECT COUNT(*) FROM permissions WHERE code LIKE 'rbac:%') AS rbac_permissions,
  (SELECT COUNT(*) FROM roles WHERE id = 'role-test-admin') AS admin_role_exists,
  (SELECT COUNT(*) FROM role_assignments WHERE user_id = 'test-123') AS user_roles;
"@

$result = psql -U postgres -d molam_connect -t -c $verify

Write-Host "  $result" -ForegroundColor Gray
Write-Host "  ✅ Setup complete!" -ForegroundColor Green

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "User ID: test-123" -ForegroundColor White
Write-Host "Organisation: org-test-123" -ForegroundColor White
Write-Host "Role: Test Super Admin (all RBAC permissions)" -ForegroundColor White
Write-Host "`nYou can now run tests with header: -H 'x-user-id: test-123'" -ForegroundColor Yellow
Write-Host ""
