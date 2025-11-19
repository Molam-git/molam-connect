-- ============================================================================
-- Brique 124 — Treasury Ops UI: Generate Plan / Execute / Rollback
-- ============================================================================

CREATE TABLE IF NOT EXISTS treasury_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_type TEXT NOT NULL,
  origin TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  priority INTEGER DEFAULT 100,
  metadata JSONB,
  approvers JSONB DEFAULT '[]',
  required_approvals JSONB DEFAULT '[]',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_treasury_plans_status ON treasury_plans(status);

CREATE TABLE IF NOT EXISTS treasury_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES treasury_plans(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  treasury_account_id UUID,
  amount NUMERIC(24,6),
  currency CHAR(3),
  target JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS treasury_plan_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES treasury_plans(id),
  actor TEXT,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS treasury_plan_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES treasury_plans(id),
  user_id UUID NOT NULL,
  role TEXT NOT NULL,
  decision TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
