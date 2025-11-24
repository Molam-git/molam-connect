CREATE TABLE IF NOT EXISTS molam_currency (
  code TEXT PRIMARY KEY,
  minor_units SMALLINT NOT NULL,
  rounding_mode TEXT NOT NULL DEFAULT 'BANKERS',
  min_txn_cents BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO molam_currency (code, minor_units, rounding_mode, min_txn_cents)
VALUES 
  ('USD', 2, 'BANKERS', 1),
  ('EUR', 2, 'BANKERS', 1),
  ('XOF', 0, 'BANKERS', 1)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS molam_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_type TEXT NOT NULL CHECK (user_type IN ('customer','merchant','employee')),
  country TEXT NOT NULL,
  kyc_level TEXT NOT NULL DEFAULT 'P1',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS molam_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES molam_users(id),
  currency TEXT NOT NULL REFERENCES molam_currency(code),
  balance_cents BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  UNIQUE(user_id, currency)
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  sender_wallet_id UUID REFERENCES molam_wallets(id),
  receiver_wallet_id UUID REFERENCES molam_wallets(id),
  amount_cents BIGINT NOT NULL,
  fee_cents BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL REFERENCES molam_currency(code),
  note TEXT,
  reversible_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES wallet_transactions(id),
  wallet_id UUID,
  account TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),
  amount_cents BIGINT NOT NULL,
  currency TEXT NOT NULL REFERENCES molam_currency(code),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_tx ON ledger_entries(transaction_id);

CREATE TABLE IF NOT EXISTS revenue_ledger (
  id BIGSERIAL PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES wallet_transactions(id),
  source TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  currency TEXT NOT NULL REFERENCES molam_currency(code),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS molam_fee_config (
  id BIGSERIAL PRIMARY KEY,
  fee_type TEXT NOT NULL,
  country TEXT,
  currency TEXT,
  kyc_level TEXT,
  percent NUMERIC(8,6) NOT NULL,
  min_fee_cents BIGINT NOT NULL DEFAULT 0,
  max_fee_cents BIGINT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO molam_fee_config (fee_type, percent, min_fee_cents, active)
VALUES ('P2P_VIRTUAL', 0.009000, 1, TRUE);

CREATE TABLE IF NOT EXISTS molam_limits (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL,
  country TEXT,
  kyc_level TEXT,
  daily_cents BIGINT NOT NULL,
  monthly_cents BIGINT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO molam_limits (scope, daily_cents, monthly_cents, active)
VALUES 
  ('P2P_VIRTUAL', 10000000, 300000000, TRUE),
  ('P2P_VIRTUAL', 5000000, 150000000, TRUE);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES molam_users(id),
  endpoint TEXT NOT NULL,
  idem_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  transaction_id UUID,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint, idem_key)
);