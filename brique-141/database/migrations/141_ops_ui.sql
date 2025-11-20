/**
 * BRIQUE 141 — Ops UI
 * Plans opérationnels, approbations multi-sig, journal immutable
 */

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) Ops plans
CREATE TABLE IF NOT EXISTS ops_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE, -- client-provided idempotency key
  name TEXT NOT NULL,
  description TEXT,
  originator UUID NOT NULL, -- user id
  plan_type TEXT NOT NULL CHECK (plan_type IN ('payout_batch','sweep','failover','freeze','pause_bank','custom')),
  payload JSONB NOT NULL, -- canonical plan descriptor
  estimated_impact JSONB, -- from SIRA or simulation
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','staged','approved','executing','completed','failed','rolled_back','cancelled')),
  required_approvals INTEGER DEFAULT 1,
  approvals JSONB DEFAULT '[]'::jsonb, -- [{user_id, role, approved_at, signature}]
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2) Ops plan runs (executions)
CREATE TABLE IF NOT EXISTS ops_plan_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES ops_plans(id) ON DELETE CASCADE,
  run_at TIMESTAMPTZ DEFAULT now(),
  run_by UUID,
  run_mode TEXT NOT NULL DEFAULT 'auto' CHECK (run_mode IN ('auto','manual','dry_run')),
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued','running','success','partial','failed','rolled_back')),
  result JSONB, -- metrics, affected payouts, errors
  rollback_triggered BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 3) Ops immutable journal (append-only)
CREATE TABLE IF NOT EXISTS ops_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES ops_plans(id),
  actor UUID,
  role TEXT,
  action TEXT NOT NULL CHECK (action IN ('create','stage','approve','execute','rollback','freeze','pause_bank','unfreeze','cancel','complete','fail')),
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4) Indexes
CREATE INDEX IF NOT EXISTS idx_ops_plans_status ON ops_plans(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_plans_originator ON ops_plans(originator, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_plan_runs_plan ON ops_plan_runs(plan_id, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_journal_plan ON ops_journal(plan_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_ops_journal_actor ON ops_journal(actor, created_at DESC);

-- 5) View for dashboard
CREATE OR REPLACE VIEW ops_plans_summary AS
SELECT
  p.id,
  p.external_id,
  p.name,
  p.plan_type,
  p.status,
  p.required_approvals,
  jsonb_array_length(COALESCE(p.approvals, '[]'::jsonb)) as approvals_count,
  p.estimated_impact,
  p.created_at,
  p.updated_at,
  (SELECT COUNT(*) FROM ops_plan_runs WHERE plan_id = p.id) as runs_count,
  (SELECT COUNT(*) FROM ops_plan_runs WHERE plan_id = p.id AND status = 'success') as successful_runs
FROM ops_plans p
ORDER BY p.created_at DESC;
