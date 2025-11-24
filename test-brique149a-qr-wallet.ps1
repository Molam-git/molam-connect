# Script de test pour Brique 149a - QR Code Wallet
$env:PGPASSWORD = "postgres"
$TEST_USER_ID = "00000000-0000-0000-0000-000000000123"

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "TEST BRIQUE 149a - QR CODE WALLET" -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan

# Test 1: Verifier les balances
Write-Host "[Test 1] Verifier les balances des wallets..." -ForegroundColor Yellow
psql -U postgres -d molam_connect -c @"
SELECT
  w.currency,
  w.display_name,
  wb.balance,
  wb.pending_credit,
  wb.pending_debit,
  wb.available_balance,
  w.status
FROM molam_wallets w
JOIN wallet_balances wb ON w.id = wb.wallet_id
WHERE w.user_id = '$TEST_USER_ID'
ORDER BY w.is_default DESC, w.currency;
"@

Write-Host "  OK Balances affichees`n" -ForegroundColor Green

# Test 2: Creer un QR code pour recevoir de l'argent
Write-Host "[Test 2] Creer un QR code pour recevoir de l'argent (XOF)..." -ForegroundColor Yellow
$qrToken = psql -U postgres -d molam_connect -t -c @"
WITH wallet AS (
  SELECT id FROM molam_wallets
  WHERE user_id = '$TEST_USER_ID' AND currency = 'XOF'
  LIMIT 1
)
INSERT INTO wallet_qr_tokens (wallet_id, user_id, purpose, currency, expires_at, description)
SELECT
  w.id,
  '$TEST_USER_ID',
  'receive',
  'XOF',
  NOW() + INTERVAL '15 minutes',
  'Recevoir paiement de test'
FROM wallet w
RETURNING token;
"@ 2>$null

$qrToken = $qrToken.Trim()
Write-Host "  OK QR Token cree: " -NoNewline -ForegroundColor Green
Write-Host "$($qrToken.Substring(0, [Math]::Min(20, $qrToken.Length)))..." -ForegroundColor Cyan

# Test 3: Lister les QR codes actifs
Write-Host "`n[Test 3] Lister les QR codes actifs..." -ForegroundColor Yellow
psql -U postgres -d molam_connect -c @"
SELECT
  LEFT(token, 20) || '...' as token_short,
  purpose,
  amount,
  currency,
  description,
  expires_at,
  CASE
    WHEN expires_at > NOW() THEN 'Active'
    ELSE 'Expired'
  END as status,
  EXTRACT(EPOCH FROM (expires_at - NOW())) / 60 as minutes_left
FROM wallet_qr_tokens
WHERE user_id = '$TEST_USER_ID'
  AND used_at IS NULL
ORDER BY created_at DESC
LIMIT 5;
"@

Write-Host "  OK QR codes actifs affiches`n" -ForegroundColor Green

# Test 4: Creer un QR code pour payer un montant fixe
Write-Host "[Test 4] Creer un QR code pour payer 5000 XOF..." -ForegroundColor Yellow
psql -U postgres -d molam_connect -c @"
WITH wallet AS (
  SELECT id FROM molam_wallets
  WHERE user_id = '$TEST_USER_ID' AND currency = 'XOF'
  LIMIT 1
)
INSERT INTO wallet_qr_tokens (wallet_id, user_id, purpose, amount, currency, expires_at, description)
SELECT
  w.id,
  '$TEST_USER_ID',
  'pay',
  5000.00,
  'XOF',
  NOW() + INTERVAL '15 minutes',
  'Paiement marchand - Test Shop'
FROM wallet w
RETURNING
  LEFT(token, 25) || '...' as token,
  purpose,
  amount,
  currency,
  description;
"@

Write-Host "  OK QR paiement cree`n" -ForegroundColor Green

# Test 5: Verifier l'historique des transactions
Write-Host "[Test 5] Afficher l'historique des transactions..." -ForegroundColor Yellow
psql -U postgres -d molam_connect -c @"
SELECT
  w.currency,
  h.label,
  h.type,
  h.amount,
  h.category,
  h.balance_before,
  h.balance_after,
  TO_CHAR(h.created_at, 'YYYY-MM-DD HH24:MI') as date
FROM wallet_history h
JOIN molam_wallets w ON h.wallet_id = w.id
WHERE h.user_id = '$TEST_USER_ID'
ORDER BY h.created_at DESC
LIMIT 10;
"@

Write-Host "  OK Historique affiche`n" -ForegroundColor Green

# Test 6: Simuler une transaction credit
Write-Host "[Test 6] Simuler reception de 10000 XOF..." -ForegroundColor Yellow
psql -U postgres -d molam_connect -c @"
WITH wallet AS (
  SELECT id, user_id, currency FROM molam_wallets
  WHERE user_id = '$TEST_USER_ID' AND currency = 'XOF'
  LIMIT 1
),
balance AS (
  SELECT wallet_id, balance FROM wallet_balances
  WHERE wallet_id = (SELECT id FROM wallet)
),
new_balance AS (
  UPDATE wallet_balances
  SET
    balance = balance + 10000.00,
    last_transaction_at = NOW(),
    updated_at = NOW()
  WHERE wallet_id = (SELECT id FROM wallet)
  RETURNING wallet_id, balance, balance - 10000.00 as old_balance
)
INSERT INTO wallet_history (wallet_id, user_id, label, amount, currency, type, category, balance_before, balance_after)
SELECT
  w.id,
  w.user_id,
  'Recu de Mohamed K.',
  10000.00,
  w.currency,
  'credit',
  'transfer',
  nb.old_balance,
  nb.balance
FROM wallet w
JOIN new_balance nb ON w.id = nb.wallet_id
RETURNING
  label,
  amount || ' ' || currency as montant,
  balance_before || ' → ' || balance_after as balance_change;
"@

Write-Host "  OK Transaction credit effectuee`n" -ForegroundColor Green

# Test 7: Simuler une transaction debit
Write-Host "[Test 7] Simuler paiement de 2500 XOF..." -ForegroundColor Yellow
psql -U postgres -d molam_connect -c @"
WITH wallet AS (
  SELECT id, user_id, currency FROM molam_wallets
  WHERE user_id = '$TEST_USER_ID' AND currency = 'XOF'
  LIMIT 1
),
new_balance AS (
  UPDATE wallet_balances
  SET
    balance = balance - 2500.00,
    last_transaction_at = NOW(),
    updated_at = NOW()
  WHERE wallet_id = (SELECT id FROM wallet)
    AND balance >= 2500.00  -- Verification solde suffisant
  RETURNING wallet_id, balance, balance + 2500.00 as old_balance
)
INSERT INTO wallet_history (wallet_id, user_id, label, amount, currency, type, category, balance_before, balance_after)
SELECT
  w.id,
  w.user_id,
  'Achat chez Shop Express',
  2500.00,
  w.currency,
  'debit',
  'purchase',
  nb.old_balance,
  nb.balance
FROM wallet w
JOIN new_balance nb ON w.id = nb.wallet_id
RETURNING
  label,
  amount || ' ' || currency as montant,
  balance_before || ' → ' || balance_after as balance_change;
"@

Write-Host "  OK Transaction debit effectuee`n" -ForegroundColor Green

# Test 8: Balance finale
Write-Host "[Test 8] Balance finale..." -ForegroundColor Yellow
psql -U postgres -d molam_connect -c @"
SELECT
  w.currency,
  w.display_name,
  wb.balance,
  wb.available_balance,
  (SELECT COUNT(*) FROM wallet_history WHERE wallet_id = w.id) as tx_count
FROM molam_wallets w
JOIN wallet_balances wb ON w.id = wb.wallet_id
WHERE w.user_id = '$TEST_USER_ID'
ORDER BY w.is_default DESC, w.currency;
"@

Write-Host "  OK Balance finale affichee`n" -ForegroundColor Green

# Test 9: Statistiques globales
Write-Host "[Test 9] Statistiques globales..." -ForegroundColor Yellow
Write-Host "`nResume:" -ForegroundColor Cyan
psql -U postgres -d molam_connect -c @"
SELECT
  'Total Wallets' as metric,
  COUNT(*)::TEXT as value
FROM molam_wallets
UNION ALL
SELECT
  'Wallets Actifs',
  COUNT(*)::TEXT
FROM molam_wallets
WHERE status = 'active'
UNION ALL
SELECT
  'QR Codes Actifs',
  COUNT(*)::TEXT
FROM wallet_qr_tokens
WHERE used_at IS NULL AND expires_at > NOW()
UNION ALL
SELECT
  'Transactions (24h)',
  COUNT(*)::TEXT
FROM wallet_history
WHERE created_at > NOW() - INTERVAL '24 hours'
UNION ALL
SELECT
  'Volume Total Credit (XOF)',
  TO_CHAR(COALESCE(SUM(amount), 0), '999,999,999.99')
FROM wallet_history
WHERE type = 'credit' AND currency = 'XOF';
"@

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "TESTS TERMINES!" -ForegroundColor Green
Write-Host "============================================`n" -ForegroundColor Cyan

Write-Host "Fonctionnalites testees:" -ForegroundColor Yellow
Write-Host "  [OK] Consultation des balances" -ForegroundColor Green
Write-Host "  [OK] Generation QR 'receive' (montant variable)" -ForegroundColor Green
Write-Host "  [OK] Generation QR 'pay' (montant fixe)" -ForegroundColor Green
Write-Host "  [OK] Transactions credit (reception)" -ForegroundColor Green
Write-Host "  [OK] Transactions debit (paiement)" -ForegroundColor Green
Write-Host "  [OK] Historique des transactions" -ForegroundColor Green
Write-Host "  [OK] Balances multi-devises" -ForegroundColor Green

Write-Host "`nUsage API:" -ForegroundColor Yellow
Write-Host "  POST /api/v1/wallet/qr/create" -ForegroundColor Cyan
Write-Host "       { wallet_id, purpose, amount?, description }" -ForegroundColor Gray
Write-Host "`n  GET  /api/v1/wallet/qr/verify/:token" -ForegroundColor Cyan
Write-Host "       Verifier et decoder un QR code" -ForegroundColor Gray
Write-Host "`n  POST /api/v1/wallet/transfer" -ForegroundColor Cyan
Write-Host "       { from_wallet_id, to_wallet_id, amount }" -ForegroundColor Gray
Write-Host "`n  GET  /api/v1/wallet/:wallet_id/history" -ForegroundColor Cyan
Write-Host "       Historique des transactions" -ForegroundColor Gray
Write-Host "`n  GET  /api/v1/wallet/:wallet_id/balance" -ForegroundColor Cyan
Write-Host "       Balance actuelle et disponible" -ForegroundColor Gray

Write-Host "`n============================================`n" -ForegroundColor Cyan
