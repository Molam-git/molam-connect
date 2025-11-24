-- 004_withdrawals.sql
-- Prereqs: molam_users, molam_wallets, molam_wallet_transactions, molam_kyc_limits

CREATE TYPE withdrawal_channel AS ENUM ('mobile_money','bank','agent');
CREATE TYPE withdrawal_status  AS ENUM ('created','pending','queued','processing','succeeded','failed','cancelled');

-- Providers for payouts (can reuse payment providers table model but we keep explicit type separation)
CREATE TABLE IF NOT EXISTS molam_payout_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                            -- 'wave_payout','orange_money_payout','bank_xyz'
  type withdrawal_channel NOT NULL,
  country_code TEXT NOT NULL,
  currency TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  config JSONB NOT NULL,                         -- settlement windows, fees, webhook secret ref, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (name, country_code, currency)
);

CREATE TABLE IF NOT EXISTS molam_payout_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES molam_payout_providers(id) ON DELETE CASCADE,
  account_ref TEXT NOT NULL,                     -- settlement/bank float account reference
  ledger_wallet_id UUID NOT NULL REFERENCES molam_wallets(id),  -- Molam internal provider float wallet
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (provider_id, account_ref)
);

CREATE TABLE IF NOT EXISTS molam_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES molam_users(id),
  wallet_id UUID NOT NULL REFERENCES molam_wallets(id),
  provider_id UUID NOT NULL REFERENCES molam_payout_providers(id),
  channel withdrawal_channel NOT NULL,
  country_code TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  fee_amount NUMERIC(18,2) NOT NULL DEFAULT 0,          -- fees charged to user
  agent_commission NUMERIC(18,2) NOT NULL DEFAULT 0,    -- if agent involved
  status withdrawal_status NOT NULL DEFAULT 'created',
  reference TEXT UNIQUE NOT NULL,                       -- WD-YYYYMMDD-XXXX
  idempotency_key TEXT NOT NULL,
  initiated_via TEXT NOT NULL,                          -- 'app','web','ussd','agent_pos'
  metadata JSONB DEFAULT '{}'::jsonb,                   -- iban/msisdn/agent_id/external_txid/benef details
  scheduled_batch_id UUID NULL,                         -- link to payout batch (bank)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_withdrawals_idem_per_wallet
  ON molam_withdrawals (wallet_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON molam_withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON molam_withdrawals(status);

CREATE TABLE IF NOT EXISTS molam_withdrawal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id UUID NOT NULL REFERENCES molam_withdrawals(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,                     -- 'provider.created','provider.succeeded','provider.failed',...
  raw_payload JSONB NOT NULL,
  signature_valid BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Batches for bank payouts (weekly/monthly consolidation)
CREATE TYPE payout_batch_status AS ENUM ('open','sealed','submitted','settled','partially_settled','failed');

CREATE TABLE IF NOT EXISTS molam_bank_payout_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES molam_payout_providers(id),
  currency TEXT NOT NULL,
  schedule TEXT NOT NULL,                       -- 'weekly' | 'monthly' | 'daily'
  window_start TIMESTAMPTZ NOT NULL,
  window_end   TIMESTAMPTZ NOT NULL,
  status payout_batch_status NOT NULL DEFAULT 'open',
  total_count INT NOT NULL DEFAULT 0,
  total_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reconciliation view
CREATE VIEW v_withdrawal_settlement_summary AS
SELECT
  provider_id,
  currency,
  date_trunc('day', created_at)::date AS day,
  sum(CASE WHEN status='succeeded' THEN amount ELSE 0 END) AS total_gross,
  sum(CASE WHEN status='succeeded' THEN fee_amount ELSE 0 END) AS total_fees,
  sum(CASE WHEN status='succeeded' THEN agent_commission ELSE 0 END) AS total_agent_comm,
  count(*) FILTER (WHERE status='succeeded') AS count_succeeded
FROM molam_withdrawals
GROUP BY provider_id, currency, date_trunc('day', created_at)::date;