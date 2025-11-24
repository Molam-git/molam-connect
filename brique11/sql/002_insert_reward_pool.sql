-- Internal reward pool wallet (provisionné par Molam)
INSERT INTO molam_wallets (id, user_id, balance, currency, status, wallet_type)
VALUES 
  ('reward-pool-usd', NULL, 1000000.00, 'USD', 'active', 'system'),
  ('reward-pool-xof', NULL, 500000000.00, 'XOF', 'active', 'system')
ON CONFLICT (id) DO UPDATE SET
  balance = EXCLUDED.balance,
  updated_at = NOW();