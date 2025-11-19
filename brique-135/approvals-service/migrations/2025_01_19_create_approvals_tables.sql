-- ============================================================================
-- Molam Approvals Engine - Database Schema
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1) Approval Policies (configurable by ops_admin via UI)
-- ============================================================================
CREATE TABLE IF NOT EXISTS approval_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  action_type TEXT NOT NULL,        -- e.g. 'execute_plan','add_bank','reverse_payout'
  min_amount NUMERIC(18,2),         -- nullable
  max_amount NUMERIC(18,2),         -- nullable
  required_roles TEXT[] NOT NULL,   -- roles contributing seats, e.g. ['pay_admin','compliance']
  quorum INT NOT NULL DEFAULT 1,    -- how many approvals needed
  veto_roles TEXT[] DEFAULT '{}',   -- roles that can veto
  ttl_hours INT DEFAULT 72,         -- expiry TTL
  auto_approve JSONB DEFAULT NULL,  -- e.g. {"sira_risk_score_lt": 10}
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_policies_action ON approval_policies(action_type);

-- ============================================================================
-- 2) Approval Requests
-- ============================================================================
CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ops_log_id UUID NOT NULL,         -- link to ops_actions_log from B134
  policy_id UUID REFERENCES approval_policies(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending|partially_approved|approved|rejected|expired|executed
  payload JSONB NOT NULL,           -- snapshot of action details
  target JSONB,                     -- e.g. {payout_id:..., bank_profile_id:...}
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_ops_log ON approval_requests(ops_log_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_expires ON approval_requests(expires_at);

-- ============================================================================
-- 3) Individual Approval Votes
-- ============================================================================
CREATE TABLE IF NOT EXISTS approval_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL,
  approver_role TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('approve','reject','abstain')),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(request_id, approver_id)
);

CREATE INDEX IF NOT EXISTS idx_approval_votes_request ON approval_votes(request_id);

-- ============================================================================
-- 4) Approval Audit (immutable history)
-- ============================================================================
CREATE TABLE IF NOT EXISTS approval_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  actor_id UUID,
  action TEXT NOT NULL, -- 'create_request','vote','auto_approve','expire','execute','veto'
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_audit_request ON approval_audit(request_id);
CREATE INDEX IF NOT EXISTS idx_approval_audit_created ON approval_audit(created_at);

-- ============================================================================
-- Seed Initial Policies
-- ============================================================================

INSERT INTO approval_policies (name, action_type, required_roles, quorum, veto_roles, ttl_hours, auto_approve)
VALUES
  ('Execute Plan (Large)', 'execute_plan', ARRAY['pay_admin','finance_ops'], 2, ARRAY['compliance'], 72, NULL),
  ('Add Bank Profile', 'add_bank', ARRAY['pay_admin','compliance'], 2, ARRAY['compliance'], 168, NULL),
  ('Large Payout', 'large_payout', ARRAY['pay_admin','finance_ops'], 2, ARRAY['compliance'], 48, '{"amount_lt": 100000}'::jsonb),
  ('Emergency Reverse', 'emergency_reverse', ARRAY['pay_admin','compliance','finance_ops'], 3, ARRAY['compliance'], 24, NULL),
  ('Freeze Global', 'freeze_global', ARRAY['pay_admin','finance_ops'], 2, ARRAY[], 12, NULL)
ON CONFLICT DO NOTHING;
