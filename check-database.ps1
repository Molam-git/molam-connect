# Check Database Tables for Molam Connect
Write-Host "`n=== Vérification Base de Données ===" -ForegroundColor Cyan

$env:PGPASSWORD = "postgres"

# Test 1: Check if database exists
Write-Host "`n[1/4] Vérification de la base de données..." -ForegroundColor Yellow
$dbExists = psql -U postgres -lqt | Select-String -Pattern "molam_connect"
if ($dbExists) {
    Write-Host "  ✅ Base de données 'molam_connect' existe" -ForegroundColor Green
} else {
    Write-Host "  ❌ Base de données 'molam_connect' n'existe pas" -ForegroundColor Red
    Write-Host "  Création de la base de données..." -ForegroundColor Yellow
    createdb -U postgres molam_connect
    Write-Host "  ✅ Base de données créée" -ForegroundColor Green
}

# Test 2: Check required tables
Write-Host "`n[2/4] Vérification des tables..." -ForegroundColor Yellow

$tables = @(
    "payment_intents",
    "customers",
    "otp_codes",
    "auth_decisions",
    "permissions",
    "roles",
    "role_bindings",
    "grants"
)

$missingTables = @()

foreach ($table in $tables) {
    $exists = psql -U postgres -d molam_connect -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '$table');"
    if ($exists -eq "t") {
        Write-Host "  ✅ Table '$table' existe" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Table '$table' manquante" -ForegroundColor Red
        $missingTables += $table
    }
}

# Test 3: Count records
Write-Host "`n[3/4] Comptage des enregistrements..." -ForegroundColor Yellow

if ($missingTables.Count -eq 0) {
    try {
        $permCount = psql -U postgres -d molam_connect -tAc "SELECT COUNT(*) FROM permissions;"
        Write-Host "  Permissions: $permCount" -ForegroundColor Gray

        $roleCount = psql -U postgres -d molam_connect -tAc "SELECT COUNT(*) FROM roles;"
        Write-Host "  Roles: $roleCount" -ForegroundColor Gray

        $piCount = psql -U postgres -d molam_connect -tAc "SELECT COUNT(*) FROM payment_intents;"
        Write-Host "  Payment Intents: $piCount" -ForegroundColor Gray
    } catch {
        Write-Host "  ⚠️  Erreur lors du comptage" -ForegroundColor Yellow
    }
}

# Test 4: Show SQL files available
Write-Host "`n[4/4] Fichiers SQL disponibles..." -ForegroundColor Yellow

$sqlFiles = Get-ChildItem -Path "." -Filter "*.sql" -Recurse | Where-Object { $_.FullName -like "*migrations*" -or $_.FullName -like "*brique*" }

if ($sqlFiles.Count -gt 0) {
    Write-Host "  Trouvé $($sqlFiles.Count) fichiers SQL de migration:" -ForegroundColor Gray
    $sqlFiles | Select-Object -First 10 | ForEach-Object {
        Write-Host "    - $($_.Name)" -ForegroundColor DarkGray
    }
}

# Summary
Write-Host "`n=== Résumé ===" -ForegroundColor Cyan

if ($missingTables.Count -gt 0) {
    Write-Host "❌ Tables manquantes: $($missingTables.Count)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Pour créer les tables manquantes, exécutez:" -ForegroundColor Yellow
    Write-Host "  .\setup-all-schemas.ps1" -ForegroundColor White
    Write-Host ""
    Write-Host "Ou manuellement pour chaque brique:" -ForegroundColor Yellow
    Write-Host "  psql -U postgres -d molam_connect -f brique-XX\migrations\XXX_name.sql" -ForegroundColor White
} else {
    Write-Host "✅ Toutes les tables requises existent!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Vous pouvez maintenant démarrer le serveur:" -ForegroundColor Yellow
    Write-Host "  npm start" -ForegroundColor White
}

Write-Host ""
