-- =====================================================================
-- Sous-Brique 77.1 - Real-time Alerts & Auto-Remediation
-- =====================================================================
-- Version: 1.0.0
-- Date: 2025-11-12
-- Description: Real-time alerting with SIRA-powered auto-remediation
-- =====================================================================

-- =====================================================================
-- ENUM TYPES
-- =====================================================================

-- Alert types
CREATE TYPE alert_type_enum AS ENUM (
  'float_low',           -- Float below threshold
  'recon_match_drop',    -- Reconciliation match rate drop
  'refund_spike',        -- Sudden increase in refunds
  'payout_fail_rate',    -- High payout failure rate
  'dlq_growth',          -- Dead letter queue growing
  'fraud_score_high',    -- High fraud score detected
  'conversion_drop',     -- Payment conversion rate drop
  'chargeback_spike'     -- Sudden increase in chargebacks
);

-- Alert severity
CREATE TYPE alert_severity_enum AS ENUM (
  'info',
  'warning',
  'critical'
);

-- Alert status
CREATE TYPE alert_status_enum AS ENUM (
  'open',
  'acknowledged',
  'resolved',
  'suppressed',
  'auto_remediated'
);

-- =====================================================================
-- CORE TABLES
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ALERTS (Real-time Alerts)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Alert type and classification
  alert_type alert_type_enum NOT NULL,

  -- Tenant scope
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('platform', 'merchant', 'agent', 'bank', 'region')),
  tenant_id UUID,

  -- Severity
  severity alert_severity_enum NOT NULL,

  -- Metric that triggered the alert (JSONB for flexibility)
  metric JSONB NOT NULL,
  -- Example: {"metric": "recon_match_rate", "value": 0.82, "threshold": 0.95, "previous_value": 0.98}

  -- Status
  status alert_status_enum DEFAULT 'open',

  -- Title and description (auto-generated or custom)
  title TEXT,
  description TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,

  -- Auto-remediation
  remedied_by_action_id UUID, -- Link to ops_actions.id if auto-remediated

  -- Suppression (prevent alert spam)
  suppressed_until TIMESTAMPTZ,
  suppression_reason TEXT
);

-- Indexes
CREATE INDEX idx_alerts_tenant ON alerts(tenant_type, tenant_id, status, created_at DESC);
CREATE INDEX idx_alerts_type_severity ON alerts(alert_type, severity, status);
CREATE INDEX idx_alerts_status ON alerts(status, created_at DESC);
CREATE INDEX idx_alerts_remedied ON alerts(remedied_by_action_id) WHERE remedied_by_action_id IS NOT NULL;

COMMENT ON TABLE alerts IS 'Real-time alerts with auto-remediation tracking';

-- ---------------------------------------------------------------------
-- 2. REMEDIATION POLICIES (Ops-Configurable)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS remediation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Alert type this policy applies to
  alert_type alert_type_enum NOT NULL UNIQUE,

  -- Policy status
  enabled BOOLEAN DEFAULT false,

  -- Auto-action to execute (JSONB)
  auto_action JSONB,
  -- Example: {"action_type": "PAUSE_PAYOUT", "params": {"duration": "1h", "reason": "recon_match_drop"}}

  -- SIRA confidence threshold (0-1)
  auto_threshold NUMERIC(5,4) DEFAULT 0.90 CHECK (auto_threshold >= 0 AND auto_threshold <= 1),

  -- Cooldown to prevent oscillation (seconds)
  cooldown_seconds INTEGER DEFAULT 600,

  -- Last execution timestamp (for cooldown check)
  last_executed_at TIMESTAMPTZ,

  -- Multi-sig requirement
  require_multi_sig BOOLEAN DEFAULT false,

  -- Approval requirements (if multi-sig)
  required_approvals INTEGER DEFAULT 2,

  -- Notification channels
  notify_channels TEXT[] DEFAULT ARRAY['email', 'slack'],

  -- Metadata
  created_by UUID NOT NULL,
  updated_by UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX idx_remediation_policies_alert_type ON remediation_policies(alert_type);
CREATE INDEX idx_remediation_policies_enabled ON remediation_policies(enabled);

COMMENT ON TABLE remediation_policies IS 'Configurable auto-remediation policies for each alert type';

-- ---------------------------------------------------------------------
-- 3. ALERT DECISIONS (Immutable Audit Trail)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS alert_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Alert reference
  alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,

  -- Decision details (JSONB for flexibility)
  decision JSONB NOT NULL,
  -- Example: {
  --   "actor": "sira",
  --   "action": "suggest",
  --   "details": {
  --     "recommendation": "increase_hold",
  --     "confidence": 0.96,
  --     "explanation": {...}
  --   }
  -- }

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX idx_alert_decisions_alert ON alert_decisions(alert_id, created_at DESC);

COMMENT ON TABLE alert_decisions IS 'Immutable audit trail of all decisions made for each alert';

-- =====================================================================
-- FUNCTIONS
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Create Alert with Auto-Remediation Check
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_alert_with_remediation(
  p_alert_type alert_type_enum,
  p_tenant_type TEXT,
  p_tenant_id UUID,
  p_severity alert_severity_enum,
  p_metric JSONB,
  p_title TEXT,
  p_description TEXT
)
RETURNS UUID AS $$
DECLARE
  v_alert_id UUID;
  v_policy remediation_policies;
  v_cooldown_ok BOOLEAN;
BEGIN
  -- Create alert
  INSERT INTO alerts (alert_type, tenant_type, tenant_id, severity, metric, title, description)
  VALUES (p_alert_type, p_tenant_type, p_tenant_id, p_severity, p_metric, p_title, p_description)
  RETURNING id INTO v_alert_id;

  -- Check if there's an active remediation policy
  SELECT * INTO v_policy
  FROM remediation_policies
  WHERE alert_type = p_alert_type
    AND enabled = true;

  IF v_policy IS NULL THEN
    -- No policy, just return alert
    RETURN v_alert_id;
  END IF;

  -- Check cooldown
  v_cooldown_ok := (
    v_policy.last_executed_at IS NULL
    OR v_policy.last_executed_at < now() - (v_policy.cooldown_seconds || ' seconds')::INTERVAL
  );

  IF NOT v_cooldown_ok THEN
    -- Still in cooldown, log decision
    INSERT INTO alert_decisions (alert_id, decision)
    VALUES (v_alert_id, jsonb_build_object(
      'actor', 'system',
      'action', 'skip',
      'details', jsonb_build_object('reason', 'cooldown', 'cooldown_seconds', v_policy.cooldown_seconds)
    ));

    RETURN v_alert_id;
  END IF;

  -- If require_multi_sig, mark for approval (handled by worker/API)
  IF v_policy.require_multi_sig THEN
    INSERT INTO alert_decisions (alert_id, decision)
    VALUES (v_alert_id, jsonb_build_object(
      'actor', 'system',
      'action', 'require_approval',
      'details', jsonb_build_object('policy_id', v_policy.id, 'required_approvals', v_policy.required_approvals)
    ));
  END IF;

  -- Note: Actual SIRA call and execution happens in worker/service layer

  RETURN v_alert_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_alert_with_remediation IS 'Create alert and check remediation policy';

-- ---------------------------------------------------------------------
-- 2. Check Cooldown for Policy
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_policy_cooldown(p_alert_type alert_type_enum)
RETURNS BOOLEAN AS $$
DECLARE
  v_policy remediation_policies;
BEGIN
  SELECT * INTO v_policy
  FROM remediation_policies
  WHERE alert_type = p_alert_type
    AND enabled = true;

  IF v_policy IS NULL THEN
    RETURN false;
  END IF;

  RETURN (
    v_policy.last_executed_at IS NULL
    OR v_policy.last_executed_at < now() - (v_policy.cooldown_seconds || ' seconds')::INTERVAL
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_policy_cooldown IS 'Check if policy is outside cooldown period';

-- ---------------------------------------------------------------------
-- 3. Update Policy Last Executed (for cooldown tracking)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_policy_last_executed(p_alert_type alert_type_enum)
RETURNS VOID AS $$
BEGIN
  UPDATE remediation_policies
  SET last_executed_at = now(), updated_at = now()
  WHERE alert_type = p_alert_type;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_policy_last_executed IS 'Update last execution timestamp for cooldown tracking';

-- ---------------------------------------------------------------------
-- 4. Get Active Alerts Count by Severity
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_active_alerts_count(
  p_tenant_type TEXT,
  p_tenant_id UUID
)
RETURNS TABLE (
  severity alert_severity_enum,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT a.severity, COUNT(*) AS count
  FROM alerts a
  WHERE a.tenant_type = p_tenant_type
    AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND a.status = 'open'
  GROUP BY a.severity;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_active_alerts_count IS 'Get count of active alerts by severity';

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Auto-update updated_at
-- ---------------------------------------------------------------------

CREATE TRIGGER update_remediation_policies_updated_at
BEFORE UPDATE ON remediation_policies
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- VIEWS
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Active Alerts Summary
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW active_alerts_summary AS
SELECT
  tenant_type,
  tenant_id,
  alert_type,
  severity,
  COUNT(*) AS alert_count,
  MIN(created_at) AS oldest_alert_at
FROM alerts
WHERE status = 'open'
GROUP BY tenant_type, tenant_id, alert_type, severity;

COMMENT ON VIEW active_alerts_summary IS 'Summary of active alerts by type and severity';

-- ---------------------------------------------------------------------
-- 2. Auto-Remediation Stats
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW auto_remediation_stats AS
SELECT
  alert_type,
  COUNT(*) FILTER (WHERE remedied_by_action_id IS NOT NULL) AS auto_remediated_count,
  COUNT(*) FILTER (WHERE status = 'open') AS open_count,
  COUNT(*) FILTER (WHERE status = 'resolved') AS resolved_count,
  AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) FILTER (WHERE resolved_at IS NOT NULL) AS avg_resolution_time_seconds
FROM alerts
GROUP BY alert_type;

COMMENT ON VIEW auto_remediation_stats IS 'Statistics on auto-remediation effectiveness';

-- =====================================================================
-- SEED DATA
-- =====================================================================

-- Default remediation policies (all disabled by default for safety)
INSERT INTO remediation_policies (alert_type, enabled, auto_action, auto_threshold, cooldown_seconds, require_multi_sig, created_by) VALUES
  ('float_low', false, '{
    "action_type": "ADJUST_FLOAT",
    "params": {"adjustment": "top_up", "amount": 1000000}
  }'::JSONB, 0.90, 3600, true, '00000000-0000-0000-0000-000000000000'),

  ('recon_match_drop', false, '{
    "action_type": "PAUSE_PAYOUT",
    "params": {"duration": "1h", "reason": "recon_match_drop"}
  }'::JSONB, 0.95, 1800, true, '00000000-0000-0000-0000-000000000000'),

  ('refund_spike', false, '{
    "action_type": "FREEZE_MERCHANT",
    "params": {"duration": "24h", "reason": "refund_spike"}
  }'::JSONB, 0.92, 3600, true, '00000000-0000-0000-0000-000000000000'),

  ('payout_fail_rate', false, '{
    "action_type": "ROUTE_PAYOUT_OVERRIDE",
    "params": {"bank_profile_id": "backup_bank"}
  }'::JSONB, 0.88, 1800, false, '00000000-0000-0000-0000-000000000000'),

  ('dlq_growth', false, '{
    "action_type": "REQUEUE_DLQ",
    "params": {"max_items": 1000}
  }'::JSONB, 0.85, 600, false, '00000000-0000-0000-0000-000000000000'),

  ('fraud_score_high', false, '{
    "action_type": "FREEZE_MERCHANT",
    "params": {"duration": "12h", "reason": "fraud_score_high"}
  }'::JSONB, 0.95, 7200, true, '00000000-0000-0000-0000-000000000000');

-- =====================================================================
-- COMPLETION
-- =====================================================================

COMMENT ON SCHEMA public IS 'Sous-Brique 77.1 - Alerts & Auto-Remediation v1.0.0 - 2025-11-12';

DO $$
BEGIN
  RAISE NOTICE '✅ Sous-Brique 77.1 - Alerts & Auto-Remediation schema created successfully';
  RAISE NOTICE '📊 Tables created: 3 (alerts, remediation_policies, alert_decisions)';
  RAISE NOTICE '⚙️ Functions created: 4';
  RAISE NOTICE '🔔 Triggers created: 1';
  RAISE NOTICE '📈 Views created: 2';
  RAISE NOTICE '🎯 Seed policies: 6 (all disabled by default for safety)';
  RAISE NOTICE '🚀 Ready for real-time alerting with SIRA-powered auto-remediation';
END $$;
