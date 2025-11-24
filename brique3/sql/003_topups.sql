-- 003_topups.sql
-- Prérequis: molam_users, molam_wallets, molam_wallet_transactions (Brique 1 & 2)

CREATE TYPE topup_channel AS ENUM ('mobile_money','card','agent','crypto');
CREATE TYPE topup_status AS ENUM ('created','pending','succeeded','failed','cancelled');

CREATE TABLE IF NOT EXISTS molam_payment_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type topup_channel NOT NULL,
  country_code TEXT NOT NULL,
  currency TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (name, country_code, currency)
);

CREATE TABLE IF NOT EXISTS molam_provider_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES molam_payment_providers(id) ON DELETE CASCADE,
  account_ref TEXT NOT NULL,
  ledger_wallet_id UUID NOT NULL REFERENCES molam_wallets(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (provider_id, account_ref)
);

CREATE TABLE IF NOT EXISTS molam_topups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES molam_users(id),
  wallet_id UUID NOT NULL REFERENCES molam_wallets(id),
  provider_id UUID NOT NULL REFERENCES molam_payment_providers(id),
  channel topup_channel NOT NULL,
  country_code TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  fee_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  agent_commission NUMERIC(18,2) NOT NULL DEFAULT 0,
  status topup_status NOT NULL DEFAULT 'created',
  reference TEXT UNIQUE NOT NULL,
  idempotency_key TEXT NOT NULL,
  initiated_via TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_topups_idempotency_per_wallet
  ON molam_topups (wallet_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_topups_user ON molam_topups(user_id);
CREATE INDEX IF NOT EXISTS idx_topups_status ON molam_topups(status);
CREATE INDEX IF NOT EXISTS idx_topups_reference ON molam_topups(reference);
CREATE INDEX IF NOT EXISTS idx_topups_created_at ON molam_topups(created_at);

CREATE TABLE IF NOT EXISTS molam_topup_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topup_id UUID NOT NULL REFERENCES molam_topups(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  raw_payload JSONB NOT NULL,
  signature_valid BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topup_events_topup_id ON molam_topup_events(topup_id);
CREATE INDEX IF NOT EXISTS idx_topup_events_created_at ON molam_topup_events(created_at);

CREATE TABLE IF NOT EXISTS molam_kyc_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  currency TEXT NOT NULL,
  kyc_level TEXT NOT NULL,
  per_tx_max NUMERIC(18,2) NOT NULL,
  daily_max NUMERIC(18,2) NOT NULL,
  monthly_max NUMERIC(18,2) NOT NULL,
  UNIQUE (country_code, currency, kyc_level)
);

CREATE VIEW v_topup_settlement_summary AS
SELECT
  provider_id,
  currency,
  date_trunc('day', created_at)::date AS day,
  sum(CASE WHEN status='succeeded' THEN amount ELSE 0 END) AS total_gross,
  sum(CASE WHEN status='succeeded' THEN fee_amount ELSE 0 END) AS total_fees,
  sum(CASE WHEN status='succeeded' THEN agent_commission ELSE 0 END) AS total_agent_comm,
  count(*) AS count_succeeded
FROM molam_topups
GROUP BY provider_id, currency, date_trunc('day', created_at)::date;