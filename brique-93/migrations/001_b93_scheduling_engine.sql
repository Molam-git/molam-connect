-- Brique 93 — Payout Scheduling & Priority Engine
-- Industrial scheduling system for batch planning, prioritization, and execution
-- Author: Molam Platform Team
-- Date: 2025-01-14

-- ============================================================================
-- 1. PAYOUT WINDOWS (Settlement Windows per Bank/Treasury Account)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Bank & Treasury Account
  bank_profile_id UUID NOT NULL, -- REFERENCES bank_profiles(id) in B34
  treasury_account_id UUID, -- REFERENCES treasury_accounts(id) in B34
  currency TEXT NOT NULL,

  -- Timezone & Cutoff
  timezone TEXT NOT NULL DEFAULT 'UTC',
  cutoff_time TIME NOT NULL, -- Local cutoff time (e.g., '16:00:00')
  settlement_delay_days INTEGER NOT NULL DEFAULT 1, -- Days after cutoff

  -- Rails & Capabilities
  rails JSONB, -- Allowed rails: ["swift", "sepa", "instant", "local"]
  is_instant BOOLEAN DEFAULT false,
  max_batch_size INTEGER DEFAULT 1000,

  -- Capacity & Limits
  daily_capacity_amount NUMERIC(18,2), -- Max daily amount
  daily_capacity_count INTEGER, -- Max daily transactions

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  metadata JSONB,
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_windows_bank_treasury
  ON payout_windows(bank_profile_id, treasury_account_id, currency);

CREATE INDEX IF NOT EXISTS idx_windows_active
  ON payout_windows(is_active, cutoff_time);

-- ============================================================================
-- 2. PAYOUT BATCH PLANS (Simulation & Planning)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_batch_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Plan Reference
  plan_reference TEXT UNIQUE NOT NULL,

  -- Creator & Scheduling
  created_by UUID,
  planned_for TIMESTAMPTZ NOT NULL, -- Planned execution time (UTC)

  -- Routing & Accounts
  treasury_account_id UUID, -- REFERENCES treasury_accounts(id)
  bank_profile_id UUID, -- REFERENCES bank_profiles(id)
  currency TEXT NOT NULL,
  window_id UUID REFERENCES payout_windows(id),

  -- Items & Estimates
  items JSONB NOT NULL, -- Array of {payout_id, amount, currency, routing}
  item_count INTEGER NOT NULL,
  estimated_total NUMERIC(18,2) NOT NULL,
  estimated_fees JSONB, -- {molam_fee, bank_fee, total}

  -- SIRA Evaluation
  sira_score NUMERIC(5,2), -- 0.00 to 1.00 (confidence score)
  sira_recommendation JSONB, -- Full SIRA response

  -- Status & Approvals
  status TEXT DEFAULT 'draft', -- draft|pending_approval|approved|rejected|executing|executed|cancelled|failed
  requires_approval BOOLEAN DEFAULT false,
  approval_threshold NUMERIC(18,2),

  -- Execution Tracking
  batch_id UUID, -- Link to payout_batches once executed
  executed_at TIMESTAMPTZ,
  executed_by UUID,

  -- Error Handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Metadata
  metadata JSONB,
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_plans_status
  ON payout_batch_plans(status, planned_for);

CREATE INDEX IF NOT EXISTS idx_plans_treasury
  ON payout_batch_plans(treasury_account_id, currency, planned_for);

CREATE INDEX IF NOT EXISTS idx_plans_window
  ON payout_batch_plans(window_id, status);

-- ============================================================================
-- 3. PAYOUT SCHEDULES (Payout → Plan Mapping)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  payout_id UUID NOT NULL, -- REFERENCES payouts(id) in B92
  plan_id UUID REFERENCES payout_batch_plans(id),
  window_id UUID REFERENCES payout_windows(id),

  -- Scheduling
  scheduled_at TIMESTAMPTZ NOT NULL,
  original_scheduled_at TIMESTAMPTZ, -- Track if rescheduled
  priority SMALLINT DEFAULT 10, -- Lower = higher priority

  -- Status
  status TEXT DEFAULT 'scheduled', -- scheduled|moved|executed|cancelled|failed

  -- Routing Override
  routing_override JSONB, -- Manual routing if needed

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  executed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  -- Unique constraint: one active schedule per payout
  UNIQUE(payout_id, status) WHERE status = 'scheduled'
);

CREATE INDEX IF NOT EXISTS idx_schedules_scheduled_at
  ON payout_schedules(scheduled_at, status);

CREATE INDEX IF NOT EXISTS idx_schedules_payout
  ON payout_schedules(payout_id, status);

CREATE INDEX IF NOT EXISTS idx_schedules_plan
  ON payout_schedules(plan_id, status);

-- ============================================================================
-- 4. APPROVALS (Multi-Sig Approval System)
-- ============================================================================

CREATE TABLE IF NOT EXISTS approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Subject
  entity_type TEXT NOT NULL, -- 'batch_plan', 'bank_profile', 'sweep_rule', etc.
  entity_id UUID NOT NULL,

  -- Approval Requirements
  required_count SMALLINT NOT NULL DEFAULT 2,
  required_roles TEXT[], -- Required roles (e.g., ['finance_ops', 'treasury_manager'])

  -- Approval Records
  approvals JSONB, -- Array of {actor_id, actor_name, role, approved_at, signature}

  -- Status
  status TEXT DEFAULT 'pending', -- pending|approved|rejected|expired

  -- Expiration
  expires_at TIMESTAMPTZ,

  -- Rejection
  rejected_by UUID,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Metadata
  metadata JSONB,
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approvals_entity
  ON approvals(entity_type, entity_id, status);

CREATE INDEX IF NOT EXISTS idx_approvals_status
  ON approvals(status, expires_at);

-- ============================================================================
-- 5. PRIORITY RULES (Priority-based Routing Rules)
-- ============================================================================

CREATE TABLE IF NOT EXISTS priority_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Priority Configuration
  priority_name TEXT UNIQUE NOT NULL, -- 'instant', 'express', 'standard', 'economy'
  priority_level SMALLINT NOT NULL, -- 1=highest, 100=lowest

  -- Timing
  max_delay_hours INTEGER, -- Max acceptable delay
  sla_hours INTEGER, -- SLA commitment

  -- Cost
  fee_multiplier NUMERIC(5,2) DEFAULT 1.0, -- Multiplier for fees
  min_fee NUMERIC(18,2),

  -- Routing Preferences
  preferred_rails TEXT[], -- ['instant', 'swift', 'sepa']
  fallback_rails TEXT[],

  -- Limits
  max_amount NUMERIC(18,2), -- Max amount for this priority
  min_amount NUMERIC(18,2), -- Min amount for this priority

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  metadata JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 6. QUOTAS & RATE LIMITS (Per-tenant/Bank Limits)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  scope_type TEXT NOT NULL, -- 'tenant', 'merchant', 'bank', 'treasury_account'
  scope_id UUID NOT NULL,

  -- Period
  period TEXT NOT NULL, -- 'daily', 'hourly', 'monthly'

  -- Limits
  max_amount NUMERIC(18,2),
  max_count INTEGER,
  max_qps INTEGER, -- Queries per second

  -- Current Usage (reset periodically)
  current_amount NUMERIC(18,2) DEFAULT 0,
  current_count INTEGER DEFAULT 0,
  period_start TIMESTAMPTZ DEFAULT now(),

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(scope_type, scope_id, period)
);

CREATE INDEX IF NOT EXISTS idx_quotas_scope
  ON payout_quotas(scope_type, scope_id, is_active);

-- ============================================================================
-- 7. SCHEDULING HISTORY (Audit & Decisions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS scheduling_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Subject
  payout_id UUID,
  plan_id UUID,
  window_id UUID,

  -- Action
  action TEXT NOT NULL, -- 'allocated', 'rescheduled', 'expedited', 'cancelled'
  actor_type TEXT NOT NULL, -- 'system', 'user', 'daemon'
  actor_id TEXT,

  -- Decision Details
  decision_reason TEXT,
  previous_scheduled_at TIMESTAMPTZ,
  new_scheduled_at TIMESTAMPTZ,

  -- Context
  metadata JSONB,

  -- Timestamp (immutable)
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sched_history_payout
  ON scheduling_history(payout_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sched_history_plan
  ON scheduling_history(plan_id, created_at DESC);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to compute next settlement window
CREATE OR REPLACE FUNCTION compute_next_window(
  p_cutoff_time TIME,
  p_timezone TEXT,
  p_settlement_delay_days INTEGER
) RETURNS TIMESTAMPTZ AS $$
DECLARE
  local_now TIMESTAMPTZ;
  local_date DATE;
  cutoff_today TIMESTAMPTZ;
  result TIMESTAMPTZ;
BEGIN
  -- Get current time in target timezone
  local_now := now() AT TIME ZONE p_timezone;
  local_date := local_now::DATE;

  -- Calculate today's cutoff
  cutoff_today := (local_date || ' ' || p_cutoff_time)::TIMESTAMP AT TIME ZONE p_timezone;

  -- If we're past today's cutoff, use tomorrow's
  IF local_now > cutoff_today THEN
    cutoff_today := cutoff_today + INTERVAL '1 day';
  END IF;

  -- Add settlement delay
  result := cutoff_today + make_interval(days => p_settlement_delay_days);

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to check if approval is complete
CREATE OR REPLACE FUNCTION is_approval_complete(p_approval_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  approval_record RECORD;
  approval_count INTEGER;
BEGIN
  SELECT * INTO approval_record
  FROM approvals
  WHERE id = p_approval_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Count approvals in JSONB array
  SELECT jsonb_array_length(COALESCE(approval_record.approvals, '[]'::jsonb))
  INTO approval_count;

  RETURN approval_count >= approval_record.required_count;
END;
$$ LANGUAGE plpgsql;

-- Function to generate plan reference
CREATE OR REPLACE FUNCTION generate_plan_reference() RETURNS TEXT AS $$
DECLARE
  date_part TEXT;
  random_part TEXT;
BEGIN
  date_part := to_char(now(), 'YYYYMMDD');
  random_part := upper(substring(md5(random()::text) from 1 for 8));
  RETURN 'PLAN-' || date_part || '-' || random_part;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_payout_windows_updated_at BEFORE UPDATE ON payout_windows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payout_batch_plans_updated_at BEFORE UPDATE ON payout_batch_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payout_schedules_updated_at BEFORE UPDATE ON payout_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_approvals_updated_at BEFORE UPDATE ON approvals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_priority_rules_updated_at BEFORE UPDATE ON priority_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payout_quotas_updated_at BEFORE UPDATE ON payout_quotas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-generate plan reference
CREATE OR REPLACE FUNCTION auto_generate_plan_reference()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.plan_reference IS NULL THEN
    NEW.plan_reference := generate_plan_reference();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_plan_reference BEFORE INSERT ON payout_batch_plans
  FOR EACH ROW EXECUTE FUNCTION auto_generate_plan_reference();

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Insert default priority rules
INSERT INTO priority_rules (priority_name, priority_level, max_delay_hours, sla_hours, fee_multiplier, preferred_rails)
VALUES
  ('instant', 1, 1, 1, 2.0, ARRAY['instant', 'swift']),
  ('express', 5, 4, 4, 1.5, ARRAY['swift', 'instant', 'sepa']),
  ('standard', 10, 24, 24, 1.0, ARRAY['sepa', 'swift', 'local']),
  ('economy', 20, 72, 72, 0.8, ARRAY['local', 'sepa'])
ON CONFLICT (priority_name) DO NOTHING;

-- Insert sample payout window (UTC, 4 PM cutoff, T+1 settlement)
INSERT INTO payout_windows (
  bank_profile_id,
  treasury_account_id,
  currency,
  timezone,
  cutoff_time,
  settlement_delay_days,
  rails,
  is_instant,
  max_batch_size
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID, -- Placeholder
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID,
  'USD',
  'UTC',
  '16:00:00',
  1,
  '["swift", "sepa", "instant"]'::jsonb,
  false,
  1000
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- MATERIALIZED VIEW: Scheduling Statistics
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS scheduling_statistics AS
SELECT
  date_trunc('hour', planned_for) as hour,
  treasury_account_id,
  currency,
  status,
  COUNT(*) as plan_count,
  SUM(item_count) as total_items,
  SUM(estimated_total) as total_amount,
  AVG(sira_score) as avg_sira_score,
  COUNT(*) FILTER (WHERE requires_approval) as approval_required_count
FROM payout_batch_plans
WHERE created_at > now() - INTERVAL '7 days'
GROUP BY 1, 2, 3, 4;

CREATE UNIQUE INDEX ON scheduling_statistics(hour, treasury_account_id, currency, status);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE payout_windows IS 'Settlement windows per bank/treasury account with cutoff times';
COMMENT ON TABLE payout_batch_plans IS 'Batch plans with simulation, routing, and approval tracking';
COMMENT ON TABLE payout_schedules IS 'Mapping of payouts to plans and scheduling decisions';
COMMENT ON TABLE approvals IS 'Multi-signature approval system';
COMMENT ON TABLE priority_rules IS 'Priority-based routing and SLA rules';
COMMENT ON TABLE payout_quotas IS 'Rate limits and quotas per tenant/bank';
COMMENT ON TABLE scheduling_history IS 'Immutable audit trail of scheduling decisions';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
