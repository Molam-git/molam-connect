-- Brique 111-1: Self-Healing Plugins (SIRA) - Industrial-grade
-- Migration: 001_self_healing_sira.sql
-- Description: Tables pour incidents, auto-patch, ops policy

-- ============================================================================
-- 1. Plugin Incidents - Détection d'anomalies
-- ============================================================================
CREATE TABLE IF NOT EXISTS plugin_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_plugin_id UUID NOT NULL REFERENCES merchant_plugins(id) ON DELETE CASCADE,
  incident_type TEXT NOT NULL,
  -- Types: 'heartbeat_missed', 'webhook_fail_rate', 'error_spike', 
  --        'signature_invalid', 'version_incompatibility', 'config_drift'
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Snapshot de la télémetry au moment de la détection
  telemetry_snapshot JSONB NOT NULL DEFAULT '{}',
  -- Exemple: {errors_last_24h: 50, webhook_fail_rate: 0.6, env: {...}}
  
  -- Décision SIRA
  sira_decision JSONB,
  -- Exemple: {
  --   action: 'patch'|'config_fix'|'notify_ops'|'rollback',
  --   patch_version: '1.2.3',
  --   current_version: '1.2.0',
  --   confidence: 0.87,
  --   explanation: 'High webhook failure rate detected, patch 1.2.3 fixes known issue',
  --   estimated_impact: 'low'|'medium'|'high'
  -- }
  
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'mitigated', 'closed', 'escalated')),
  
  -- Escalation
  escalated_to_ops BOOLEAN DEFAULT false,
  escalated_at TIMESTAMPTZ,
  escalation_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_plugin_incidents_merchant_plugin_id ON plugin_incidents(merchant_plugin_id);
CREATE INDEX idx_plugin_incidents_status ON plugin_incidents(status);
CREATE INDEX idx_plugin_incidents_severity ON plugin_incidents(severity);
CREATE INDEX idx_plugin_incidents_detected_at ON plugin_incidents(detected_at DESC);
CREATE INDEX idx_plugin_incidents_incident_type ON plugin_incidents(incident_type);

-- ============================================================================
-- 2. Auto-Patch Attempts - Log immuable des tentatives de patch
-- ============================================================================
CREATE TABLE IF NOT EXISTS plugin_autopatch_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES plugin_incidents(id) ON DELETE SET NULL,
  merchant_plugin_id UUID NOT NULL REFERENCES merchant_plugins(id) ON DELETE CASCADE,
  
  from_version TEXT NOT NULL,
  to_version TEXT NOT NULL,
  method TEXT NOT NULL,
  -- Methods: 'patch', 'config_fix', 'reinstall', 'rollback', 'hotfix'
  
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'staging', 'applying', 'success', 'failed', 'rolled_back', 'cancelled')),
  
  -- Logs détaillés
  logs JSONB DEFAULT '[]',
  -- Exemple: [
  --   {"timestamp": "...", "level": "info", "message": "Starting staging tests"},
  --   {"timestamp": "...", "level": "success", "message": "Smoke tests passed"},
  --   {"timestamp": "...", "level": "error", "message": "Health check failed"}
  -- ]
  
  -- Staging results
  staging_result JSONB,
  -- {passed: true, tests_run: 5, duration_ms: 1200, errors: []}
  
  -- Production results
  production_result JSONB,
  -- {applied_at: "...", health_check_passed: true, error_rate_before: 0.5, error_rate_after: 0.1}
  
  -- Execution metadata
  executed_by TEXT NOT NULL, -- 'sira' or user UUID
  executed_at TIMESTAMPTZ DEFAULT now(),
  
  -- Rollback info
  rolled_back_at TIMESTAMPTZ,
  rollback_reason TEXT,
  
  -- Approval (for major patches)
  approved_by JSONB, -- [{user_id: "...", role: "pay_admin", approved_at: "..."}]
  requires_approval BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_autopatch_merchant_plugin_id ON plugin_autopatch_attempts(merchant_plugin_id);
CREATE INDEX idx_autopatch_incident_id ON plugin_autopatch_attempts(incident_id);
CREATE INDEX idx_autopatch_status ON plugin_autopatch_attempts(status);
CREATE INDEX idx_autopatch_executed_at ON plugin_autopatch_attempts(executed_at DESC);

-- ============================================================================
-- 3. Ops Policy - Configuration globale pour auto-patch
-- ============================================================================
CREATE TABLE IF NOT EXISTS ops_policy (
  id INT PRIMARY KEY DEFAULT 1,
  CHECK (id = 1), -- Single row table
  
  -- Kill switch
  autopatch_enabled BOOLEAN DEFAULT true,
  
  -- Whitelist (empty array = all merchants allowed)
  autopatch_whitelist JSONB DEFAULT '[]',
  -- Exemple: ["merchant-uuid-1", "merchant-uuid-2"]
  
  -- Severity threshold
  autopatch_max_severity TEXT DEFAULT 'medium' CHECK (autopatch_max_severity IN ('low', 'medium', 'high', 'critical')),
  -- Auto-patch only for incidents <= this severity
  
  -- Multi-signature requirements
  require_multisig_for_major BOOLEAN DEFAULT true,
  require_multisig_for_high_impact BOOLEAN DEFAULT true,
  multisig_quorum_count INTEGER DEFAULT 2,
  -- Number of approvals required (pay_admin + compliance_ops)
  
  -- Staging requirements
  require_staging_test BOOLEAN DEFAULT true,
  staging_timeout_seconds INTEGER DEFAULT 300, -- 5 minutes
  
  -- Health check requirements
  health_check_timeout_seconds INTEGER DEFAULT 90, -- 90 seconds
  health_check_interval_seconds INTEGER DEFAULT 3,
  
  -- Rollback thresholds
  auto_rollback_on_error_rate_threshold NUMERIC DEFAULT 10.0, -- 10% error rate
  auto_rollback_on_heartbeat_missed_seconds INTEGER DEFAULT 120, -- 2 minutes
  
  -- SIRA settings
  sira_min_confidence NUMERIC DEFAULT 0.75, -- Minimum confidence for auto-patch
  sira_learning_enabled BOOLEAN DEFAULT true,
  
  -- Canary rollout
  canary_percentage INTEGER DEFAULT 0, -- 0-100, percentage of merchants in canary
  canary_merchants JSONB DEFAULT '[]',
  
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID -- User who updated the policy
);

-- Insert default policy
INSERT INTO ops_policy (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 4. SIRA Learning Feedback - Pour améliorer les décisions
-- ============================================================================
CREATE TABLE IF NOT EXISTS sira_learning_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES plugin_incidents(id),
  autopatch_attempt_id UUID REFERENCES plugin_autopatch_attempts(id),
  
  -- SIRA decision that was made
  sira_input JSONB NOT NULL,
  -- {telemetry: {...}, severity: 'medium', historical_data: {...}}
  
  sira_output JSONB NOT NULL,
  -- {action: 'patch', patch_version: '1.2.3', confidence: 0.87, ...}
  
  -- Actual outcome
  actual_outcome TEXT NOT NULL CHECK (actual_outcome IN ('success', 'failed', 'rolled_back', 'partial')),
  outcome_details JSONB,
  
  -- Feedback
  feedback_label TEXT, -- 'positive', 'negative', 'neutral'
  feedback_notes TEXT,
  
  -- Learning metadata
  model_version TEXT,
  training_epoch INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sira_feedback_incident_id ON sira_learning_feedback(incident_id);
CREATE INDEX idx_sira_feedback_outcome ON sira_learning_feedback(actual_outcome);
CREATE INDEX idx_sira_feedback_created_at ON sira_learning_feedback(created_at DESC);

-- ============================================================================
-- 5. Plugin Agent Commands - Queue pour communiquer avec plugins
-- ============================================================================
CREATE TABLE IF NOT EXISTS plugin_agent_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_plugin_id UUID NOT NULL REFERENCES merchant_plugins(id) ON DELETE CASCADE,
  
  command_type TEXT NOT NULL,
  -- Types: 'update', 'rollback', 'config_update', 'health_check', 'restart'
  
  command_payload JSONB NOT NULL,
  -- Exemple: {version: '1.2.3', config: {...}, reason: 'auto-patch'}
  
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'acknowledged', 'executing', 'completed', 'failed', 'timeout')),
  
  -- Delivery
  sent_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Response
  response JSONB,
  error_message TEXT,
  
  -- Retry
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_commands_merchant_plugin_id ON plugin_agent_commands(merchant_plugin_id);
CREATE INDEX idx_agent_commands_status ON plugin_agent_commands(status);
CREATE INDEX idx_agent_commands_next_retry_at ON plugin_agent_commands(next_retry_at) WHERE status = 'pending';

-- ============================================================================
-- 6. Fonctions utilitaires
-- ============================================================================

-- Trigger pour updated_at
CREATE TRIGGER update_plugin_incidents_updated_at
  BEFORE UPDATE ON plugin_incidents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plugin_autopatch_attempts_updated_at
  BEFORE UPDATE ON plugin_autopatch_attempts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plugin_agent_commands_updated_at
  BEFORE UPDATE ON plugin_agent_commands
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Fonction pour calculer la sévérité
CREATE OR REPLACE FUNCTION compute_incident_severity(
  p_incident_type TEXT,
  p_telemetry JSONB
)
RETURNS TEXT AS $$
DECLARE
  error_count INTEGER;
  webhook_fail_rate NUMERIC;
  severity TEXT;
BEGIN
  error_count := COALESCE((p_telemetry->>'errors_last_24h')::INTEGER, 0);
  webhook_fail_rate := COALESCE((p_telemetry->>'webhook_fail_rate')::NUMERIC, 0);
  
  -- Heartbeat missed = critical
  IF p_incident_type = 'heartbeat_missed' THEN
    RETURN 'critical';
  END IF;
  
  -- High error count or webhook failure
  IF error_count > 100 OR webhook_fail_rate > 0.5 THEN
    RETURN 'high';
  END IF;
  
  IF error_count > 50 OR webhook_fail_rate > 0.3 THEN
    RETURN 'medium';
  END IF;
  
  RETURN 'low';
END;
$$ LANGUAGE plpgsql;

-- Fonction pour vérifier si auto-patch est autorisé
CREATE OR REPLACE FUNCTION is_autopatch_allowed(
  p_merchant_id UUID,
  p_severity TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  policy RECORD;
  severity_value INTEGER;
  max_severity_value INTEGER;
BEGIN
  SELECT * INTO policy FROM ops_policy WHERE id = 1;
  
  IF NOT policy.autopatch_enabled THEN
    RETURN false;
  END IF;
  
  -- Check whitelist
  IF jsonb_array_length(policy.autopatch_whitelist) > 0 THEN
    IF NOT (p_merchant_id::TEXT = ANY(SELECT jsonb_array_elements_text(policy.autopatch_whitelist))) THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Check severity threshold
  severity_value := CASE p_severity
    WHEN 'low' THEN 1
    WHEN 'medium' THEN 2
    WHEN 'high' THEN 3
    WHEN 'critical' THEN 4
    ELSE 0
  END;
  
  max_severity_value := CASE policy.autopatch_max_severity
    WHEN 'low' THEN 1
    WHEN 'medium' THEN 2
    WHEN 'high' THEN 3
    WHEN 'critical' THEN 4
    ELSE 0
  END;
  
  RETURN severity_value <= max_severity_value;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. Vues utiles
-- ============================================================================

-- Vue pour incidents avec statistiques
CREATE OR REPLACE VIEW plugin_incidents_stats AS
SELECT 
  i.*,
  mp.merchant_id,
  mp.cms,
  mp.plugin_version,
  COUNT(DISTINCT apa.id) as autopatch_attempts_count,
  COUNT(DISTINCT apa.id) FILTER (WHERE apa.status = 'success') as successful_patches,
  COUNT(DISTINCT apa.id) FILTER (WHERE apa.status = 'rolled_back') as rolled_back_count
FROM plugin_incidents i
JOIN merchant_plugins mp ON mp.id = i.merchant_plugin_id
LEFT JOIN plugin_autopatch_attempts apa ON apa.incident_id = i.id
GROUP BY i.id, mp.merchant_id, mp.cms, mp.plugin_version;

-- Vue pour monitoring auto-patch
CREATE OR REPLACE VIEW autopatch_monitoring AS
SELECT 
  DATE(executed_at) as date,
  COUNT(*) as total_attempts,
  COUNT(*) FILTER (WHERE status = 'success') as successful,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) FILTER (WHERE status = 'rolled_back') as rolled_back,
  AVG(EXTRACT(EPOCH FROM (updated_at - executed_at))) as avg_duration_seconds
FROM plugin_autopatch_attempts
WHERE executed_at >= now() - interval '30 days'
GROUP BY DATE(executed_at)
ORDER BY date DESC;

COMMENT ON TABLE plugin_incidents IS 'Incidents détectés pour plugins avec décisions SIRA';
COMMENT ON TABLE plugin_autopatch_attempts IS 'Tentatives de patch automatique (log immuable)';
COMMENT ON TABLE ops_policy IS 'Configuration globale Ops pour auto-patch (single row)';
COMMENT ON TABLE sira_learning_feedback IS 'Feedback pour apprentissage SIRA';
COMMENT ON TABLE plugin_agent_commands IS 'Queue de commandes pour plugins agents';



