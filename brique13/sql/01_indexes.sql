-- Indexation renforcée pour l'historique (keyset + filtres)
CREATE INDEX IF NOT EXISTS ix_tx_created_desc ON wallet_transactions (created_at DESC, id);
CREATE INDEX IF NOT EXISTS ix_tx_user ON wallet_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_tx_merchant ON wallet_transactions (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_tx_country_currency ON wallet_transactions (country_code, currency);
CREATE INDEX IF NOT EXISTS ix_tx_status_type ON wallet_transactions (status, tx_type);
CREATE INDEX IF NOT EXISTS ix_tx_reference ON wallet_transactions (reference);