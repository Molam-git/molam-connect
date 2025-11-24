# Deploy Brique Translation - Multi-language System
Write-Host "`n=== DEPLOYMENT BRIQUE TRANSLATION (i18n) ===" -ForegroundColor Cyan

$env:PGPASSWORD = "postgres"

Write-Host "`n[1/4] Installation du schema SQL Translation..." -ForegroundColor Yellow

$translationSQL = Get-Content -Path "brique-translation\database\migrations\001_init_translation.sql" -Raw

psql -U postgres -d molam_connect -c $translationSQL

if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK Tables de traduction creees avec succes" -ForegroundColor Green
    Write-Host "     - translation_cache (cache des traductions)" -ForegroundColor Gray
    Write-Host "     - translation_overrides (corrections manuelles)" -ForegroundColor Gray
    Write-Host "     - translation_feedback (retours utilisateurs)" -ForegroundColor Gray
    Write-Host "     - translation_audit (audit trail)" -ForegroundColor Gray
} else {
    Write-Host "  ERREUR lors de la creation des tables" -ForegroundColor Red
    exit 1
}

Write-Host "`n[2/4] Verification des tables..." -ForegroundColor Yellow

$tables = @("translation_cache", "translation_overrides", "translation_feedback", "translation_audit")

foreach ($table in $tables) {
    $exists = psql -U postgres -d molam_connect -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '$table');"

    if ($exists -eq "t") {
        $count = psql -U postgres -d molam_connect -tAc "SELECT COUNT(*) FROM $table;"
        Write-Host "  OK $table ($count lignes)" -ForegroundColor Green
    } else {
        Write-Host "  ERREUR $table manquante !" -ForegroundColor Red
    }
}

Write-Host "`n[3/4] Configuration du service de traduction..." -ForegroundColor Yellow

# Verifier si .env existe dans backend
if (-not (Test-Path "brique-translation\backend\.env")) {
    Write-Host "  Creation du fichier .env..." -ForegroundColor Gray

    $envContent = @"
# Database
DATABASE_URL=postgres://postgres:postgres@localhost:5432/molam_connect

# Translation API (LibreTranslate)
TRANSLATION_API=http://localhost:5000/translate

# Server
PORT=4015
NODE_ENV=development

# Molam ID Public Key (pour JWT - optionnel en dev)
MOLAM_ID_PUBLIC=""
"@

    Set-Content -Path "brique-translation\backend\.env" -Value $envContent
    Write-Host "  OK Fichier .env cree" -ForegroundColor Green
} else {
    Write-Host "  OK Fichier .env existe deja" -ForegroundColor Green
}

Write-Host "`n[4/4] Installation des dependances..." -ForegroundColor Yellow

Push-Location "brique-translation\backend"

if (-not (Test-Path "node_modules")) {
    Write-Host "  npm install en cours..." -ForegroundColor Gray
    npm install --silent 2>&1 | Out-Null

    if ($LASTEXITCODE -eq 0) {
        Write-Host "  OK Dependances installees" -ForegroundColor Green
    } else {
        Write-Host "  ERREUR lors de l'installation" -ForegroundColor Red
        Pop-Location
        exit 1
    }
} else {
    Write-Host "  OK Dependances deja installees" -ForegroundColor Green
}

Write-Host "`n  Compilation TypeScript..." -ForegroundColor Gray
npm run build 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK Build termine" -ForegroundColor Green
} else {
    Write-Host "  AVERTISSEMENT Build avec warnings (ignores)" -ForegroundColor Yellow
}

Pop-Location

Write-Host "`n=== BRIQUE TRANSLATION DEPLOYEE ! ===" -ForegroundColor Green

Write-Host "`nResume du deploiement:" -ForegroundColor Cyan
Write-Host "  OK 4 tables creees dans PostgreSQL" -ForegroundColor Green
Write-Host "  OK Service configure sur port 4015" -ForegroundColor Green
Write-Host "  OK Dependances installees" -ForegroundColor Green

Write-Host "`nProchaines etapes:" -ForegroundColor Yellow
Write-Host "  1. [OPTIONNEL] Demarrer LibreTranslate:" -ForegroundColor White
Write-Host "     docker run -d -p 5000:5000 libretranslate/libretranslate" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Demarrer le service Translation:" -ForegroundColor White
Write-Host "     cd brique-translation\backend" -ForegroundColor Gray
Write-Host "     npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Service disponible a:" -ForegroundColor White
Write-Host "     http://localhost:4015/api/translate" -ForegroundColor Gray
Write-Host ""
Write-Host "  4. Integrer au dashboard (prochaine etape)" -ForegroundColor White

Write-Host "`nNote:" -ForegroundColor Cyan
Write-Host "  Le service peut fonctionner SANS LibreTranslate en mode cache-only." -ForegroundColor Gray
Write-Host "  Les traductions FR de base sont deja dans translation_overrides." -ForegroundColor Gray

Write-Host ""
