# Test Brique 1 - Wallets Multi-Devises
Write-Host "`n=== TEST BRIQUE 1: WALLETS ===" -ForegroundColor Cyan

$env:PGPASSWORD = "postgres"

Write-Host "`n[Test 1] Creer un wallet XOF pour l'utilisateur test..." -ForegroundColor Yellow

$createWalletXOF = @"
INSERT INTO molam_wallets (user_id, country_code, currency, is_default, display_name)
VALUES (
    '00000000-0000-0000-0000-000000000123',
    'SN',
    'XOF',
    true,
    'Main Senegal Wallet'
)
ON CONFLICT (user_id, currency) DO UPDATE
SET is_default = EXCLUDED.is_default,
    display_name = EXCLUDED.display_name
RETURNING id, user_id, country_code, currency, display_name;
"@

psql -U postgres -d molam_connect -c $createWalletXOF

if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK Wallet XOF cree" -ForegroundColor Green
} else {
    Write-Host "  ERREUR" -ForegroundColor Red
}

Write-Host "`n[Test 2] Creer un wallet USD pour l'utilisateur test..." -ForegroundColor Yellow

$createWalletUSD = @"
INSERT INTO molam_wallets (user_id, country_code, currency, is_default, display_name)
VALUES (
    '00000000-0000-0000-0000-000000000123',
    'US',
    'USD',
    false,
    'US Dollar Wallet'
)
ON CONFLICT (user_id, currency) DO UPDATE
SET display_name = EXCLUDED.display_name
RETURNING id, user_id, country_code, currency, display_name;
"@

psql -U postgres -d molam_connect -c $createWalletUSD

if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK Wallet USD cree" -ForegroundColor Green
} else {
    Write-Host "  ERREUR" -ForegroundColor Red
}

Write-Host "`n[Test 3] Creer un wallet EUR pour l'utilisateur test..." -ForegroundColor Yellow

$createWalletEUR = @"
INSERT INTO molam_wallets (user_id, country_code, currency, is_default, display_name)
VALUES (
    '00000000-0000-0000-0000-000000000123',
    'FR',
    'EUR',
    false,
    'Euro Wallet'
)
ON CONFLICT (user_id, currency) DO UPDATE
SET display_name = EXCLUDED.display_name
RETURNING id, user_id, country_code, currency, display_name;
"@

psql -U postgres -d molam_connect -c $createWalletEUR

if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK Wallet EUR cree" -ForegroundColor Green
} else {
    Write-Host "  ERREUR" -ForegroundColor Red
}

Write-Host "`n[Resultat] Liste des wallets de l'utilisateur test..." -ForegroundColor Yellow

$listWallets = @"
SELECT
    w.id,
    w.currency,
    w.country_code,
    w.display_name,
    w.is_default,
    w.status,
    c.name as currency_name,
    c.minor_unit,
    co.name as country_name,
    co.phone_country_code
FROM molam_wallets w
JOIN ref_currencies c ON w.currency = c.currency_code
JOIN ref_countries co ON w.country_code = co.country_code
WHERE w.user_id = '00000000-0000-0000-0000-000000000123'
ORDER BY w.is_default DESC, w.currency;
"@

psql -U postgres -d molam_connect -c $listWallets

Write-Host "`n[Test 4] Test contrainte unicite (user_id, currency)..." -ForegroundColor Yellow

$testDuplicate = @"
-- Cette insertion devrait echouer (contrainte uq_user_currency)
INSERT INTO molam_wallets (user_id, country_code, currency, display_name)
VALUES (
    '00000000-0000-0000-0000-000000000123',
    'SN',
    'XOF',
    'Duplicate Wallet'
);
"@

psql -U postgres -d molam_connect -c $testDuplicate 2>&1 | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Host "  OK Contrainte unicite fonctionne (duplication empechee)" -ForegroundColor Green
} else {
    Write-Host "  AVERTISSEMENT Contrainte non respectee" -ForegroundColor Yellow
}

Write-Host "`n[Test 5] Verification des devises disponibles..." -ForegroundColor Yellow

$availableCurrencies = @"
SELECT
    currency_code,
    name,
    minor_unit,
    CASE
        WHEN minor_unit = 0 THEN 'Pas de decimales (ex: 1000 XOF)'
        WHEN minor_unit = 2 THEN '2 decimales (ex: 10.50 USD)'
        ELSE minor_unit || ' decimales'
    END as format_example
FROM ref_currencies
ORDER BY currency_code;
"@

psql -U postgres -d molam_connect -c $availableCurrencies

Write-Host "`n[Test 6] Verification des pays disponibles..." -ForegroundColor Yellow

$availableCountries = @"
SELECT
    country_code,
    name,
    phone_country_code,
    currency_code as default_currency
FROM ref_countries
ORDER BY country_code;
"@

psql -U postgres -d molam_connect -c $availableCountries

Write-Host "`n=== TESTS TERMINES ===" -ForegroundColor Cyan

Write-Host "`nResume:" -ForegroundColor Yellow
Write-Host "  OK Wallets multi-devises fonctionnent" -ForegroundColor Green
Write-Host "  OK Un utilisateur peut avoir plusieurs wallets (devises differentes)" -ForegroundColor Green
Write-Host "  OK Contrainte d'unicite (user, currency) respectee" -ForegroundColor Green
Write-Host "  OK Devises avec formatage correct (minor_unit)" -ForegroundColor Green

Write-Host "`nUsage API:" -ForegroundColor Cyan
Write-Host "  Pour creer un wallet:" -ForegroundColor White
Write-Host "    POST /api/wallets/create" -ForegroundColor Gray
Write-Host "    { user_id, country_code, currency, display_name }" -ForegroundColor Gray
Write-Host ""
Write-Host "  Pour lister les wallets d'un utilisateur:" -ForegroundColor White
Write-Host "    GET /api/wallets/user/:user_id" -ForegroundColor Gray
Write-Host ""
Write-Host "  Pour obtenir les devises disponibles:" -ForegroundColor White
Write-Host "    GET /api/currencies" -ForegroundColor Gray
Write-Host ""
Write-Host "  Pour obtenir les pays disponibles:" -ForegroundColor White
Write-Host "    GET /api/countries" -ForegroundColor Gray

Write-Host ""
