-- ============================================================================
-- Brique 123 — Float Snapshots & Auto-Sweep Rules
-- ============================================================================

-- 1) Float snapshots per treasury account
CREATE TABLE IF NOT EXISTS treasury_float_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treasury_account_id UUID NOT NULL REFERENCES treasury_accounts(id),
  snapshot_ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  balance NUMERIC(24,6) NOT NULL,
  reserved NUMERIC(24,6) DEFAULT 0,
  available NUMERIC(24,6) NOT NULL,
  currency CHAR(3) NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tfs_account_ts ON treasury_float_snapshots(treasury_account_id, snapshot_ts DESC);

-- 2) Sweep rules config
CREATE TABLE IF NOT EXISTS sweep_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treasury_account_id UUID REFERENCES treasury_accounts(id),
  currency CHAR(3) NOT NULL,
  min_balance NUMERIC(24,6) NOT NULL,
  target_balance NUMERIC(24,6) NOT NULL,
  max_balance NUMERIC(24,6) NULL,
  auto_execute BOOLEAN NOT NULL DEFAULT true,
  approval_threshold NUMERIC(24,6) NULL,
  cadence TEXT NOT NULL DEFAULT 'hourly',
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_sweep_rules_account ON sweep_rules(treasury_account_id, currency);

-- 3) Sweep plans & executions
CREATE TABLE IF NOT EXISTS sweep_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES sweep_rules(id),
  treasury_account_id UUID NOT NULL REFERENCES treasury_accounts(id),
  action TEXT NOT NULL,
  amount NUMERIC(24,6) NOT NULL,
  currency CHAR(3) NOT NULL,
  suggested_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  approvers JSONB DEFAULT '[]',
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_sweep_plans_status ON sweep_plans(status);

-- 4) Sweep execution logs
CREATE TABLE IF NOT EXISTS sweep_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES sweep_plans(id),
  execution_ref TEXT,
  status TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
