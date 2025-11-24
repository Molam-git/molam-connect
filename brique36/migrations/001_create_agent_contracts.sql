CREATE TABLE IF NOT EXISTS agent_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id BIGINT NOT NULL,
  country TEXT,
  currency TEXT,
  agent_share_pct NUMERIC(5,2) DEFAULT 50.0,
  payout_frequency TEXT DEFAULT 'weekly',
  payout_day TEXT DEFAULT 'MONDAY',
  payout_account JSONB,
  min_payout_amount NUMERIC(18,2) DEFAULT 0,
  reserve_pct NUMERIC(5,2) DEFAULT 5.0,
  dispute_window_days INTEGER DEFAULT 14,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);