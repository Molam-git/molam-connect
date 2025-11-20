# Brique 118 + B118bis: Run All Tests Script (Windows)
# Lance tous les tests E2E et de sécurité

param(
    [switch]$E2EOnly,
    [switch]$SecurityOnly,
    [switch]$Docker,
    [switch]$NoCleanup,
    [switch]$Help
)

# Show help
if ($Help) {
    Write-Host @"
Usage: .\run-all-tests.ps1 [OPTIONS]

Options:
  -E2EOnly        Run only E2E tests
  -SecurityOnly   Run only security tests
  -Docker         Run tests in Docker
  -NoCleanup      Skip cleanup after tests
  -Help           Show this help

Examples:
  .\run-all-tests.ps1                    # Run all tests
  .\run-all-tests.ps1 -E2EOnly           # Run only E2E tests
  .\run-all-tests.ps1 -SecurityOnly      # Run only security tests
  .\run-all-tests.ps1 -Docker            # Run in Docker
"@
    exit 0
}

Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Brique 118 + B118bis - Complete Test Suite Runner       ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Configuration
$MOCK_SANDBOX_PORT = 4001
$PLAYGROUND_PORT = 8082
$DB_HOST = if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }
$DB_PORT = if ($env:DB_PORT) { $env:DB_PORT } else { "5432" }
$DB_NAME = if ($env:DB_NAME) { $env:DB_NAME } else { "molam_connect_test" }
$DB_USER = if ($env:DB_USER) { $env:DB_USER } else { "postgres" }

# Test counters
$TOTAL_TESTS = 0
$PASSED_TESTS = 0
$FAILED_TESTS = 0

# Function to print section header
function Print-Section {
    param([string]$Title)

    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Blue
    Write-Host "  $Title" -ForegroundColor Blue
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Blue
    Write-Host ""
}

# Function to wait for service
function Wait-ForService {
    param(
        [string]$Url,
        [string]$Name,
        [int]$MaxWait = 30
    )

    Write-Host "⏳ Waiting for $Name..." -ForegroundColor Yellow

    $waited = 0
    while ($waited -lt $MaxWait) {
        try {
            $response = Invoke-WebRequest -Uri $Url -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                Write-Host "✅ $Name is ready" -ForegroundColor Green
                return $true
            }
        } catch {
            Start-Sleep -Seconds 1
            $waited++
        }
    }

    Write-Host "❌ $Name failed to start within ${MaxWait}s" -ForegroundColor Red
    return $false
}

# Function to run tests
function Run-TestSuite {
    param(
        [string]$Name,
        [scriptblock]$Command
    )

    Write-Host "▶ Running: $Name" -ForegroundColor Yellow

    try {
        & $Command
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ $Name PASSED" -ForegroundColor Green
            $script:PASSED_TESTS++
            return $true
        } else {
            throw "Exit code: $LASTEXITCODE"
        }
    } catch {
        Write-Host "❌ $Name FAILED" -ForegroundColor Red
        Write-Host "  Error: $_" -ForegroundColor Red
        $script:FAILED_TESTS++
        return $false
    }
}

# Parse flags
$RUN_E2E = -not $SecurityOnly
$RUN_SECURITY = -not $E2EOnly
$RUN_DOCKER = $Docker
$CLEANUP_AFTER = -not $NoCleanup

# Docker mode
if ($RUN_DOCKER) {
    Print-Section "Running Tests in Docker"

    Set-Location docker
    Write-Host "🐳 Starting Docker Compose..." -ForegroundColor Yellow

    docker-compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from cypress

    Write-Host "✅ Docker tests completed" -ForegroundColor Green

    if ($CLEANUP_AFTER) {
        Write-Host "🧹 Cleaning up Docker containers..." -ForegroundColor Yellow
        docker-compose -f docker-compose.test.yml down -v
    }

    exit 0
}

# Non-Docker mode
Print-Section "Pre-Flight Checks"

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed" -ForegroundColor Red
    exit 1
}

# Check npm
try {
    $npmVersion = npm --version
    Write-Host "✅ npm $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ npm is not installed" -ForegroundColor Red
    exit 1
}

# Check psql
try {
    psql --version | Out-Null
    Write-Host "✅ PostgreSQL client installed" -ForegroundColor Green
} catch {
    Write-Host "⚠️  psql not found (tests may fail)" -ForegroundColor Yellow
}

# Database setup
Print-Section "Database Setup"

Write-Host "📊 Running migrations..." -ForegroundColor Yellow
$env:PGPASSWORD = if ($env:PGPASSWORD) { $env:PGPASSWORD } else { "testpass123" }

Get-ChildItem -Path "..\brique-117\migrations\*.sql" | ForEach-Object {
    Write-Host "  → $($_.Name)"
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f $_.FullName 2>&1 | Out-Null
}

Write-Host "✅ Migrations completed" -ForegroundColor Green

Write-Host "🌱 Seeding test data..." -ForegroundColor Yellow
bash test-scripts/seed_test_db.sh 2>&1 | Out-Null
Write-Host "✅ Test data seeded" -ForegroundColor Green

# Start services
Print-Section "Starting Services"

Write-Host "🚀 Starting Mock Sandbox..." -ForegroundColor Yellow
Set-Location mock-sandbox
$mockProcess = Start-Process -FilePath "npm" -ArgumentList "start" -PassThru -NoNewWindow -RedirectStandardOutput "..\mock-sandbox.log" -RedirectStandardError "..\mock-sandbox-error.log"
Set-Location ..

Start-Sleep -Seconds 2
$serviceReady = Wait-ForService -Url "http://localhost:$MOCK_SANDBOX_PORT/healthz" -Name "Mock Sandbox"

if (-not $serviceReady) {
    Write-Host "❌ Failed to start Mock Sandbox" -ForegroundColor Red
    Stop-Process -Id $mockProcess.Id -Force -ErrorAction SilentlyContinue
    exit 1
}

# E2E Tests
if ($RUN_E2E) {
    Print-Section "E2E Tests (Cypress & Jest)"

    # Unit tests
    $TOTAL_TESTS++
    Run-TestSuite -Name "Jest Unit Tests" -Command {
        Set-Location tests\jest
        npm test -- sandbox.test.ts --silent
        Set-Location ..\..
    }

    # Cypress tests
    $TOTAL_TESTS++
    Run-TestSuite -Name "Cypress E2E Tests" -Command {
        npx cypress run --headless
    }
}

# Security Tests
if ($RUN_SECURITY) {
    Print-Section "Security Tests (Hardened)"

    Set-Location tests\jest

    # RBAC tests
    $TOTAL_TESTS++
    Run-TestSuite -Name "RBAC Tests" -Command {
        npm run test:rbac -- --silent
    }

    # Share expiry tests
    $TOTAL_TESTS++
    Run-TestSuite -Name "Share Expiry Tests" -Command {
        npm run test:share-expiry -- --silent
    }

    # Fuzzing tests
    $TOTAL_TESTS++
    Run-TestSuite -Name "Fuzzing & Injection Tests" -Command {
        npm run test:fuzzing -- --silent
    }

    # Rate limiting tests
    $TOTAL_TESTS++
    Run-TestSuite -Name "Rate Limiting Tests" -Command {
        npm run test:rate-limit -- --silent
    }

    Set-Location ..\..
}

# Cleanup
Print-Section "Cleanup"

Write-Host "🛑 Stopping services..." -ForegroundColor Yellow
Stop-Process -Id $mockProcess.Id -Force -ErrorAction SilentlyContinue
Write-Host "✅ Services stopped" -ForegroundColor Green

if ($CLEANUP_AFTER) {
    Write-Host "🧹 Cleaning up test data..." -ForegroundColor Yellow
    bash test-scripts/cleanup_test_db.sh 2>&1 | Out-Null
    Write-Host "✅ Cleanup completed" -ForegroundColor Green
}

# Summary
Print-Section "Test Summary"

Write-Host "Total test suites: $TOTAL_TESTS"
Write-Host "Passed: $PASSED_TESTS" -ForegroundColor Green
Write-Host "Failed: $FAILED_TESTS" -ForegroundColor Red
Write-Host ""

if ($FAILED_TESTS -eq 0) {
    Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║  ✅ All tests passed! Production ready! 🚀                ║" -ForegroundColor Green
    Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Green
    exit 0
} else {
    Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Red
    Write-Host "║  ❌ Some tests failed. Please review logs above.          ║" -ForegroundColor Red
    Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Red
    exit 1
}
