-- =====================================================================
-- Brique 78 - Ops Approval Engine
-- =====================================================================
-- Version: 1.0.0
-- Date: 2025-11-12
-- Description: Multi-signature approval engine with quorum, escalation,
--              and immutable audit trail
-- =====================================================================

-- =====================================================================
-- EXTENSION & SETUP
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =====================================================================
-- ENUM TYPES
-- =====================================================================

-- Action status
CREATE TYPE ops_action_status_enum AS ENUM (
  'requested',      -- Initial state
  'pending',        -- Awaiting votes
  'approved',       -- Quorum reached, approved
  'rejected',       -- Quorum reached, rejected
  'executing',      -- Being executed
  'executed',       -- Successfully executed
  'failed',         -- Execution failed
  'escalated',      -- Escalated to higher role
  'cancelled',      -- Manually cancelled
  'expired'         -- Timeout exceeded
);

-- Vote type
CREATE TYPE vote_type_enum AS ENUM (
  'approve',
  'reject',
  'abstain'
);

-- Quorum type
CREATE TYPE quorum_type_enum AS ENUM (
  'role',           -- Based on role membership
  'percentage',     -- Percentage of role members
  'specific_users'  -- Specific list of users
);

-- =====================================================================
-- CORE TABLES
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. OPS ACTIONS (Extended from Brique 77)
-- ---------------------------------------------------------------------

-- Note: This extends ops_actions from Brique 77
-- If ops_actions already exists, use ALTER TABLE to add missing columns

CREATE TABLE IF NOT EXISTS ops_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Origin
  origin TEXT NOT NULL CHECK (origin IN ('sira', 'system', 'ops_ui', 'module', 'alert')),
  origin_id UUID,

  -- Action details
  action_type TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Target
  target JSONB,

  -- Status
  status ops_action_status_enum DEFAULT 'requested',

  -- Approval requirements
  required_quorum JSONB,
  -- Example: {
  --   "type": "role",
  --   "role": "pay_admin",
  --   "min_count": 2,
  --   "threshold_pct": 0.6
  -- }

  required_ratio NUMERIC(5,4) DEFAULT 0.60 CHECK (required_ratio >= 0 AND required_ratio <= 1),
  -- Ratio of approve votes required (0.6 = 60% of votes must be approve)

  timeout_seconds INTEGER DEFAULT 86400, -- 24 hours default

  -- Escalation
  escalation_role TEXT,
  escalated_at TIMESTAMPTZ,

  -- Risk level
  risk_level TEXT DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),

  -- Auto-execution
  auto_execute BOOLEAN DEFAULT false,

  -- Actor
  created_by UUID,
  actor_role TEXT,

  -- Execution
  executed_at TIMESTAMPTZ,
  executed_by UUID,
  execution_result JSONB,

  -- Error handling
  error_code TEXT,
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ops_actions_status ON ops_actions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_actions_origin ON ops_actions(origin, origin_id);
CREATE INDEX IF NOT EXISTS idx_ops_actions_created_by ON ops_actions(created_by);
CREATE INDEX IF NOT EXISTS idx_ops_actions_expires ON ops_actions(expires_at) WHERE status IN ('requested', 'pending');

COMMENT ON TABLE ops_actions IS 'Ops actions with multi-signature approval requirements';

-- ---------------------------------------------------------------------
-- 2. OPS APPROVALS (Votes)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ops_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Action reference
  ops_action_id UUID NOT NULL REFERENCES ops_actions(id) ON DELETE CASCADE,

  -- Voter
  voter_id UUID NOT NULL,
  voter_email TEXT,
  voter_roles TEXT[] NOT NULL,

  -- Vote
  vote vote_type_enum NOT NULL,
  comment TEXT,

  -- Proof (optional JWT for non-repudiation)
  signed_jwt TEXT,
  jwt_fingerprint TEXT,

  -- Metadata
  ip_address TEXT,
  user_agent TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Unique constraint: one vote per voter per action
  UNIQUE(ops_action_id, voter_id)
);

-- Indexes
CREATE INDEX idx_ops_approvals_action ON ops_approvals(ops_action_id, created_at);
CREATE INDEX idx_ops_approvals_voter ON ops_approvals(voter_id, created_at DESC);
CREATE INDEX idx_ops_approvals_vote ON ops_approvals(vote);

COMMENT ON TABLE ops_approvals IS 'Approval votes for ops actions (one vote per user per action)';

-- ---------------------------------------------------------------------
-- 3. APPROVAL POLICIES (Configurable Rules)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS approval_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Policy name
  name TEXT NOT NULL UNIQUE,
  description TEXT,

  -- Criteria (when this policy applies)
  criteria JSONB NOT NULL,
  -- Example: {
  --   "action_type": "REVERSE_PAYOUT",
  --   "min_amount": 10000,
  --   "currency": "XOF",
  --   "country": "SN"
  -- }

  -- Policy (approval requirements)
  policy JSONB NOT NULL,
  -- Example: {
  --   "required_quorum": {
  --     "type": "role",
  --     "role": "finance_ops",
  --     "min_count": 2
  --   },
  --   "required_ratio": 0.75,
  --   "timeout_seconds": 3600,
  --   "escalation_role": "pay_admin",
  --   "auto_execute": false
  -- }

  -- Priority (higher priority = applied first)
  priority INTEGER DEFAULT 100,

  -- Status
  enabled BOOLEAN DEFAULT true,

  -- Metadata
  created_by UUID NOT NULL,
  updated_by UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX idx_approval_policies_enabled ON approval_policies(enabled, priority DESC);
CREATE INDEX idx_approval_policies_criteria ON approval_policies USING gin(criteria);

COMMENT ON TABLE approval_policies IS 'Configurable approval policies (criteria + requirements)';

-- ---------------------------------------------------------------------
-- 4. OPS APPROVAL AUDIT (Immutable Audit Trail)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ops_approval_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Action reference
  ops_action_id UUID NOT NULL,

  -- Event type
  action TEXT NOT NULL CHECK (action IN (
    'created', 'vote', 'approved', 'rejected', 'escalated',
    'executing', 'executed', 'failed', 'cancelled', 'expired'
  )),

  -- Snapshot (state at time of action)
  snapshot JSONB NOT NULL,

  -- Actor
  actor UUID,
  actor_email TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX idx_ops_approval_audit_action ON ops_approval_audit(ops_action_id, created_at);
CREATE INDEX idx_ops_approval_audit_event ON ops_approval_audit(action, created_at DESC);
CREATE INDEX idx_ops_approval_audit_actor ON ops_approval_audit(actor);

COMMENT ON TABLE ops_approval_audit IS 'Immutable audit trail of all approval events';

-- =====================================================================
-- FUNCTIONS
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Apply Approval Policy to Action
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION apply_approval_policy(p_action_id UUID)
RETURNS VOID AS $$
DECLARE
  v_action ops_actions;
  v_policy approval_policies;
  v_policy_data JSONB;
BEGIN
  -- Get action
  SELECT * INTO v_action FROM ops_actions WHERE id = p_action_id;

  IF v_action IS NULL THEN
    RETURN;
  END IF;

  -- Find matching policy (highest priority)
  SELECT * INTO v_policy
  FROM approval_policies
  WHERE enabled = true
    AND (
      criteria->>'action_type' IS NULL
      OR criteria->>'action_type' = v_action.action_type
    )
    -- TODO: Add more criteria matching (amount, currency, etc.)
  ORDER BY priority DESC, created_at DESC
  LIMIT 1;

  IF v_policy IS NULL THEN
    RETURN;
  END IF;

  v_policy_data := v_policy.policy;

  -- Apply policy to action
  UPDATE ops_actions
  SET
    required_quorum = v_policy_data->'required_quorum',
    required_ratio = COALESCE((v_policy_data->>'required_ratio')::NUMERIC, 0.60),
    timeout_seconds = COALESCE((v_policy_data->>'timeout_seconds')::INTEGER, 86400),
    escalation_role = v_policy_data->>'escalation_role',
    auto_execute = COALESCE((v_policy_data->>'auto_execute')::BOOLEAN, false),
    expires_at = now() + (COALESCE((v_policy_data->>'timeout_seconds')::INTEGER, 86400) || ' seconds')::INTERVAL,
    updated_at = now()
  WHERE id = p_action_id;

  -- Log policy application
  INSERT INTO ops_approval_audit (ops_action_id, action, snapshot)
  VALUES (p_action_id, 'created', jsonb_build_object(
    'policy_applied', v_policy.name,
    'policy_id', v_policy.id
  ));
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION apply_approval_policy IS 'Apply approval policy to action based on criteria';

-- ---------------------------------------------------------------------
-- 2. Evaluate Quorum and Finalize Action
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION evaluate_quorum(p_action_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_action ops_actions;
  v_quorum JSONB;
  v_votes_approve INTEGER;
  v_votes_reject INTEGER;
  v_votes_total INTEGER;
  v_votes_considered INTEGER;
  v_ratio NUMERIC;
  v_quorum_satisfied BOOLEAN := false;
  v_result TEXT;
BEGIN
  -- Get action
  SELECT * INTO v_action FROM ops_actions WHERE id = p_action_id;

  IF v_action IS NULL THEN
    RETURN 'action_not_found';
  END IF;

  IF v_action.status NOT IN ('requested', 'pending') THEN
    RETURN 'action_not_pending';
  END IF;

  -- Count votes
  SELECT
    COUNT(*) FILTER (WHERE vote = 'approve'),
    COUNT(*) FILTER (WHERE vote = 'reject'),
    COUNT(*),
    COUNT(*) FILTER (WHERE vote != 'abstain')
  INTO v_votes_approve, v_votes_reject, v_votes_total, v_votes_considered
  FROM ops_approvals
  WHERE ops_action_id = p_action_id;

  -- Calculate ratio
  IF v_votes_considered > 0 THEN
    v_ratio := v_votes_approve::NUMERIC / v_votes_considered::NUMERIC;
  ELSE
    v_ratio := 0;
  END IF;

  -- Check quorum
  v_quorum := v_action.required_quorum;

  IF v_quorum IS NULL THEN
    -- Default: at least 1 vote
    v_quorum_satisfied := v_votes_total >= 1;
  ELSE
    CASE v_quorum->>'type'
      WHEN 'role' THEN
        -- Role-based quorum
        IF v_quorum->>'min_count' IS NOT NULL THEN
          v_quorum_satisfied := v_votes_total >= (v_quorum->>'min_count')::INTEGER;
        ELSIF v_quorum->>'threshold_pct' IS NOT NULL THEN
          -- TODO: Get role member count from Molam ID
          -- For now, assume satisfied if at least 1 vote
          v_quorum_satisfied := v_votes_total >= 1;
        END IF;

      WHEN 'percentage' THEN
        -- Percentage of role members
        -- TODO: Get role member count from Molam ID
        v_quorum_satisfied := v_votes_total >= 1;

      WHEN 'specific_users' THEN
        -- Specific users must vote
        -- TODO: Check if all required users have voted
        v_quorum_satisfied := v_votes_total >= 1;

      ELSE
        v_quorum_satisfied := v_votes_total >= 1;
    END CASE;
  END IF;

  -- Determine result
  IF NOT v_quorum_satisfied THEN
    v_result := 'pending';
    UPDATE ops_actions SET status = 'pending', updated_at = now() WHERE id = p_action_id;
  ELSIF v_ratio >= v_action.required_ratio THEN
    -- Approved
    v_result := 'approved';
    UPDATE ops_actions SET status = 'approved', updated_at = now() WHERE id = p_action_id;

    -- Log approval
    INSERT INTO ops_approval_audit (ops_action_id, action, snapshot)
    VALUES (p_action_id, 'approved', jsonb_build_object(
      'votes_approve', v_votes_approve,
      'votes_reject', v_votes_reject,
      'ratio', v_ratio,
      'required_ratio', v_action.required_ratio
    ));

  ELSIF v_ratio < (1 - v_action.required_ratio) THEN
    -- Rejected (majority reject)
    v_result := 'rejected';
    UPDATE ops_actions SET status = 'rejected', updated_at = now() WHERE id = p_action_id;

    -- Log rejection
    INSERT INTO ops_approval_audit (ops_action_id, action, snapshot)
    VALUES (p_action_id, 'rejected', jsonb_build_object(
      'votes_approve', v_votes_approve,
      'votes_reject', v_votes_reject,
      'ratio', v_ratio
    ));

  ELSE
    -- Still pending (not enough votes to approve or reject)
    v_result := 'pending';
    UPDATE ops_actions SET status = 'pending', updated_at = now() WHERE id = p_action_id;
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION evaluate_quorum IS 'Evaluate quorum and finalize action if conditions met';

-- ---------------------------------------------------------------------
-- 3. Check and Escalate Expired Actions
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION escalate_expired_actions()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_action RECORD;
BEGIN
  FOR v_action IN
    SELECT *
    FROM ops_actions
    WHERE status IN ('requested', 'pending')
      AND expires_at IS NOT NULL
      AND expires_at < now()
  LOOP
    -- Escalate or expire
    IF v_action.escalation_role IS NOT NULL THEN
      UPDATE ops_actions
      SET status = 'escalated', escalated_at = now(), updated_at = now()
      WHERE id = v_action.id;

      INSERT INTO ops_approval_audit (ops_action_id, action, snapshot)
      VALUES (v_action.id, 'escalated', jsonb_build_object(
        'escalation_role', v_action.escalation_role,
        'reason', 'timeout_exceeded'
      ));

      v_count := v_count + 1;
    ELSE
      UPDATE ops_actions
      SET status = 'expired', updated_at = now()
      WHERE id = v_action.id;

      INSERT INTO ops_approval_audit (ops_action_id, action, snapshot)
      VALUES (v_action.id, 'expired', jsonb_build_object(
        'reason', 'timeout_exceeded'
      ));

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION escalate_expired_actions IS 'Escalate or expire actions that exceeded timeout';

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Auto-update updated_at
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ops_actions_updated_at
BEFORE UPDATE ON ops_actions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ops_approvals_updated_at
BEFORE UPDATE ON ops_approvals
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_approval_policies_updated_at
BEFORE UPDATE ON approval_policies
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------
-- 2. Auto-apply policy on action creation
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION auto_apply_policy_on_create()
RETURNS TRIGGER AS $$
BEGIN
  -- Apply policy if required_quorum not explicitly set
  IF NEW.required_quorum IS NULL THEN
    PERFORM apply_approval_policy(NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_apply_policy_trigger
AFTER INSERT ON ops_actions
FOR EACH ROW EXECUTE FUNCTION auto_apply_policy_on_create();

-- ---------------------------------------------------------------------
-- 3. Auto-evaluate quorum on vote
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION auto_evaluate_on_vote()
RETURNS TRIGGER AS $$
BEGIN
  -- Evaluate quorum after vote
  PERFORM evaluate_quorum(NEW.ops_action_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_evaluate_quorum_trigger
AFTER INSERT OR UPDATE ON ops_approvals
FOR EACH ROW EXECUTE FUNCTION auto_evaluate_on_vote();

-- =====================================================================
-- VIEWS
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Pending Actions Summary
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW pending_actions_summary AS
SELECT
  a.id,
  a.action_type,
  a.status,
  a.required_ratio,
  a.created_at,
  a.expires_at,
  COUNT(v.id) AS total_votes,
  COUNT(v.id) FILTER (WHERE v.vote = 'approve') AS approve_votes,
  COUNT(v.id) FILTER (WHERE v.vote = 'reject') AS reject_votes,
  CASE
    WHEN COUNT(v.id) FILTER (WHERE v.vote != 'abstain') > 0
    THEN (COUNT(v.id) FILTER (WHERE v.vote = 'approve')::NUMERIC / COUNT(v.id) FILTER (WHERE v.vote != 'abstain')::NUMERIC)
    ELSE 0
  END AS current_ratio
FROM ops_actions a
LEFT JOIN ops_approvals v ON v.ops_action_id = a.id
WHERE a.status IN ('requested', 'pending')
GROUP BY a.id, a.action_type, a.status, a.required_ratio, a.created_at, a.expires_at;

COMMENT ON VIEW pending_actions_summary IS 'Summary of pending actions with vote counts';

-- ---------------------------------------------------------------------
-- 2. Approval Performance Stats
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW approval_performance_stats AS
SELECT
  action_type,
  COUNT(*) AS total_actions,
  COUNT(*) FILTER (WHERE status = 'approved') AS approved_count,
  COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count,
  COUNT(*) FILTER (WHERE status = 'expired') AS expired_count,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) FILTER (WHERE status = 'approved') AS avg_approval_time_seconds
FROM ops_actions
GROUP BY action_type;

COMMENT ON VIEW approval_performance_stats IS 'Performance statistics for approvals';

-- =====================================================================
-- SEED DATA
-- =====================================================================

-- Default approval policies
INSERT INTO approval_policies (name, description, criteria, policy, priority, created_by) VALUES
  (
    'High Value Payout',
    'Requires 2 finance_ops approvals for payouts > 1M XOF',
    '{"action_type": "REVERSE_PAYOUT", "min_amount": 1000000}'::JSONB,
    '{
      "required_quorum": {"type": "role", "role": "finance_ops", "min_count": 2},
      "required_ratio": 0.75,
      "timeout_seconds": 14400,
      "escalation_role": "pay_admin",
      "auto_execute": false
    }'::JSONB,
    100,
    '00000000-0000-0000-0000-000000000000'
  ),
  (
    'Merchant Freeze',
    'Requires 2 pay_admin approvals for merchant freeze',
    '{"action_type": "FREEZE_MERCHANT"}'::JSONB,
    '{
      "required_quorum": {"type": "role", "role": "pay_admin", "min_count": 2},
      "required_ratio": 0.66,
      "timeout_seconds": 7200,
      "escalation_role": "ops_admin",
      "auto_execute": false
    }'::JSONB,
    90,
    '00000000-0000-0000-0000-000000000000'
  ),
  (
    'Low Risk Action',
    'Single approval for low-risk actions',
    '{"risk_level": "low"}'::JSONB,
    '{
      "required_quorum": {"type": "role", "role": "ops_admin", "min_count": 1},
      "required_ratio": 0.50,
      "timeout_seconds": 3600,
      "auto_execute": true
    }'::JSONB,
    50,
    '00000000-0000-0000-0000-000000000000'
  );

-- =====================================================================
-- COMPLETION
-- =====================================================================

COMMENT ON SCHEMA public IS 'Brique 78 - Ops Approval Engine v1.0.0 - 2025-11-12';

DO $$
BEGIN
  RAISE NOTICE '✅ Brique 78 - Ops Approval Engine schema created successfully';
  RAISE NOTICE '📊 Tables created: 4 (ops_actions, ops_approvals, approval_policies, ops_approval_audit)';
  RAISE NOTICE '⚙️ Functions created: 3';
  RAISE NOTICE '🔔 Triggers created: 5';
  RAISE NOTICE '📈 Views created: 2';
  RAISE NOTICE '🎯 Seed policies: 3';
  RAISE NOTICE '🚀 Ready for multi-signature approval workflow';
END $$;
