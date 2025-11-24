# Script de deploiement pour Brique 149a - QR Code Wallet
# Prerequis: Brique 1 (multi-currency wallets) doit etre deployee

$env:PGPASSWORD = "postgres"
$ErrorActionPreference = "Continue"

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "DEPLOIEMENT BRIQUE 149a - QR CODE WALLET" -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan

# Verifier que Brique 1 est deployee
Write-Host "Verification des prerequis..." -ForegroundColor Yellow
$hasB1 = psql -U postgres -d molam_connect -t -c "SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = 'molam_wallets' AND schemaname = 'public');" 2>$null

if ($hasB1 -notmatch "t") {
    Write-Host "ERREUR: Brique 1 (multi-currency wallets) doit etre deployee en premier!" -ForegroundColor Red
    Write-Host "Executez d'abord: .\deploy-brique1-wallets.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host "  OK Brique 1 est deployee" -ForegroundColor Green

# Verifier les tables de reference
$hasCurrencies = psql -U postgres -d molam_connect -t -c "SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = 'ref_currencies');" 2>$null
$hasCountries = psql -U postgres -d molam_connect -t -c "SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = 'ref_countries');" 2>$null

if ($hasCurrencies -notmatch "t" -or $hasCountries -notmatch "t") {
    Write-Host "ERREUR: Tables de reference manquantes (ref_currencies, ref_countries)" -ForegroundColor Red
    exit 1
}

Write-Host "  OK Tables de reference presentes`n" -ForegroundColor Green

# Deployer le schema SQL de Brique 149a
Write-Host "Deploiement du schema SQL..." -ForegroundColor Yellow
psql -U postgres -d molam_connect -f "brique-149a-wallet\sql\001_init_qr_wallet.sql"

if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK Schema SQL deploye`n" -ForegroundColor Green
} else {
    Write-Host "  ERREUR lors du deploiement SQL" -ForegroundColor Red
    exit 1
}

# Verifier les tables creees
Write-Host "Verification des tables creees..." -ForegroundColor Yellow
$tables = @("wallet_action_logs", "wallet_history", "wallet_qr_tokens", "wallet_balances")
$allOk = $true

foreach ($table in $tables) {
    $exists = psql -U postgres -d molam_connect -t -c "SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = '$table');" 2>$null
    if ($exists -match "t") {
        Write-Host "  OK $table" -ForegroundColor Green
    } else {
        Write-Host "  ERREUR $table manquante" -ForegroundColor Red
        $allOk = $false
    }
}

if (-not $allOk) {
    Write-Host "`nDes tables sont manquantes!" -ForegroundColor Red
    exit 1
}

# Initialiser les balances pour les wallets existants
Write-Host "`nInitialisation des balances..." -ForegroundColor Yellow
psql -U postgres -d molam_connect -c @"
-- Inserer les balances pour tous les wallets existants
INSERT INTO wallet_balances (wallet_id, balance, pending_credit, pending_debit)
SELECT id, 0, 0, 0
FROM molam_wallets
ON CONFLICT (wallet_id) DO NOTHING;
"@

$walletCount = psql -U postgres -d molam_connect -t -c "SELECT COUNT(*) FROM wallet_balances;" 2>$null
Write-Host "  OK $walletCount balances initialisees`n" -ForegroundColor Green

# Creer des donnees de test
Write-Host "Creation de donnees de test..." -ForegroundColor Yellow

# Ajouter du solde aux wallets de test
psql -U postgres -d molam_connect -c @"
-- Ajouter du solde aux wallets de test (user 00000000-0000-0000-0000-000000000123)
UPDATE wallet_balances
SET balance = CASE
    WHEN w.currency = 'XOF' THEN 75000.00
    WHEN w.currency = 'USD' THEN 100.50
    WHEN w.currency = 'EUR' THEN 50.00
    ELSE 0
  END,
  last_transaction_at = NOW(),
  updated_at = NOW()
FROM molam_wallets w
WHERE wallet_balances.wallet_id = w.id
  AND w.user_id = '00000000-0000-0000-0000-000000000123';
"@

Write-Host "  OK Soldes initiaux ajoutes`n" -ForegroundColor Green

# Creer quelques transactions de test
psql -U postgres -d molam_connect -c @"
-- Transactions de test pour l'historique
INSERT INTO wallet_history (wallet_id, user_id, label, amount, currency, type, category, balance_before, balance_after, created_at)
SELECT
  w.id,
  w.user_id,
  'Rechargement initial',
  CASE
    WHEN w.currency = 'XOF' THEN 75000.00
    WHEN w.currency = 'USD' THEN 100.50
    WHEN w.currency = 'EUR' THEN 50.00
  END,
  w.currency,
  'credit',
  'topup',
  0,
  CASE
    WHEN w.currency = 'XOF' THEN 75000.00
    WHEN w.currency = 'USD' THEN 100.50
    WHEN w.currency = 'EUR' THEN 50.00
  END,
  NOW() - INTERVAL '1 day'
FROM molam_wallets w
WHERE w.user_id = '00000000-0000-0000-0000-000000000123';
"@

Write-Host "  OK Historique de test cree`n" -ForegroundColor Green

# Afficher un resume
Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "DEPLOIEMENT TERMINE!" -ForegroundColor Green
Write-Host "============================================`n" -ForegroundColor Cyan

Write-Host "Tables deployees:" -ForegroundColor Yellow
Write-Host "  wallet_action_logs     - Audit trail des actions" -ForegroundColor White
Write-Host "  wallet_history         - Historique des transactions" -ForegroundColor White
Write-Host "  wallet_qr_tokens       - Tokens QR pour paiements" -ForegroundColor White
Write-Host "  wallet_balances        - Cache des soldes" -ForegroundColor White

Write-Host "`nStatistiques:" -ForegroundColor Yellow
$stats = psql -U postgres -d molam_connect -t -c @"
SELECT
  (SELECT COUNT(*) FROM molam_wallets) as wallets,
  (SELECT COUNT(*) FROM wallet_balances) as balances,
  (SELECT COUNT(*) FROM wallet_history) as transactions,
  (SELECT COUNT(*) FROM wallet_qr_tokens) as qr_tokens;
"@ 2>$null

Write-Host "  Wallets: " -NoNewline -ForegroundColor White
Write-Host "$stats" -ForegroundColor Green

Write-Host "`nFonctionnalites Brique 149a:" -ForegroundColor Yellow
Write-Host "  Generation de QR codes (receive, pay, transfer)" -ForegroundColor White
Write-Host "  Scan et verification de QR codes" -ForegroundColor White
Write-Host "  Historique complet des transactions" -ForegroundColor White
Write-Host "  Audit trail avec idempotence" -ForegroundColor White
Write-Host "  Gestion des balances multi-devises" -ForegroundColor White
Write-Host "  Expiration automatique des QR (15 min)" -ForegroundColor White

Write-Host "`nProchaines etapes:" -ForegroundColor Yellow
Write-Host "  1. Tester: .\test-brique149a-qr-wallet.ps1" -ForegroundColor Cyan
Write-Host "  2. Acceder a l'interface: http://localhost:3000/wallet.html" -ForegroundColor Cyan
Write-Host "  3. Voir les API: /api/v1/wallet/*" -ForegroundColor Cyan

Write-Host "`n============================================`n" -ForegroundColor Cyan
