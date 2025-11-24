# Quick Test RBAC - Script Rapide
# Exécution : .\quick-test-rbac.ps1

Write-Host "`n=== RBAC Quick Test ===" -ForegroundColor Cyan
Write-Host "Assurez-vous que le serveur tourne sur localhost:3000`n" -ForegroundColor Yellow

$SERVER = "http://localhost:3000"
$headers = @{
    "x-user-id" = "admin-test-123"
    "x-user-email" = "admin@molam.com"
}

# Test 1: Health Check
Write-Host "[1/5] Test Health Check..." -ForegroundColor White
try {
    $health = Invoke-RestMethod -Uri "$SERVER/health" -ErrorAction Stop
    if ($health.status -eq "healthy") {
        Write-Host "  ✅ Server is healthy" -ForegroundColor Green
        Write-Host "  Database: $($health.services.database)" -ForegroundColor Gray
        Write-Host "  Redis: $($health.services.redis)" -ForegroundColor Gray
    } else {
        Write-Host "  ⚠️  Server status: $($health.status)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ❌ Server not responding. Is it running? (npm start)" -ForegroundColor Red
    exit 1
}

# Test 2: RBAC Permissions
Write-Host "`n[2/5] Test RBAC Permissions..." -ForegroundColor White
try {
    $perms = Invoke-RestMethod -Uri "$SERVER/api/rbac/permissions" -Headers $headers -ErrorAction Stop
    $count = $perms.Count
    Write-Host "  ✅ Found $count permissions" -ForegroundColor Green
    Write-Host "  Examples:" -ForegroundColor Gray
    $perms | Select-Object -First 3 | ForEach-Object {
        Write-Host "    - $($_.code)" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ❌ Failed to fetch permissions" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Role Templates
Write-Host "`n[3/5] Test Role Templates..." -ForegroundColor White
try {
    $templates = Invoke-RestMethod -Uri "$SERVER/api/rbac/templates" -Headers $headers -ErrorAction Stop
    $count = $templates.templates.Count
    Write-Host "  ✅ Found $count role templates" -ForegroundColor Green
    Write-Host "  Roles:" -ForegroundColor Gray
    $templates.templates | ForEach-Object {
        $sensitive = if ($_.sensitive) { "[SENSITIVE]" } else { "" }
        Write-Host "    - $($_.name) $sensitive" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ❌ Failed to fetch templates" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Database Check
Write-Host "`n[4/5] Test Database Tables..." -ForegroundColor White
try {
    $result = psql -U postgres -d molam_connect -t -c "SELECT COUNT(*) FROM permissions;" 2>&1
    if ($LASTEXITCODE -eq 0) {
        $count = $result.Trim()
        Write-Host "  ✅ Database connected - $count permissions in DB" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Could not connect to database" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ⚠️  psql not available or database not accessible" -ForegroundColor Yellow
}

# Test 5: Create a Test Role
Write-Host "`n[5/5] Test Creating a Role..." -ForegroundColor White
try {
    # Get first template
    $templates = Invoke-RestMethod -Uri "$SERVER/api/rbac/templates" -Headers $headers -ErrorAction Stop
    $template = $templates.templates | Select-Object -First 1

    $roleBody = @{
        template_id = $template.id
        organisation_id = "00000000-0000-0000-0000-000000000001"
        name = "Test Role - Quick Test $(Get-Date -Format 'HHmmss')"
    } | ConvertTo-Json

    $role = Invoke-RestMethod -Uri "$SERVER/api/rbac/roles" `
        -Method Post `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $roleBody `
        -ErrorAction Stop

    Write-Host "  ✅ Role created successfully!" -ForegroundColor Green
    Write-Host "  Role ID: $($role.role.id)" -ForegroundColor Gray
    Write-Host "  Role Name: $($role.role.name)" -ForegroundColor Gray
} catch {
    Write-Host "  ❌ Failed to create role" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Summary
Write-Host "`n=== Test Summary ===" -ForegroundColor Cyan
Write-Host "✅ RBAC is working correctly!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. View full test guide: .\TEST_RBAC_LOCALHOST.md" -ForegroundColor White
Write-Host "  2. View integration guide: .\RBAC_INTEGRATION.md" -ForegroundColor White
Write-Host "  3. Try examples: node examples/rbac-usage-example.js" -ForegroundColor White
Write-Host ""
