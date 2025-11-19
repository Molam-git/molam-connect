-- Create SIRA tables: float_recommendations & float_actions_log
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS float_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_account_id UUID NOT NULL,
  currency TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  reason JSONB NOT NULL,
  sira_score NUMERIC(6,4),
  status TEXT NOT NULL DEFAULT 'suggested',
  created_by TEXT,
  approved_by JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_float_reco_status ON float_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_float_reco_target ON float_recommendations(target_account_id);

CREATE TABLE IF NOT EXISTS float_actions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID REFERENCES float_recommendations(id),
  action_type TEXT NOT NULL,
  payload JSONB,
  result JSONB,
  executed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_float_actions_reco ON float_actions_log(recommendation_id);

-- Additional snapshot table if missing (minimal)
CREATE TABLE IF NOT EXISTS treasury_float_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treasury_account_id UUID NOT NULL,
  snapshot_ts TIMESTAMPTZ DEFAULT now(),
  balance NUMERIC(18,2) NOT NULL,
  reserved NUMERIC(18,2) DEFAULT 0,
  available NUMERIC(18,2) NOT NULL,
  currency TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Minimal treasury_accounts for tests (if not exists in your schema)
CREATE TABLE IF NOT EXISTS treasury_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_profile_id UUID,
  currency TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'operational',
  ledger_account_code TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

