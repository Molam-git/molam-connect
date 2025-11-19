-- 001_init_wallets.sql
-- Molam Ma (Wallet) - Initial schema
-- Creates core wallet tables: wallets, history, action logs, QR tokens

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- molam_wallets: Main wallet table
CREATE TABLE IF NOT EXISTS molam_wallets (
  user_id UUID PRIMARY KEY,
  balance NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'XOF',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- wallet_action_logs: Audit trail for all wallet actions
CREATE TABLE IF NOT EXISTS wallet_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  idempotency_key TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- wallet_history: Transaction history
CREATE TABLE IF NOT EXISTS wallet_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('credit', 'debit')),
  category VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- wallet_qr_tokens: QR code tokens for payments/transfers
CREATE TABLE IF NOT EXISTS wallet_qr_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('receive', 'pay', 'transfer')),
  amount NUMERIC(18,2),
  currency VARCHAR(10) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_wallet_action_logs_user ON wallet_action_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_action_logs_idemp ON wallet_action_logs(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_history_user ON wallet_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_history_type ON wallet_history(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_qr_tokens_user ON wallet_qr_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_qr_tokens_expires ON wallet_qr_tokens(expires_at) WHERE used_at IS NULL;

-- Update trigger for molam_wallets.updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_molam_wallets_updated_at
  BEFORE UPDATE ON molam_wallets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE molam_wallets IS 'Main wallet table with balance and currency';
COMMENT ON TABLE wallet_action_logs IS 'Audit trail for all wallet actions with idempotency';
COMMENT ON TABLE wallet_history IS 'Transaction history for wallet activities';
COMMENT ON TABLE wallet_qr_tokens IS 'QR code tokens for secure payments and transfers';
