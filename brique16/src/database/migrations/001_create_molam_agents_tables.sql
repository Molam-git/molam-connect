-- Migration: Create molam_agents tables

-- 1. Table des agents
CREATE TABLE IF NOT EXISTS molam_agents (
  agent_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL,
  status           TEXT NOT NULL DEFAULT 'PENDING',
  kyc_level        TEXT NOT NULL DEFAULT 'UNVERIFIED',
  commission_rate  NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  payout_cycle     TEXT NOT NULL DEFAULT 'WEEKLY',
  country_code     TEXT NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'USD',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- 2. Points physiques liés à un agent
CREATE TABLE IF NOT EXISTS agent_locations (
  location_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         UUID NOT NULL REFERENCES molam_agents(agent_id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  address          TEXT NOT NULL,
  city             TEXT NOT NULL,
  latitude         NUMERIC(10,6),
  longitude        NUMERIC(10,6),
  open_hours       JSONB,
  services         TEXT[] NOT NULL DEFAULT ARRAY['CASHIN','CASHOUT'],
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Wallet de l'agent (float)
CREATE TABLE IF NOT EXISTS agent_wallets (
  wallet_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         UUID NOT NULL REFERENCES molam_agents(agent_id) ON DELETE CASCADE,
  balance          NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency         TEXT NOT NULL DEFAULT 'USD',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Transactions agent (cash-in/out)
CREATE TABLE IF NOT EXISTS agent_transactions (
  tx_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         UUID NOT NULL REFERENCES molam_agents(agent_id) ON DELETE CASCADE,
  user_id          UUID NOT NULL,
  type             TEXT NOT NULL,
  amount           NUMERIC(18,2) NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'USD',
  commission       NUMERIC(18,2) NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'PENDING',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Commissions cumulées
CREATE TABLE IF NOT EXISTS agent_commissions (
  commission_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         UUID NOT NULL REFERENCES molam_agents(agent_id) ON DELETE CASCADE,
  amount           NUMERIC(18,2) NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'USD',
  source_tx_id     UUID NOT NULL REFERENCES agent_transactions(tx_id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Payouts agents
CREATE TABLE IF NOT EXISTS agent_payouts (
  payout_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         UUID NOT NULL REFERENCES molam_agents(agent_id) ON DELETE CASCADE,
  amount           NUMERIC(18,2) NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'USD',
  status           TEXT NOT NULL DEFAULT 'PENDING',
  scheduled_for    TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes pour les performances
CREATE INDEX IF NOT EXISTS idx_agent_locations_agent_id ON agent_locations(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_wallets_agent_id ON agent_wallets(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_transactions_agent_id ON agent_transactions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_transactions_created_at ON agent_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_agent_id ON agent_commissions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_payouts_agent_id ON agent_payouts(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_payouts_scheduled_for ON agent_payouts(scheduled_for);

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_molam_agents_updated_at BEFORE UPDATE ON molam_agents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agent_wallets_updated_at BEFORE UPDATE ON agent_wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();