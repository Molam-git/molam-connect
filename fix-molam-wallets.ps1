# Script pour diagnostiquer et corriger la table molam_wallets
$env:PGPASSWORD = "postgres"

Write-Host "`n=== DIAGNOSTIC MOLAM_WALLETS ===" -ForegroundColor Cyan

# 1. Verifier si la table existe
Write-Host "`n1. Verification existence table..." -ForegroundColor Yellow
$tableExists = psql -U postgres -d molam_connect -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'molam_wallets');"
Write-Host "Table existe: $tableExists"

# 2. Afficher la structure actuelle
Write-Host "`n2. Structure actuelle:" -ForegroundColor Yellow
psql -U postgres -d molam_connect -c "\d molam_wallets"

# 3. Lister toutes les colonnes
Write-Host "`n3. Colonnes existantes:" -ForegroundColor Yellow
psql -U postgres -d molam_connect -c "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'molam_wallets' ORDER BY ordinal_position;"

# 4. Verifier les colonnes problematiques
Write-Host "`n4. Verification colonnes problematiques:" -ForegroundColor Yellow
$hasIsDefault = psql -U postgres -d molam_connect -t -c "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'molam_wallets' AND column_name = 'is_default');"
$hasCountryCode = psql -U postgres -d molam_connect -t -c "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'molam_wallets' AND column_name = 'country_code');"

Write-Host "Colonne 'is_default': $hasIsDefault" -ForegroundColor $(if ($hasIsDefault -match "t") { "Green" } else { "Red" })
Write-Host "Colonne 'country_code': $hasCountryCode" -ForegroundColor $(if ($hasCountryCode -match "t") { "Green" } else { "Red" })

# 5. Si les colonnes manquent, proposer une correction
if ($hasIsDefault -notmatch "t" -or $hasCountryCode -notmatch "t") {
    Write-Host "`n=== CORRECTION NECESSAIRE ===" -ForegroundColor Red
    Write-Host "La table molam_wallets existe mais il manque des colonnes." -ForegroundColor Yellow
    Write-Host "Options:" -ForegroundColor Yellow
    Write-Host "  1. Supprimer et recreer la table (perte de donnees)" -ForegroundColor Cyan
    Write-Host "  2. Ajouter les colonnes manquantes (migration)" -ForegroundColor Cyan

    # Suppression et recreation
    Write-Host "`nRecreation de la table..." -ForegroundColor Yellow

    # Drop la table et ses dependances
    psql -U postgres -d molam_connect -c "DROP TABLE IF EXISTS molam_wallets CASCADE;"

    # Recreer la table
    psql -U postgres -d molam_connect -f "brique1/sql/0003_molam_wallets.sql"

    Write-Host "`nTable recreee!" -ForegroundColor Green

    # Re-executer les contraintes et triggers
    Write-Host "`nApplication des contraintes..." -ForegroundColor Yellow
    psql -U postgres -d molam_connect -f "brique1/sql/0004_constraints_and_triggers.sql"

    # Re-executer les indexes
    Write-Host "`nCreation des indexes..." -ForegroundColor Yellow
    psql -U postgres -d molam_connect -f "brique1/sql/0005_indexes.sql"

    Write-Host "`n=== CORRECTION TERMINEE ===" -ForegroundColor Green
} else {
    Write-Host "`n=== TOUT EST OK ===" -ForegroundColor Green
    Write-Host "Toutes les colonnes requises sont presentes." -ForegroundColor Green
}

# 6. Verification finale
Write-Host "`n=== VERIFICATION FINALE ===" -ForegroundColor Cyan
psql -U postgres -d molam_connect -c "\d molam_wallets"

Write-Host "`n=== DIAGNOSTIC TERMINE ===" -ForegroundColor Green
