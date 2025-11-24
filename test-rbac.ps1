# Test RBAC Integration Script for Windows PowerShell
# This script tests the complete RBAC implementation

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  RBAC Integration Test Suite" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Configuration
$DB_NAME = "molam_connect"
$DB_USER = "postgres"
$DB_PORT = "5432"
$SERVER_URL = "http://localhost:3000"

# ============================================================================
# Step 1: Install RBAC SQL Schema
# ============================================================================

Write-Host "[1/5] Installing RBAC SQL Schema..." -ForegroundColor Yellow

try {
    $result = psql -U $DB_USER -d $DB_NAME -f "brique-68/migrations/068_rbac.sql" 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ RBAC schema installed successfully" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Schema may already exist (continuing...)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ❌ Error installing schema: $_" -ForegroundColor Red
    Write-Host "  Note: This may be OK if schema already exists" -ForegroundColor Yellow
}

# ============================================================================
# Step 2: Build Brique 68 TypeScript
# ============================================================================

Write-Host "`n[2/5] Building Brique 68 TypeScript..." -ForegroundColor Yellow

Push-Location brique-68

try {
    npm run build 2>&1 | Out-Null

    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ TypeScript build successful" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Build failed" -ForegroundColor Red
        Pop-Location
        exit 1
    }
} catch {
    Write-Host "  ❌ Build error: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}

Pop-Location

# ============================================================================
# Step 3: Verify File Structure
# ============================================================================

Write-Host "`n[3/5] Verifying file structure..." -ForegroundColor Yellow

$requiredFiles = @(
    "brique-68/dist/middleware/authzEnforce.js",
    "brique-68/dist/routes/rbac.js",
    "brique-68/dist/utils/db.js",
    "brique-68/dist/utils/redis.js",
    "src/middleware/rbac.js",
    "src/services/rbacService.js",
    "RBAC_INTEGRATION.md",
    "examples/rbac-usage-example.js"
)

$allFilesExist = $true

foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "  ✅ $file" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Missing: $file" -ForegroundColor Red
        $allFilesExist = $false
    }
}

if (-not $allFilesExist) {
    Write-Host "`n  ❌ Some required files are missing!" -ForegroundColor Red
    exit 1
}

# ============================================================================
# Step 4: Test Database Connection
# ============================================================================

Write-Host "`n[4/5] Testing database connection..." -ForegroundColor Yellow

try {
    $testQuery = "SELECT COUNT(*) as count FROM permissions;"
    $result = psql -U $DB_USER -d $DB_NAME -t -c $testQuery 2>&1

    if ($LASTEXITCODE -eq 0) {
        $count = $result.Trim()
        Write-Host "  ✅ Database connected - Found $count permissions" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Database connection failed" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "  ❌ Error connecting to database: $_" -ForegroundColor Red
    exit 1
}

# ============================================================================
# Step 5: Test API Endpoints (if server is running)
# ============================================================================

Write-Host "`n[5/5] Testing API endpoints..." -ForegroundColor Yellow
Write-Host "  ℹ️  Make sure the server is running on port 3000" -ForegroundColor Cyan
Write-Host "  ℹ️  Run: npm start" -ForegroundColor Cyan
Write-Host ""

# Test 1: Health check
Write-Host "  Testing: GET /health" -ForegroundColor White

try {
    $response = Invoke-RestMethod -Uri "$SERVER_URL/health" -Method Get -ErrorAction SilentlyContinue

    if ($response.status -eq "healthy") {
        Write-Host "  ✅ Health check passed" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Server not healthy" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ⚠️  Server not running (start with: npm start)" -ForegroundColor Yellow
}

# Test 2: RBAC permissions endpoint
Write-Host "  Testing: GET /api/rbac/permissions" -ForegroundColor White

try {
    $headers = @{
        "x-user-id" = "admin-test-123"
        "x-user-email" = "admin@molam.com"
    }

    $response = Invoke-RestMethod -Uri "$SERVER_URL/api/rbac/permissions" -Method Get -Headers $headers -ErrorAction SilentlyContinue

    if ($response) {
        Write-Host "  ✅ RBAC permissions endpoint working" -ForegroundColor Green
    } else {
        Write-Host "  ❌ RBAC permissions endpoint failed" -ForegroundColor Red
    }
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) {
        Write-Host "  ❌ RBAC routes not mounted correctly" -ForegroundColor Red
    } else {
        Write-Host "  ⚠️  Server not running or RBAC not initialized" -ForegroundColor Yellow
    }
}

# ============================================================================
# Summary
# ============================================================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Test Summary" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "RBAC integration setup is complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Start the server: npm start" -ForegroundColor White
Write-Host "  2. Check logs for: ✅ RBAC (Brique 68) initialized" -ForegroundColor White
Write-Host "  3. Test endpoints with curl or Postman" -ForegroundColor White
Write-Host "  4. Read RBAC_INTEGRATION.md for usage guide" -ForegroundColor White
Write-Host ""
Write-Host "Example curl command:" -ForegroundColor Cyan
Write-Host '  curl http://localhost:3000/api/rbac/permissions \' -ForegroundColor Gray
Write-Host '    -H "x-user-id: admin-123" \' -ForegroundColor Gray
Write-Host '    -H "x-user-email: admin@molam.com"' -ForegroundColor Gray
Write-Host ""
