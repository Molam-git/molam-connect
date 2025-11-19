-- ============================================================================
-- Brique 131 - Commissions Engine Schema
-- ============================================================================

-- 1) Fee rules / config (editable by Ops)
CREATE TABLE IF NOT EXISTS fee_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  module TEXT NOT NULL CHECK (module IN ('wallet','connect')),
  event_type TEXT NOT NULL CHECK (event_type IN ('p2p','cashin_self','cashin_other','cashout','merchant_payment','payout_instant','fx','bill_payment','topup')),
  country TEXT,                   -- optional: country code or NULL for global
  currency TEXT,                  -- optional currency filter
  percent NUMERIC(6,4) NOT NULL DEFAULT 0.0,   -- e.g. 0.009 for 0.9%
  fixed_amount NUMERIC(18,4) NOT NULL DEFAULT 0.0, -- in rule currency
  min_amount NUMERIC(18,4),       -- min fee
  max_amount NUMERIC(18,4),       -- cap fee
  apply_to_sender BOOLEAN DEFAULT TRUE,
  apply_to_receiver BOOLEAN DEFAULT FALSE,
  agent_share_percent NUMERIC(6,4) DEFAULT 0.0 CHECK (agent_share_percent BETWEEN 0 AND 1), -- portion to agent if any
  active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 10,    -- higher precedence
  valid_from TIMESTAMPTZ DEFAULT now(),
  valid_until TIMESTAMPTZ,        -- for promotions
  metadata JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fee_rules_lookup ON fee_rules(module, event_type, active, priority DESC) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_fee_rules_country ON fee_rules(country) WHERE country IS NOT NULL;

-- 2) Fee lines generated per transaction (immutable audit)
CREATE TABLE IF NOT EXISTS fee_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL,    -- wallet_txn or payment id
  event_type TEXT NOT NULL,
  rule_id UUID REFERENCES fee_rules(id),
  currency TEXT NOT NULL,
  amount NUMERIC(18,4) NOT NULL,   -- fee amount charged (positive)
  percent_applied NUMERIC(6,4),
  fixed_applied NUMERIC(18,4),
  agent_id BIGINT,                 -- optional
  split_agent_amount NUMERIC(18,4) DEFAULT 0,
  split_molam_amount NUMERIC(18,4) DEFAULT 0,
  ledger_entry_id UUID,            -- link to ledger
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fee_lines_txn ON fee_lines(transaction_id);
CREATE INDEX IF NOT EXISTS idx_fee_lines_created ON fee_lines(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fee_lines_agent ON fee_lines(agent_id) WHERE agent_id IS NOT NULL;

-- 3) Fee rates history for audit + benchmarking
CREATE TABLE IF NOT EXISTS fee_rates_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES fee_rules(id),
  changed_by UUID,
  old_percent NUMERIC(6,4),
  old_fixed NUMERIC(18,4),
  new_percent NUMERIC(6,4),
  new_fixed NUMERIC(18,4),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fee_history_rule ON fee_rates_history(rule_id, created_at DESC);

-- 4) Fee metadata per merchant / account override
CREATE TABLE IF NOT EXISTS fee_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('merchant','agent','user')),
  target_id UUID NOT NULL,
  rule_id UUID REFERENCES fee_rules(id),
  override_percent NUMERIC(6,4),
  override_fixed NUMERIC(18,4),
  active BOOLEAN DEFAULT TRUE,
  valid_from TIMESTAMPTZ DEFAULT now(),
  valid_until TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fee_overrides_target ON fee_overrides(target_type, target_id, active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_fee_overrides_rule ON fee_overrides(rule_id);

-- Seed default rules (Molam pricing: ~10% cheaper than Stripe)
INSERT INTO fee_rules(name, module, event_type, percent, fixed_amount, active, priority) VALUES
  ('Global P2P Fee', 'wallet', 'p2p', 0.0090, 0, true, 100),
  ('Global Merchant Payment (USD)', 'connect', 'merchant_payment', 0.0225, 0.23, true, 100),
  ('FX Conversion Fee', 'wallet', 'fx', 0.0050, 0, true, 100),
  ('Instant Payout Fee', 'connect', 'payout_instant', 0.0100, 0.50, true, 100),
  ('Cash-in Other (agent-assisted)', 'wallet', 'cashin_other', 0.0050, 0, true, 50),
  ('Bill Payment Fee', 'wallet', 'bill_payment', 0.0000, 0, true, 50),
  ('Topup Fee', 'wallet', 'topup', 0.0000, 0, true, 50)
ON CONFLICT DO NOTHING;
