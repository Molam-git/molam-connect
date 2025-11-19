-- ============================================================================
-- Brique 134 - Ops Controls & Widgets Schema
-- Date: 2025-01-18
-- Description: Tables for ops actions, treasury controls, and widget state
-- ============================================================================

-- 1) Ops actions audit log
CREATE TABLE IF NOT EXISTS ops_actions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL,                    -- Who performed the action (Molam ID)
  actor_role TEXT NOT NULL,                  -- Role at time of action
  action_type TEXT NOT NULL CHECK (action_type IN (
    'freeze_payouts','unfreeze_payouts','generate_plan','execute_plan',
    'retry_payout','mark_dispute','pause_bank','resume_bank','override_routing'
  )),
  target JSONB,                              -- Target details (e.g., {bank_profile_id, payout_id})
  idempotency_key TEXT UNIQUE,               -- Prevent duplicate actions
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested','accepted','rejected','executed','failed','cancelled'
  )),
  details JSONB,                             -- Additional context, results, errors
  ip_address TEXT,                           -- Request IP for audit
  user_agent TEXT,                           -- Request user agent
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_actions_log_actor ON ops_actions_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_actions_log_type ON ops_actions_log(action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_actions_log_status ON ops_actions_log(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_actions_log_idempotency ON ops_actions_log(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 2) Treasury controls (feature flags and freeze states)
CREATE TABLE IF NOT EXISTS treasury_controls (
  key TEXT PRIMARY KEY,                      -- Control identifier (e.g., 'freeze_global', 'freeze_bank_xxx')
  value JSONB NOT NULL,                      -- Control value and metadata
  enabled BOOLEAN DEFAULT true,              -- Whether control is active
  expires_at TIMESTAMPTZ,                    -- Auto-expiry for temporary controls
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_treasury_controls_enabled ON treasury_controls(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_treasury_controls_expires ON treasury_controls(expires_at) WHERE expires_at IS NOT NULL;

-- 3) SIRA plans storage
CREATE TABLE IF NOT EXISTS sira_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_type TEXT NOT NULL,                   -- 'routing_optimization','float_rebalance','risk_mitigation'
  generated_by UUID NOT NULL,                -- Who requested the plan
  plan_data JSONB NOT NULL,                  -- Full plan details from SIRA
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','executed','expired')),
  approval_required BOOLEAN DEFAULT false,   -- Whether multi-sig approval needed
  approvals JSONB DEFAULT '[]'::jsonb,       -- Array of {user_id, approved_at, role}
  executed_by UUID,
  executed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sira_plans_status ON sira_plans(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sira_plans_generated_by ON sira_plans(generated_by);

-- 4) Widget state persistence (for user-specific widget configs)
CREATE TABLE IF NOT EXISTS widget_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  widget_type TEXT NOT NULL,                 -- 'balance','payout_summary','bank_health','sira_suggestions'
  state JSONB DEFAULT '{}'::jsonb,           -- Widget-specific state
  preferences JSONB DEFAULT '{}'::jsonb,     -- User preferences (refresh rate, display mode)
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_widget_states_user_type ON widget_states(user_id, widget_type);

-- 5) Multi-sig approval tracking
CREATE TABLE IF NOT EXISTS multi_sig_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL,
  action_reference UUID NOT NULL,            -- Reference to ops_actions_log.id or sira_plans.id
  required_approvals INTEGER DEFAULT 2,      -- Number of approvals needed
  current_approvals INTEGER DEFAULT 0,
  approvers JSONB DEFAULT '[]'::jsonb,       -- Array of {user_id, role, approved_at, signature}
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_multi_sig_action_ref ON multi_sig_approvals(action_reference);
CREATE INDEX IF NOT EXISTS idx_multi_sig_status ON multi_sig_approvals(status) WHERE status = 'pending';

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_ops_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER trg_ops_actions_updated_at
  BEFORE UPDATE ON ops_actions_log
  FOR EACH ROW
  EXECUTE FUNCTION update_ops_updated_at();

CREATE TRIGGER trg_treasury_controls_updated_at
  BEFORE UPDATE ON treasury_controls
  FOR EACH ROW
  EXECUTE FUNCTION update_ops_updated_at();

-- Comments
COMMENT ON TABLE ops_actions_log IS 'Immutable audit log of all ops control actions';
COMMENT ON TABLE treasury_controls IS 'Feature flags and control states for treasury operations';
COMMENT ON TABLE sira_plans IS 'SIRA-generated operational plans with approval tracking';
COMMENT ON TABLE widget_states IS 'User-specific widget configurations and state';
COMMENT ON TABLE multi_sig_approvals IS 'Multi-signature approval tracking for sensitive operations';
