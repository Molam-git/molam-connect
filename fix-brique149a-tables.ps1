# Script pour nettoyer et recreer les tables de Brique 149a
$env:PGPASSWORD = "postgres"

Write-Host "`n=== NETTOYAGE TABLES BRIQUE 149a ===" -ForegroundColor Cyan

# Supprimer les anciennes tables
Write-Host "`nSuppression des anciennes tables..." -ForegroundColor Yellow
psql -U postgres -d molam_connect -c @"
DROP TABLE IF EXISTS wallet_qr_tokens CASCADE;
DROP TABLE IF EXISTS wallet_history CASCADE;
DROP TABLE IF EXISTS wallet_action_logs CASCADE;
DROP TABLE IF EXISTS wallet_balances CASCADE;
"@

Write-Host "  OK Tables supprimees`n" -ForegroundColor Green

# Recreer avec la nouvelle structure
Write-Host "Recreation des tables..." -ForegroundColor Yellow
psql -U postgres -d molam_connect -f "brique-149a-wallet\sql\001_init_qr_wallet.sql"

Write-Host "`n  OK Tables recreees`n" -ForegroundColor Green

# Initialiser les balances
Write-Host "Initialisation des balances..." -ForegroundColor Yellow
psql -U postgres -d molam_connect -c @"
INSERT INTO wallet_balances (wallet_id, balance, pending_credit, pending_debit)
SELECT id, 0, 0, 0
FROM molam_wallets
ON CONFLICT (wallet_id) DO NOTHING;
"@

# Ajouter des balances de test
psql -U postgres -d molam_connect -c @"
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

# Creer l'historique initial
psql -U postgres -d molam_connect -c @"
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

Write-Host "  OK Donnees de test creees`n" -ForegroundColor Green

# Verifier
Write-Host "Verification finale..." -ForegroundColor Yellow
psql -U postgres -d molam_connect -c @"
SELECT
  (SELECT COUNT(*) FROM wallet_balances) as balances,
  (SELECT COUNT(*) FROM wallet_history) as history,
  (SELECT COUNT(*) FROM wallet_qr_tokens) as qr_tokens,
  (SELECT COUNT(*) FROM wallet_action_logs) as action_logs;
"@

Write-Host "`n=== CORRECTION TERMINEE ===" -ForegroundColor Green
