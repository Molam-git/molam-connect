# Fix Final Dashboard Errors
Write-Host "`n=== Fix Final Errors ===" -ForegroundColor Cyan

$env:PGPASSWORD = "postgres"

# Fix 1: Add customer_id column to payment_intents
Write-Host "`n[1/2] Ajout de la colonne customer_id..." -ForegroundColor Yellow
$addCustomerId = @"
ALTER TABLE payment_intents
ADD COLUMN IF NOT EXISTS customer_id TEXT;
"@

psql -U postgres -d molam_connect -c $addCustomerId
Write-Host "  ✅ Colonne customer_id ajoutée" -ForegroundColor Green

# Fix 2: Change auth_decisions id to TEXT (to allow 'dec_xxx' format)
Write-Host "`n[2/2] Modification du type de id dans auth_decisions..." -ForegroundColor Yellow

# Check current type
$currentType = psql -U postgres -d molam_connect -tAc "SELECT data_type FROM information_schema.columns WHERE table_name = 'auth_decisions' AND column_name = 'id';"

if ($currentType -match "uuid") {
    Write-Host "  Type actuel: UUID, conversion en TEXT..." -ForegroundColor Gray

    # Drop and recreate as TEXT
    $fixAuthId = @"
ALTER TABLE auth_decisions
ALTER COLUMN id TYPE TEXT USING id::TEXT;
"@

    psql -U postgres -d molam_connect -c $fixAuthId
    Write-Host "  ✅ Type changé en TEXT" -ForegroundColor Green
} else {
    Write-Host "  ✅ Déjà en TEXT" -ForegroundColor Green
}

Write-Host "`n=== Corrections terminées ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Maintenant:" -ForegroundColor Yellow
Write-Host "  1. Redémarrez le serveur (Ctrl+C puis 'npm start')" -ForegroundColor White
Write-Host "  2. Testez: .\test-dashboard.ps1" -ForegroundColor White
Write-Host ""
Write-Host "Tous les tests devraient passer ! ✅" -ForegroundColor Green
Write-Host ""
