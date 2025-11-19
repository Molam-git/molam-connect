-- ============================================================================
-- AI Risk-Aware Approval System - Database Schema
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1) Approval Actions (requests with SIRA scoring)
-- ============================================================================
CREATE TABLE IF NOT EXISTS approvals_action (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL,              -- e.g. "payout.freeze", "bank_add", "refund.large"
  origin_module TEXT NOT NULL,            -- "pay", "wallet", "treasury"
  origin_entity_id UUID,                  -- merchant_id, payout_id, etc.
  payload JSONB NOT NULL,                 -- canonical payload for SIRA scoring
  created_by UUID NOT NULL,               -- who requested
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'held', 'overridden', 'auto_approved')),

  -- SIRA Risk Assessment
  sira_score INTEGER,                     -- 0..100
  sira_tags TEXT[],                       -- ['high_amount', 'cross_country', etc.]
  sira_reason TEXT,                       -- human-readable reason
  sira_recommended_approvals INTEGER,
  sira_recommended_channels TEXT[],

  -- Approval Requirements
  required_approvals INTEGER NOT NULL DEFAULT 1,
  approved_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  evidence_required BOOLEAN DEFAULT FALSE,
  evidence_uploaded BOOLEAN DEFAULT FALSE,

  -- Timing
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  decided_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  -- Override tracking
  override_by UUID,
  override_reason TEXT,

  -- Notification tracking
  notified BOOLEAN DEFAULT FALSE,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_approvals_action_status ON approvals_action(status);
CREATE INDEX IF NOT EXISTS idx_approvals_action_created ON approvals_action(created_at);
CREATE INDEX IF NOT EXISTS idx_approvals_action_score ON approvals_action(sira_score);
CREATE INDEX IF NOT EXISTS idx_approvals_action_module ON approvals_action(origin_module);
CREATE INDEX IF NOT EXISTS idx_approvals_action_expires ON approvals_action(expires_at);

-- ============================================================================
-- 2) Approver Pools (configurable by ops_admin)
-- ============================================================================
CREATE TABLE IF NOT EXISTS approvals_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  roles TEXT[] NOT NULL,                  -- ['ops_approver', 'finance_lead', 'compliance_lead']
  country TEXT,                           -- optional country filter
  module TEXT,                            -- optional module filter
  min_amount NUMERIC(18,2),               -- optional amount range
  max_amount NUMERIC(18,2),
  priority INTEGER DEFAULT 10,            -- lower = higher priority
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approvals_pool_active ON approvals_pool(active);

-- ============================================================================
-- 3) Individual Approver Votes (immutable audit)
-- ============================================================================
CREATE TABLE IF NOT EXISTS approvals_vote (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID NOT NULL REFERENCES approvals_action(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL,              -- Molam ID user
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject')),
  comment TEXT,
  voted_at TIMESTAMPTZ DEFAULT now(),
  ip_address TEXT,
  UNIQUE(approval_id, approver_id)       -- one vote per approver
);

CREATE INDEX IF NOT EXISTS idx_approvals_vote_approval ON approvals_vote(approval_id);
CREATE INDEX IF NOT EXISTS idx_approvals_vote_approver ON approvals_vote(approver_id);
CREATE INDEX IF NOT EXISTS idx_approvals_vote_created ON approvals_vote(created_at);

-- ============================================================================
-- 4) One-Click Tokens (short-lived, hashed)
-- ============================================================================
CREATE TABLE IF NOT EXISTS approvals_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID NOT NULL REFERENCES approvals_action(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,        -- SHA256 hash
  approver_id UUID NOT NULL,              -- intended approver
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject')),
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  used_by_ip TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approvals_tokens_hash ON approvals_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_approvals_tokens_approval ON approvals_tokens(approval_id);
CREATE INDEX IF NOT EXISTS idx_approvals_tokens_expires ON approvals_tokens(expires_at);

-- ============================================================================
-- 5) Approval Policies (ops configurable thresholds)
-- ============================================================================
CREATE TABLE IF NOT EXISTS approvals_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT,                           -- optional country scope
  module TEXT,                            -- optional module scope
  action_type TEXT,                       -- optional action type

  -- SIRA Score Thresholds
  min_score_auto INTEGER DEFAULT 25,     -- < 25 = auto-approve
  min_score_single INTEGER DEFAULT 60,   -- 25-60 = 1 approver
  min_score_double INTEGER DEFAULT 85,   -- 60-85 = 2 approvers

  -- Limits
  max_approvals INTEGER DEFAULT 3,       -- >= 85 = 3 approvers (capped)
  timeout_minutes INTEGER DEFAULT 60,    -- hold after timeout
  evidence_required_score INTEGER DEFAULT 85,  -- require evidence upload

  -- Channels
  force_multichannel BOOLEAN DEFAULT FALSE,  -- force email+slack+push

  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approvals_policy_active ON approvals_policy(active);

-- ============================================================================
-- 6) Evidence Storage (encrypted docs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS approvals_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID NOT NULL REFERENCES approvals_action(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  file_type TEXT,
  storage_url TEXT NOT NULL,              -- S3/GCS URL (encrypted)
  encryption_key_id TEXT,                 -- KMS key ID
  checksum TEXT,                          -- SHA256 for integrity
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approvals_evidence_approval ON approvals_evidence(approval_id);

-- ============================================================================
-- 7) SIRA Scoring Audit (track all scoring calls)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sira_scoring_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID REFERENCES approvals_action(id),
  payload JSONB NOT NULL,
  score INTEGER NOT NULL,
  tags TEXT[],
  reason TEXT,
  recommended_approvals INTEGER,
  model_version TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sira_audit_approval ON sira_scoring_audit(approval_id);
CREATE INDEX IF NOT EXISTS idx_sira_audit_created ON sira_scoring_audit(created_at);

-- ============================================================================
-- Seed Default Policies
-- ============================================================================
INSERT INTO approvals_policy (name, country, module, min_score_auto, min_score_single, min_score_double, max_approvals, timeout_minutes, evidence_required_score)
VALUES
  ('Global Default', NULL, NULL, 25, 60, 85, 3, 60, 85),
  ('High-Value Payouts', NULL, 'pay', 20, 50, 75, 3, 30, 75),
  ('Emergency Actions', NULL, NULL, 50, 70, 90, 3, 15, 90),
  ('Low-Risk Ops', NULL, 'ops', 40, 70, 90, 2, 120, 95)
ON CONFLICT DO NOTHING;

-- Seed Default Pool
INSERT INTO approvals_pool (name, description, roles, priority)
VALUES
  ('Global Ops Approvers', 'Default pool for all approval requests', ARRAY['pay_admin', 'finance_ops', 'compliance'], 10),
  ('Finance Team', 'Finance-specific approvals', ARRAY['finance_ops', 'finance_lead'], 20),
  ('Compliance Team', 'High-risk compliance reviews', ARRAY['compliance', 'compliance_lead'], 5)
ON CONFLICT DO NOTHING;
