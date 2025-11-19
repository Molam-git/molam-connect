-- Brique 111-2: AI Config Advisor (SIRA)
-- Provides AI-driven configuration recommendations based on telemetry

-- ========================================
-- 1) AI recommendations table
-- ========================================
CREATE TABLE IF NOT EXISTS config_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID, -- nullable for global recommendations
  target_type TEXT NOT NULL, -- 'plugin','webhook','checkout','treasury','merchant_setting'
  target_id UUID, -- id of merchant_plugins or webhook_endpoints etc
  action TEXT NOT NULL, -- 'suggest_config','apply_patch','change_timeout','scale_worker'
  params JSONB NOT NULL, -- proposed params
  evidence JSONB, -- telemetry + examples leading to suggestion
  confidence NUMERIC(5,4) NOT NULL, -- 0.0000 - 1.0000
  priority TEXT NOT NULL DEFAULT 'medium', -- low|medium|high|critical
  status TEXT NOT NULL DEFAULT 'proposed', -- proposed|approved|applied|rejected|rolled_back
  created_by TEXT NOT NULL DEFAULT 'sira', -- 'sira' or user id
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_priority CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT valid_status CHECK (status IN ('proposed', 'approved', 'applied', 'rejected', 'rolled_back')),
  CONSTRAINT valid_target_type CHECK (target_type IN ('plugin', 'webhook', 'checkout', 'treasury', 'merchant_setting')),
  CONSTRAINT valid_confidence CHECK (confidence >= 0 AND confidence <= 1)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_config_recommendations_merchant ON config_recommendations(merchant_id) WHERE merchant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_config_recommendations_status ON config_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_config_recommendations_priority ON config_recommendations(priority);
CREATE INDEX IF NOT EXISTS idx_config_recommendations_target ON config_recommendations(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_config_recommendations_created_at ON config_recommendations(created_at DESC);

-- ========================================
-- 2) Recommendation audit & results (immutable)
-- ========================================
CREATE TABLE IF NOT EXISTS config_recommendation_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID REFERENCES config_recommendations(id) ON DELETE CASCADE,
  actor TEXT NOT NULL, -- user_id or 'sira' or 'system'
  action_taken TEXT NOT NULL, -- 'approve','reject','apply','rollback','auto_apply'
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_action_taken CHECK (action_taken IN ('approve', 'reject', 'apply', 'rollback', 'auto_apply', 'apply_failed'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recommendation_audit_recommendation ON config_recommendation_audit(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_audit_actor ON config_recommendation_audit(actor);
CREATE INDEX IF NOT EXISTS idx_recommendation_audit_created_at ON config_recommendation_audit(created_at DESC);

-- ========================================
-- 3) Config snapshots (for rollback)
-- ========================================
CREATE TABLE IF NOT EXISTS config_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL,
  target_id UUID,
  snapshot JSONB NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_snapshot_target_type CHECK (target_type IN ('plugin', 'webhook', 'checkout', 'treasury', 'merchant_setting'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_config_snapshots_target ON config_snapshots(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_config_snapshots_created_at ON config_snapshots(created_at DESC);

-- ========================================
-- Helper Functions
-- ========================================

-- Function to check if a recommendation requires multi-signature approval
CREATE OR REPLACE FUNCTION requires_multisig_approval(
  p_recommendation_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_priority TEXT;
  v_target_type TEXT;
  v_action TEXT;
BEGIN
  SELECT priority, target_type, action
  INTO v_priority, v_target_type, v_action
  FROM config_recommendations
  WHERE id = p_recommendation_id;

  -- Critical priority always requires multisig
  IF v_priority = 'critical' THEN
    RETURN TRUE;
  END IF;

  -- Changes to treasury or pricing/tax always require multisig
  IF v_target_type IN ('treasury', 'checkout') AND v_action LIKE '%pricing%' THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to count approvals for a recommendation
CREATE OR REPLACE FUNCTION count_approvals(
  p_recommendation_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_approval_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT actor)
  INTO v_approval_count
  FROM config_recommendation_audit
  WHERE recommendation_id = p_recommendation_id
    AND action_taken = 'approve';

  RETURN COALESCE(v_approval_count, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to check if recommendation can be auto-applied
CREATE OR REPLACE FUNCTION can_auto_apply(
  p_recommendation_id UUID,
  p_min_confidence NUMERIC DEFAULT 0.95,
  p_max_priority TEXT DEFAULT 'low'
) RETURNS BOOLEAN AS $$
DECLARE
  v_confidence NUMERIC;
  v_priority TEXT;
  v_action TEXT;
BEGIN
  SELECT confidence, priority, action
  INTO v_confidence, v_priority, v_action
  FROM config_recommendations
  WHERE id = p_recommendation_id;

  -- Never auto-apply if it requires multisig
  IF requires_multisig_approval(p_recommendation_id) THEN
    RETURN FALSE;
  END IF;

  -- Check confidence threshold
  IF v_confidence < p_min_confidence THEN
    RETURN FALSE;
  END IF;

  -- Check priority level
  IF v_priority NOT IN ('low', 'medium') AND p_max_priority = 'low' THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- Views for monitoring
-- ========================================

-- Active recommendations view
CREATE OR REPLACE VIEW v_active_recommendations AS
SELECT
  r.*,
  count_approvals(r.id) as approval_count,
  requires_multisig_approval(r.id) as requires_multisig,
  can_auto_apply(r.id) as can_auto_apply
FROM config_recommendations r
WHERE r.status IN ('proposed', 'approved')
ORDER BY
  CASE r.priority
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
  END,
  r.created_at DESC;

-- Recommendation success metrics view
CREATE OR REPLACE VIEW v_recommendation_metrics AS
SELECT
  r.target_type,
  r.action,
  r.priority,
  COUNT(*) as total_recommendations,
  COUNT(*) FILTER (WHERE r.status = 'applied') as applied_count,
  COUNT(*) FILTER (WHERE r.status = 'rejected') as rejected_count,
  COUNT(*) FILTER (WHERE r.status = 'rolled_back') as rollback_count,
  AVG(r.confidence) as avg_confidence,
  AVG(r.confidence) FILTER (WHERE r.status = 'applied') as avg_confidence_applied
FROM config_recommendations r
GROUP BY r.target_type, r.action, r.priority;

-- ========================================
-- Triggers
-- ========================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_config_recommendations_updated_at
BEFORE UPDATE ON config_recommendations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- Multi-Signature Approval System
-- ========================================

-- Multisig policies define approval requirements per target type and priority
CREATE TABLE IF NOT EXISTS multisig_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL,        -- 'plugin','webhook','checkout','treasury','merchant_setting'
  priority TEXT NOT NULL,           -- 'low','medium','high','critical'
  required_signatures INT NOT NULL DEFAULT 2,
  approver_roles TEXT[] NOT NULL,   -- array of role names allowed to approve
  auto_apply_threshold NUMERIC(5,4) DEFAULT 0.95, -- confidence threshold for auto apply
  auto_apply_allowed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_ms_target_type CHECK (target_type IN ('plugin', 'webhook', 'checkout', 'treasury', 'merchant_setting')),
  CONSTRAINT valid_ms_priority CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT valid_required_signatures CHECK (required_signatures >= 1 AND required_signatures <= 10),
  CONSTRAINT valid_auto_apply_threshold CHECK (auto_apply_threshold >= 0 AND auto_apply_threshold <= 1),
  UNIQUE(target_type, priority)
);

-- Approvals table - stores individual approval votes
CREATE TABLE IF NOT EXISTS config_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES config_recommendations(id) ON DELETE CASCADE,
  approver_user_id UUID NOT NULL,   -- Molam ID user
  approver_roles TEXT[] NOT NULL,   -- roles of approver at time of approval
  decision TEXT NOT NULL,           -- 'approve'|'reject'
  comment TEXT,
  signature TEXT,                   -- signed JWT/HMAC created by service/HSM
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_approval_decision CHECK (decision IN ('approve', 'reject')),
  UNIQUE(recommendation_id, approver_user_id)  -- one vote per approver
);

-- Lock table to avoid concurrent apply operations
CREATE TABLE IF NOT EXISTS recommendation_locks (
  recommendation_id UUID PRIMARY KEY REFERENCES config_recommendations(id) ON DELETE CASCADE,
  locked_by UUID, -- user id or 'sira'
  locked_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for multisig
CREATE INDEX IF NOT EXISTS idx_ms_policy ON multisig_policies(target_type, priority);
CREATE INDEX IF NOT EXISTS idx_approvals_rec ON config_approvals(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_approvals_user ON config_approvals(approver_user_id);
CREATE INDEX IF NOT EXISTS idx_approvals_decision ON config_approvals(decision);

-- Trigger for multisig_policies updated_at
CREATE TRIGGER update_multisig_policies_updated_at
BEFORE UPDATE ON multisig_policies
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- Multisig Helper Functions
-- ========================================

-- Get count of approvals for a recommendation (only 'approve' decisions)
CREATE OR REPLACE FUNCTION count_unique_approvers(
  p_recommendation_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT approver_user_id)
  INTO v_count
  FROM config_approvals
  WHERE recommendation_id = p_recommendation_id
    AND decision = 'approve';

  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql;

-- Check if recommendation has required signatures based on policy
CREATE OR REPLACE FUNCTION has_required_signatures(
  p_recommendation_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_rec RECORD;
  v_policy RECORD;
  v_approval_count INTEGER;
BEGIN
  -- Get recommendation
  SELECT target_type, priority
  INTO v_rec
  FROM config_recommendations
  WHERE id = p_recommendation_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Get policy
  SELECT required_signatures
  INTO v_policy
  FROM multisig_policies
  WHERE target_type = v_rec.target_type
    AND priority = v_rec.priority;

  -- If no policy, use default of 2
  IF NOT FOUND THEN
    v_policy.required_signatures := 2;
  END IF;

  -- Count approvals
  v_approval_count := count_unique_approvers(p_recommendation_id);

  RETURN v_approval_count >= v_policy.required_signatures;
END;
$$ LANGUAGE plpgsql;

-- Check if any approver rejected the recommendation
CREATE OR REPLACE FUNCTION has_rejection(
  p_recommendation_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_rejection_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_rejection_count
  FROM config_approvals
  WHERE recommendation_id = p_recommendation_id
    AND decision = 'reject';

  RETURN v_rejection_count > 0;
END;
$$ LANGUAGE plpgsql;

-- Insert default multisig policies
INSERT INTO multisig_policies (target_type, priority, required_signatures, approver_roles, auto_apply_threshold, auto_apply_allowed)
VALUES
  -- Webhooks
  ('webhook', 'low', 1, ARRAY['ops'], 0.97, TRUE),
  ('webhook', 'medium', 1, ARRAY['ops', 'pay_admin'], 0.96, TRUE),
  ('webhook', 'high', 2, ARRAY['ops', 'pay_admin', 'compliance'], 0.99, FALSE),
  ('webhook', 'critical', 3, ARRAY['ops', 'pay_admin', 'compliance'], 0.999, FALSE),

  -- Plugins
  ('plugin', 'low', 1, ARRAY['ops'], 0.97, TRUE),
  ('plugin', 'medium', 1, ARRAY['ops', 'pay_admin'], 0.96, TRUE),
  ('plugin', 'high', 2, ARRAY['ops', 'pay_admin'], 0.98, FALSE),
  ('plugin', 'critical', 3, ARRAY['ops', 'pay_admin', 'compliance'], 0.999, FALSE),

  -- Checkout
  ('checkout', 'low', 1, ARRAY['ops', 'pay_admin'], 0.98, FALSE),
  ('checkout', 'medium', 2, ARRAY['ops', 'pay_admin'], 0.99, FALSE),
  ('checkout', 'high', 2, ARRAY['ops', 'pay_admin', 'compliance'], 0.99, FALSE),
  ('checkout', 'critical', 3, ARRAY['ops', 'pay_admin', 'finance_ops', 'compliance'], 0.999, FALSE),

  -- Treasury (never auto-apply)
  ('treasury', 'low', 2, ARRAY['finance_ops', 'pay_admin'], 0.99, FALSE),
  ('treasury', 'medium', 2, ARRAY['finance_ops', 'pay_admin'], 0.99, FALSE),
  ('treasury', 'high', 3, ARRAY['finance_ops', 'pay_admin', 'compliance'], 0.999, FALSE),
  ('treasury', 'critical', 3, ARRAY['finance_ops', 'pay_admin', 'compliance'], 0.999, FALSE),

  -- Merchant Settings
  ('merchant_setting', 'low', 1, ARRAY['ops'], 0.97, TRUE),
  ('merchant_setting', 'medium', 2, ARRAY['ops', 'pay_admin'], 0.98, FALSE),
  ('merchant_setting', 'high', 2, ARRAY['ops', 'pay_admin', 'compliance'], 0.99, FALSE),
  ('merchant_setting', 'critical', 3, ARRAY['ops', 'pay_admin', 'compliance'], 0.999, FALSE)
ON CONFLICT (target_type, priority) DO NOTHING;

-- ========================================
-- Comments
-- ========================================

COMMENT ON TABLE config_recommendations IS 'AI-driven configuration recommendations from SIRA';
COMMENT ON TABLE config_recommendation_audit IS 'Immutable audit trail for recommendation actions';
COMMENT ON TABLE config_snapshots IS 'Configuration snapshots for rollback capability';
COMMENT ON TABLE multisig_policies IS 'Multi-signature approval policies per target type and priority';
COMMENT ON TABLE config_approvals IS 'Individual approval/rejection votes for recommendations';
COMMENT ON TABLE recommendation_locks IS 'Locks to prevent concurrent apply operations';

COMMENT ON COLUMN config_recommendations.confidence IS 'SIRA confidence score 0.0-1.0';
COMMENT ON COLUMN config_recommendations.evidence IS 'Telemetry data and reasoning that led to this recommendation';
COMMENT ON COLUMN config_recommendations.params IS 'Proposed configuration changes';
COMMENT ON COLUMN config_approvals.signature IS 'HSM-signed JWT/HMAC as proof of approval';
COMMENT ON COLUMN multisig_policies.auto_apply_threshold IS 'Minimum confidence score required for auto-apply';
COMMENT ON COLUMN multisig_policies.approver_roles IS 'Roles allowed to approve (pay_admin, ops, finance_ops, compliance)';
