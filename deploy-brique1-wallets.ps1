# Deploy Brique 1 - Multi-Devises & Multi-Pays
Write-Host "`n=== DEPLOYMENT BRIQUE 1: WALLETS MULTI-DEVISES ===" -ForegroundColor Cyan

$env:PGPASSWORD = "postgres"

Write-Host "`n[Prerequis] Verification de molam_users..." -ForegroundColor Yellow

$usersTableExists = psql -U postgres -d molam_connect -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'molam_users');"

if ($usersTableExists -ne "t") {
    Write-Host "  Table molam_users n'existe pas. Creation d'une version simplifiee..." -ForegroundColor Gray

    $createUsers = @"
-- Table utilisateurs simplifiee pour demo
CREATE TABLE IF NOT EXISTS molam_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    phone TEXT,
    user_type TEXT DEFAULT 'external',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Creer un utilisateur de test
INSERT INTO molam_users (id, email, name, phone, user_type) VALUES
('00000000-0000-0000-0000-000000000123', 'test@molam.com', 'Test User', '+221771234567', 'external')
ON CONFLICT (email) DO NOTHING;
"@

    psql -U postgres -d molam_connect -c $createUsers

    if ($LASTEXITCODE -eq 0) {
        Write-Host "  OK Table molam_users creee" -ForegroundColor Green
    } else {
        Write-Host "  ERREUR lors de la creation" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "  OK Table molam_users existe deja" -ForegroundColor Green
}

Write-Host "`n[1/6] Installation 0001_ref_countries.sql..." -ForegroundColor Yellow
psql -U postgres -d molam_connect -f "brique1\sql\0001_ref_countries.sql"

if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK Table ref_countries creee" -ForegroundColor Green
} else {
    Write-Host "  ERREUR" -ForegroundColor Red
    exit 1
}

Write-Host "`n[2/6] Installation 0002_ref_currencies.sql..." -ForegroundColor Yellow
psql -U postgres -d molam_connect -f "brique1\sql\0002_ref_currencies.sql"

if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK Table ref_currencies creee" -ForegroundColor Green
} else {
    Write-Host "  ERREUR" -ForegroundColor Red
    exit 1
}

Write-Host "`n[3/6] Installation 0003_molam_wallets.sql..." -ForegroundColor Yellow
psql -U postgres -d molam_connect -f "brique1\sql\0003_molam_wallets.sql"

if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK Table molam_wallets creee" -ForegroundColor Green
} else {
    Write-Host "  ERREUR" -ForegroundColor Red
    exit 1
}

Write-Host "`n[4/6] Installation 0004_constraints_and_triggers.sql..." -ForegroundColor Yellow
psql -U postgres -d molam_connect -f "brique1\sql\0004_constraints_and_triggers.sql"

if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK Contraintes et triggers installes" -ForegroundColor Green
} else {
    Write-Host "  AVERTISSEMENT Contraintes partielles" -ForegroundColor Yellow
}

Write-Host "`n[5/6] Installation 0005_indexes.sql..." -ForegroundColor Yellow
psql -U postgres -d molam_connect -f "brique1\sql\0005_indexes.sql"

if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK Index crees" -ForegroundColor Green
} else {
    Write-Host "  AVERTISSEMENT Index partiels" -ForegroundColor Yellow
}

Write-Host "`n[6/6] Installation 0006_seed_ref.sql..." -ForegroundColor Yellow
psql -U postgres -d molam_connect -f "brique1\sql\0006_seed_ref.sql"

if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK Donnees de reference inserees" -ForegroundColor Green
} else {
    Write-Host "  ERREUR" -ForegroundColor Red
    exit 1
}

Write-Host "`n[Verification] Test des tables..." -ForegroundColor Yellow

$tables = @("ref_countries", "ref_currencies", "molam_wallets")

foreach ($table in $tables) {
    $exists = psql -U postgres -d molam_connect -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '$table');"

    if ($exists -eq "t") {
        $count = psql -U postgres -d molam_connect -tAc "SELECT COUNT(*) FROM $table;"
        Write-Host "  OK $table ($count lignes)" -ForegroundColor Green
    } else {
        Write-Host "  ERREUR $table manquante !" -ForegroundColor Red
    }
}

Write-Host "`n[Donnees] Contenu ref_currencies..." -ForegroundColor Yellow
psql -U postgres -d molam_connect -c "SELECT currency_code, name, minor_unit FROM ref_currencies ORDER BY currency_code;"

Write-Host "`n[Donnees] Contenu ref_countries..." -ForegroundColor Yellow
psql -U postgres -d molam_connect -c "SELECT country_code, name, phone_country_code, currency_code FROM ref_countries ORDER BY country_code;"

Write-Host "`n=== BRIQUE 1 DEPLOYEE ! ===" -ForegroundColor Green

Write-Host "`nResume du deploiement:" -ForegroundColor Cyan
Write-Host "  OK ref_countries - Pays avec codes ISO 3166-1" -ForegroundColor Green
Write-Host "  OK ref_currencies - Devises ISO 4217" -ForegroundColor Green
Write-Host "  OK molam_wallets - Wallets multi-devises par utilisateur" -ForegroundColor Green
Write-Host "  OK molam_users - Table utilisateurs (si creee)" -ForegroundColor Green

Write-Host "`nDevises supportees:" -ForegroundColor Cyan
Write-Host "  - XOF (CFA Franc BCEAO) - Senegal, Cote d'Ivoire" -ForegroundColor Gray
Write-Host "  - XAF (CFA Franc BEAC) - Cameroun" -ForegroundColor Gray
Write-Host "  - USD (US Dollar)" -ForegroundColor Gray
Write-Host "  - EUR (Euro)" -ForegroundColor Gray

Write-Host "`nPays supportes:" -ForegroundColor Cyan
Write-Host "  - SN (Senegal) +221 -> XOF" -ForegroundColor Gray
Write-Host "  - CI (Cote d'Ivoire) +225 -> XOF" -ForegroundColor Gray
Write-Host "  - CM (Cameroun) +237 -> XAF" -ForegroundColor Gray
Write-Host "  - FR (France) +33 -> EUR" -ForegroundColor Gray
Write-Host "  - US (United States) +1 -> USD" -ForegroundColor Gray

Write-Host "`nProchaines etapes:" -ForegroundColor Yellow
Write-Host "  1. Creer des wallets de test:" -ForegroundColor White
Write-Host "     .\test-brique1-wallets.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Integrer au dashboard:" -ForegroundColor White
Write-Host "     Selecteur pays/devises dans l'UI" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Deployer Cash In/Out (Options D & E)" -ForegroundColor White

Write-Host ""
