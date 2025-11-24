# Grant RBAC permissions to test user
Write-Host "Granting RBAC permissions to test-123..." -ForegroundColor Yellow

$env:PGPASSWORD = "postgres"
psql -U postgres -d molam_connect -f "grant-test-permissions.sql"

Write-Host "`n✅ Permissions granted!" -ForegroundColor Green
Write-Host "You can now test with: curl -H 'x-user-id: test-123' http://localhost:3000/api/rbac/templates" -ForegroundColor White
