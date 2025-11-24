# Fix Last Dashboard Issues
Write-Host "`n=== Fix Last Issues ===" -ForegroundColor Cyan

$env:PGPASSWORD = "postgres"

# Fix 1: Add client_secret column to payment_intents
Write-Host "`n[1/1] Ajout de client_secret..." -ForegroundColor Yellow
$addClientSecret = @"
ALTER TABLE payment_intents
ADD COLUMN IF NOT EXISTS client_secret TEXT;
"@

psql -U postgres -d molam_connect -c $addClientSecret
Write-Host "  ✅ Colonne client_secret ajoutée" -ForegroundColor Green

Write-Host "`n=== Terminé ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Note: auth_decisions utilisera des UUIDs natifs au lieu de 'dec_xxx'" -ForegroundColor Gray
Write-Host ""
Write-Host "Maintenant:" -ForegroundColor Yellow
Write-Host "  1. Redémarrez le serveur (Ctrl+C puis 'npm start')" -ForegroundColor White
Write-Host "  2. Testez: .\test-dashboard.ps1" -ForegroundColor White
Write-Host ""
