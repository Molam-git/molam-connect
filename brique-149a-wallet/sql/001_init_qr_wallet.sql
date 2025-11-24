-- 001_init_qr_wallet.sql
-- Molam Ma (Wallet) - Brique 149a - QR Code Wallet
-- Adapted to work with Brique 1 multi-currency wallets
-- Adds: QR tokens, transaction history, action logs

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Note: molam_wallets table already exists from Brique 1
-- Structure: id, user_id, country_code, currency, is_default, status, display_name

-- wallet_action_logs: Audit trail for all wallet actions
CREATE TABLE IF NOT EXISTS wallet_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES molam_wallets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES molam_users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,  -- 'create_qr', 'scan_qr', 'transfer', 'topup', 'withdraw'
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  idempotency_key TEXT UNIQUE,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- wallet_history: Transaction history
CREATE TABLE IF NOT EXISTS wallet_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES molam_wallets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES molam_users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,  -- 'Received from', 'Sent to', 'Top-up', 'Withdrawal', 'Purchase'
  amount NUMERIC(18,2) NOT NULL,
  currency CHAR(3) NOT NULL REFERENCES ref_currencies(currency_code),
  type VARCHAR(20) NOT NULL CHECK (type IN ('credit', 'debit')),
  category VARCHAR(50),  -- 'transfer', 'payment', 'topup', 'withdrawal', 'purchase'

  -- Related entities
  related_user_id UUID,  -- The other party in a transfer
  related_wallet_id UUID REFERENCES molam_wallets(id),
  merchant_id UUID,  -- If payment to merchant
  qr_token TEXT,  -- If initiated via QR code

  -- Additional data
  metadata JSONB,
  balance_before NUMERIC(18,2),  -- Balance before transaction
  balance_after NUMERIC(18,2),   -- Balance after transaction

  created_at TIMESTAMPTZ DEFAULT now()
);

-- wallet_qr_tokens: QR code tokens for payments/transfers
CREATE TABLE IF NOT EXISTS wallet_qr_tokens (
  token TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(32), 'base64'),
  wallet_id UUID NOT NULL REFERENCES molam_wallets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES molam_users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('receive', 'pay', 'transfer')),

  -- Amount details
  amount NUMERIC(18,2),  -- NULL for 'receive' (amount determined by sender)
  currency CHAR(3) NOT NULL REFERENCES ref_currencies(currency_code),

  -- Lifecycle
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES molam_users(id),

  -- Details
  description TEXT,  -- e.g., "Pay for coffee"
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- wallet_balances: Cached balances for quick access
-- (In production, this would be populated by the ledger service)
CREATE TABLE IF NOT EXISTS wallet_balances (
  wallet_id UUID PRIMARY KEY REFERENCES molam_wallets(id) ON DELETE CASCADE,
  balance NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  pending_credit NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (pending_credit >= 0),
  pending_debit NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (pending_debit >= 0),
  available_balance NUMERIC(18,2) GENERATED ALWAYS AS (balance - pending_debit) STORED,
  last_transaction_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_wallet_action_logs_wallet ON wallet_action_logs(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_action_logs_user ON wallet_action_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_action_logs_idemp ON wallet_action_logs(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_action_logs_status ON wallet_action_logs(status, created_at DESC) WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_wallet_history_wallet ON wallet_history(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_history_user ON wallet_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_history_type ON wallet_history(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_history_category ON wallet_history(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_history_related_user ON wallet_history(related_user_id) WHERE related_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_qr_tokens_wallet ON wallet_qr_tokens(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_qr_tokens_user ON wallet_qr_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_qr_tokens_expires ON wallet_qr_tokens(expires_at) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_qr_tokens_unused ON wallet_qr_tokens(user_id, created_at DESC) WHERE used_at IS NULL;

-- Trigger to update wallet_balances.updated_at
CREATE OR REPLACE FUNCTION update_wallet_balance_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wallet_balances_updated_at
  BEFORE UPDATE ON wallet_balances
  FOR EACH ROW
  EXECUTE FUNCTION update_wallet_balance_timestamp();

-- Function to clean up expired QR tokens
CREATE OR REPLACE FUNCTION cleanup_expired_qr_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM wallet_qr_tokens
  WHERE expires_at < now() - INTERVAL '7 days'  -- Keep for 7 days after expiry for audit
    AND used_at IS NULL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE wallet_action_logs IS 'Audit trail for all wallet actions with idempotency support';
COMMENT ON TABLE wallet_history IS 'Transaction history for wallet activities';
COMMENT ON TABLE wallet_qr_tokens IS 'QR code tokens for secure payments and transfers (15min expiry)';
COMMENT ON TABLE wallet_balances IS 'Cached wallet balances (synced from ledger service)';

COMMENT ON COLUMN wallet_qr_tokens.purpose IS 'receive: generate QR to receive money, pay: generate QR to pay merchant, transfer: P2P transfer';
COMMENT ON COLUMN wallet_history.balance_before IS 'Balance snapshot before transaction for audit';
COMMENT ON COLUMN wallet_history.balance_after IS 'Balance snapshot after transaction for audit';
COMMENT ON COLUMN wallet_balances.available_balance IS 'balance - pending_debit (auto-calculated)';
