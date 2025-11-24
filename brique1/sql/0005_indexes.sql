CREATE INDEX IF NOT EXISTS idx_wallets_user ON molam_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_country ON molam_wallets(country_code);
CREATE INDEX IF NOT EXISTS idx_wallets_currency ON molam_wallets(currency);
CREATE INDEX IF NOT EXISTS idx_wallets_status ON molam_wallets(status);