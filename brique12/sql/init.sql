-- 1) Enum & types
DO $$ BEGIN
  CREATE TYPE reward_kind AS ENUM ('cashback', 'points', 'voucher');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE reward_status AS ENUM ('pending','confirmed','cancelled','clawed_back','debt_created');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Pool système pour provisioning rewards (par devise/pays)
CREATE TABLE IF NOT EXISTS molam_system_wallets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE NOT NULL,
  country_code    TEXT NOT NULL,
  currency        TEXT NOT NULL,
  balance         NUMERIC(24,8) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_pool_country_currency
  ON molam_system_wallets(country_code, currency);

-- Seed pool USD global par défaut
INSERT INTO molam_system_wallets (code, country_code, currency, balance)
VALUES ('rewards-pool-usd','US','USD',1000000)
ON CONFLICT (code) DO NOTHING;

-- 3) Règles de rewards
CREATE TABLE IF NOT EXISTS molam_reward_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  kind              reward_kind NOT NULL,
  country_code      TEXT,
  currency          TEXT,
  channel           TEXT,
  merchant_id       UUID,
  mcc               TEXT,
  min_amount        NUMERIC(24,8) DEFAULT 0,
  percent           NUMERIC(8,4),
  fixed_amount      NUMERIC(24,8),
  cap_per_tx        NUMERIC(24,8) DEFAULT 0,
  daily_user_cap    NUMERIC(24,8) DEFAULT 0,
  start_at          TIMESTAMPTZ NOT NULL,
  end_at            TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (percent IS NOT NULL OR fixed_amount IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ix_rules_active ON molam_reward_rules(is_active,start_at,end_at);

-- 4) Attribution utilisateur
CREATE TABLE IF NOT EXISTS molam_user_rewards (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  tx_id             UUID NOT NULL,
  rule_id           UUID NOT NULL REFERENCES molam_reward_rules(id),
  kind              reward_kind NOT NULL,
  amount            NUMERIC(24,8) NOT NULL,
  currency          TEXT NOT NULL,
  country_code      TEXT NOT NULL,
  status            reward_status NOT NULL DEFAULT 'pending',
  pending_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at      TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  clawed_back_at    TIMESTAMPTZ,
  notes             JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS ix_user_rewards_user ON molam_user_rewards(user_id,status);
CREATE UNIQUE INDEX IF NOT EXISTS ux_reward_per_tx_rule ON molam_user_rewards(tx_id,rule_id);

-- 5) Ledger (double-entry) minimal pour rewards
CREATE TABLE IF NOT EXISTS molam_reward_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event           TEXT NOT NULL,
  user_id         UUID,
  tx_id           UUID,
  reward_id       UUID REFERENCES molam_user_rewards(id),
  debit_pool      NUMERIC(24,8) DEFAULT 0,
  credit_user     NUMERIC(24,8) DEFAULT 0,
  debit_user      NUMERIC(24,8) DEFAULT 0,
  credit_pool     NUMERIC(24,8) DEFAULT 0,
  currency        TEXT NOT NULL,
  country_code    TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta            JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 6) Créances si solde user insuffisant au clawback
CREATE TABLE IF NOT EXISTS molam_reward_debts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  reward_id       UUID NOT NULL REFERENCES molam_user_rewards(id),
  amount_due      NUMERIC(24,8) NOT NULL,
  currency        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at      TIMESTAMPTZ
);

-- 7) Vues d'audit
CREATE OR REPLACE VIEW v_rewards_summary AS
SELECT user_id, currency,
       COUNT(*) FILTER (WHERE status='confirmed') as confirmed_cnt,
       SUM(amount) FILTER (WHERE status='confirmed') as confirmed_amt,
       COUNT(*) FILTER (WHERE status='clawed_back') as claw_cnt,
       SUM(amount) FILTER (WHERE status='clawed_back') as claw_amt
FROM molam_user_rewards
GROUP BY user_id, currency;