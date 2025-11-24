-- Table des meta-frais
CREATE TABLE IF NOT EXISTS wallet_tx_fees (
  tx_id          UUID PRIMARY KEY REFERENCES wallet_transactions(id) ON DELETE CASCADE,
  molam_fee      NUMERIC(24,8) NOT NULL DEFAULT 0,
  partner_fee    NUMERIC(24,8) NOT NULL DEFAULT 0,
  agent_share    NUMERIC(24,8) NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL,
  breakdown      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table des refunds
CREATE TABLE IF NOT EXISTS wallet_tx_refunds (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_id          UUID NOT NULL REFERENCES wallet_transactions(id) ON DELETE CASCADE,
  refunded_amount NUMERIC(24,8) NOT NULL,
  currency       TEXT NOT NULL,
  reason         TEXT,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour les refunds
CREATE INDEX IF NOT EXISTS ix_refunds_tx ON wallet_tx_refunds (tx_id, created_at);
CREATE INDEX IF NOT EXISTS ix_refunds_created ON wallet_tx_refunds (created_at);