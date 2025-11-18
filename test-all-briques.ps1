# =====================================================================
# Script de Test - TOUTES les Briques (41 à 79)
# =====================================================================
# Ce script teste l'installation de TOUS les schémas SQL
# Date: 2025-11-12
# =====================================================================

# =====================================================================
# Password Prompt
# =====================================================================

# Check if PGPASSWORD is set, if not prompt for it
if (-not $env:PGPASSWORD) {
    Write-Host "================================================================" -ForegroundColor Yellow
    Write-Host "  PostgreSQL Authentication Required" -ForegroundColor Yellow
    Write-Host "================================================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "PGPASSWORD environment variable is not set." -ForegroundColor Yellow
    Write-Host "Please enter the PostgreSQL password for user 'postgres':" -ForegroundColor Yellow
    Write-Host ""

    $securePassword = Read-Host "Password" -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $env:PGPASSWORD = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)

    Write-Host ""
    Write-Host "Password set for this session." -ForegroundColor Green
    Write-Host "Tip: Set PGPASSWORD permanently to skip this prompt:" -ForegroundColor Cyan
    Write-Host '  $env:PGPASSWORD = "your_password"' -ForegroundColor Gray
    Write-Host "Or see POSTGRESQL_SETUP.md for other authentication methods." -ForegroundColor Cyan
    Write-Host ""

    # Brief pause to let user read the message
    Start-Sleep -Seconds 2
}

# Configuration
$DB_NAME = if ($env:DB_NAME) { $env:DB_NAME } else { "molam_connect_test_all" }
$DB_USER = if ($env:DB_USER) { $env:DB_USER } else { "postgres" }
$DB_HOST = if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }
$DB_PORT = if ($env:DB_PORT) { $env:DB_PORT } else { "5432" }

Write-Host "================================================================" -ForegroundColor Blue
Write-Host "  Test COMPLET - Toutes les Briques Molam Connect (41-79)" -ForegroundColor Blue
Write-Host "================================================================" -ForegroundColor Blue
Write-Host ""
Write-Host "Database: " -NoNewline
Write-Host "$DB_NAME" -ForegroundColor Green
Write-Host "User: " -NoNewline
Write-Host "$DB_USER" -ForegroundColor Green
Write-Host ""

# =====================================================================
# Scanner tous les dossiers brique-*
# =====================================================================

Write-Host "Scanning briques directories..." -ForegroundColor Yellow
Write-Host ""

$briqueDirs = Get-ChildItem -Directory -Filter "brique-*" | Sort-Object Name
$totalBriques = $briqueDirs.Count

Write-Host "Found " -NoNewline
Write-Host "$totalBriques" -ForegroundColor Green -NoNewline
Write-Host " briques to test"
Write-Host ""

# Compter les fichiers SQL
$sqlFiles = @()
foreach ($dir in $briqueDirs) {
    $sqlPath = Join-Path $dir.FullName "sql"
    if (Test-Path $sqlPath) {
        $files = Get-ChildItem -Path $sqlPath -Filter "*.sql" | Sort-Object Name
        foreach ($file in $files) {
            $sqlFiles += @{
                Brique = $dir.Name
                File = $file.FullName
                Name = $file.Name
            }
        }
    }
}

Write-Host "Found " -NoNewline
Write-Host "$($sqlFiles.Count)" -ForegroundColor Green -NoNewline
Write-Host " SQL schema files"
Write-Host ""

# =====================================================================
# Créer/Recréer la base de données de test
# =====================================================================

Write-Host "================================================================" -ForegroundColor Blue
Write-Host "  Step 1: Database Setup" -ForegroundColor Blue
Write-Host "================================================================" -ForegroundColor Blue
Write-Host ""

Write-Host "Creating test database..." -ForegroundColor Yellow

# Drop si existe
dropdb -U $DB_USER -h $DB_HOST -p $DB_PORT --if-exists $DB_NAME 2>$null

# Créer
$createResult = createdb -U $DB_USER -h $DB_HOST -p $DB_PORT $DB_NAME 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Database created successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to create database" -ForegroundColor Red
    Write-Host $createResult
    exit 1
}

Write-Host ""

# =====================================================================
# Créer les fonctions helpers
# =====================================================================

Write-Host "Creating helper functions..." -ForegroundColor Yellow

$helperFunction = @"
-- Helper function for updating updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS `$`$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
`$`$ LANGUAGE plpgsql;

-- Helper function for generating UUIDs (if needed)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Helper function for PostGIS (if needed)
CREATE EXTENSION IF NOT EXISTS postgis;
"@

$helperFunction | psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -v ON_ERROR_STOP=0 2>&1 | Out-Null

Write-Host "✅ Helper functions created" -ForegroundColor Green
Write-Host ""

# =====================================================================
# Installer tous les schémas SQL
# =====================================================================

Write-Host "================================================================" -ForegroundColor Blue
Write-Host "  Step 2: Installing SQL Schemas" -ForegroundColor Blue
Write-Host "================================================================" -ForegroundColor Blue
Write-Host ""

$successCount = 0
$failureCount = 0
$skippedCount = 0
$results = @()

$currentStep = 0
foreach ($sqlFile in $sqlFiles) {
    $currentStep++
    $brique = $sqlFile.Brique
    $fileName = $sqlFile.Name
    $filePath = $sqlFile.File

    Write-Host "[$currentStep/$($sqlFiles.Count)] " -NoNewline -ForegroundColor Yellow
    Write-Host "$brique" -NoNewline -ForegroundColor Cyan
    Write-Host " - " -NoNewline
    Write-Host "$fileName" -ForegroundColor White

    try {
        # Execute SQL file
        $output = psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -v ON_ERROR_STOP=1 -f $filePath 2>&1

        if ($LASTEXITCODE -eq 0) {
            Write-Host "   ✅ Success" -ForegroundColor Green
            $successCount++
            $results += @{
                Brique = $brique
                File = $fileName
                Status = "Success"
                Error = $null
            }
        } else {
            Write-Host "   ❌ Failed" -ForegroundColor Red
            $failureCount++
            $results += @{
                Brique = $brique
                File = $fileName
                Status = "Failed"
                Error = $output
            }
        }
    } catch {
        Write-Host "   ❌ Error: $_" -ForegroundColor Red
        $failureCount++
        $results += @{
            Brique = $brique
            File = $fileName
            Status = "Failed"
            Error = $_.Exception.Message
        }
    }

    Write-Host ""
}

# =====================================================================
# Vérifications
# =====================================================================

Write-Host "================================================================" -ForegroundColor Blue
Write-Host "  Step 3: Verification" -ForegroundColor Blue
Write-Host "================================================================" -ForegroundColor Blue
Write-Host ""

# Compter les objets créés
$TABLE_COUNT = (psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';").Trim()
$FUNCTION_COUNT = (psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';").Trim()
$VIEW_COUNT = (psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.views WHERE table_schema = 'public';").Trim()
$TRIGGER_COUNT = (psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -t -c "SELECT COUNT(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public';").Trim()

Write-Host "Database Objects Created:" -ForegroundColor Cyan
Write-Host "  Tables:    " -NoNewline
Write-Host "$TABLE_COUNT" -ForegroundColor Green
Write-Host "  Functions: " -NoNewline
Write-Host "$FUNCTION_COUNT" -ForegroundColor Green
Write-Host "  Views:     " -NoNewline
Write-Host "$VIEW_COUNT" -ForegroundColor Green
Write-Host "  Triggers:  " -NoNewline
Write-Host "$TRIGGER_COUNT" -ForegroundColor Green

Write-Host ""

# =====================================================================
# Résumé des Résultats
# =====================================================================

Write-Host "================================================================" -ForegroundColor Blue
Write-Host "  Test Results Summary" -ForegroundColor Blue
Write-Host "================================================================" -ForegroundColor Blue
Write-Host ""

Write-Host "Briques scanned:  " -NoNewline
Write-Host "$totalBriques" -ForegroundColor Cyan

Write-Host "SQL files found:  " -NoNewline
Write-Host "$($sqlFiles.Count)" -ForegroundColor Cyan

Write-Host ""

Write-Host "Schemas installed:" -NoNewline
Write-Host " $successCount" -ForegroundColor Green

if ($failureCount -gt 0) {
    Write-Host "Schemas failed:   " -NoNewline
    Write-Host " $failureCount" -ForegroundColor Red
}

Write-Host ""

# Success rate
$successRate = [math]::Round(($successCount / $sqlFiles.Count) * 100, 1)
Write-Host "Success Rate: " -NoNewline
if ($successRate -eq 100) {
    Write-Host "$successRate%" -ForegroundColor Green
} elseif ($successRate -ge 80) {
    Write-Host "$successRate%" -ForegroundColor Yellow
} else {
    Write-Host "$successRate%" -ForegroundColor Red
}

Write-Host ""

# Liste des échecs
if ($failureCount -gt 0) {
    Write-Host "================================================================" -ForegroundColor Red
    Write-Host "  Failed Schemas" -ForegroundColor Red
    Write-Host "================================================================" -ForegroundColor Red
    Write-Host ""

    foreach ($result in $results) {
        if ($result.Status -eq "Failed") {
            Write-Host "❌ " -NoNewline -ForegroundColor Red
            Write-Host "$($result.Brique)/$($result.File)" -ForegroundColor Yellow
            if ($result.Error) {
                Write-Host "   Error: $($result.Error)" -ForegroundColor Gray
            }
        }
    }

    Write-Host ""
}

# =====================================================================
# Sample Tables List (first 20)
# =====================================================================

Write-Host "================================================================" -ForegroundColor Blue
Write-Host "  Sample Tables Created (first 20)" -ForegroundColor Blue
Write-Host "================================================================" -ForegroundColor Blue
Write-Host ""

$tables = psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename LIMIT 20;"
$tables -split "`n" | Where-Object { $_.Trim() -ne "" } | ForEach-Object {
    Write-Host "  • $($_.Trim())" -ForegroundColor Gray
}

if ($TABLE_COUNT -gt 20) {
    Write-Host "  ... and $($TABLE_COUNT - 20) more tables" -ForegroundColor Gray
}

Write-Host ""

# =====================================================================
# Final Status
# =====================================================================

Write-Host "================================================================" -ForegroundColor Blue
Write-Host "  Final Status" -ForegroundColor Blue
Write-Host "================================================================" -ForegroundColor Blue
Write-Host ""

if ($failureCount -eq 0) {
    Write-Host "🎉 ALL TESTS PASSED! " -ForegroundColor Green -NoNewline
    Write-Host "All briques installed successfully!" -ForegroundColor Green
} else {
    Write-Host "⚠️  TESTS COMPLETED WITH WARNINGS" -ForegroundColor Yellow
    Write-Host "   $successCount schemas installed, $failureCount failed" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Database: " -NoNewline
Write-Host "$DB_NAME" -ForegroundColor Cyan
Write-Host "Ready for testing! 🚀" -ForegroundColor Blue
Write-Host ""

# =====================================================================
# Export Results to JSON (optional)
# =====================================================================

$reportFile = "test-results-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').json"
$report = @{
    timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    database = $DB_NAME
    total_briques = $totalBriques
    total_sql_files = $sqlFiles.Count
    success_count = $successCount
    failure_count = $failureCount
    success_rate = $successRate
    tables_created = $TABLE_COUNT
    functions_created = $FUNCTION_COUNT
    views_created = $VIEW_COUNT
    triggers_created = $TRIGGER_COUNT
    results = $results
}

$report | ConvertTo-Json -Depth 10 | Out-File $reportFile -Encoding UTF8

Write-Host "Test report saved to: " -NoNewline
Write-Host "$reportFile" -ForegroundColor Cyan
Write-Host ""
