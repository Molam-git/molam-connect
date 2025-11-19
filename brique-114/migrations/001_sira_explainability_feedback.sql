-- Brique 114: SIRA Explainability & Feedback UI
-- Migration: 001_sira_explainability_feedback.sql
-- Description: Tables pour feedback, review queue, explain cache

-- ============================================================================
-- 1. SIRA Feedback - Labels et evidence pour retraining
-- ============================================================================
CREATE TABLE IF NOT EXISTS sira_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id UUID NOT NULL REFERENCES siramodel_predictions(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL, -- Molam ID user
  reviewer_role TEXT NOT NULL,
  -- Roles: 'sira_reviewer', 'pay_admin', 'auditor'
  
  label TEXT NOT NULL CHECK (label IN ('fraud', 'ok', 'needs_review', 'false_positive', 'false_negative')),
  
  override_decision TEXT,
  -- Optional new decision if reviewer overrides SIRA decision
  -- Values: 'approve', 'reject', 'review', 'block'
  
  comment TEXT,
  -- Reviewer notes (PII redacted)
  
  evidence JSONB DEFAULT '[]',
  -- Array of evidence objects:
  -- [
  --   {type: 'image'|'pdf'|'text', s3_key: '...', hash: 'sha256:...', uploaded_at: '...'},
  --   ...
  -- ]
  
  -- Multi-signature tracking (if override requires multi-sig)
  multisig_approvals JSONB DEFAULT '[]',
  -- [{user_id: '...', role: '...', approved_at: '...', signature: '...'}]
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sira_feedback_prediction_id ON sira_feedback(prediction_id);
CREATE INDEX idx_sira_feedback_reviewer_id ON sira_feedback(reviewer_id);
CREATE INDEX idx_sira_feedback_label ON sira_feedback(label);
CREATE INDEX idx_sira_feedback_created_at ON sira_feedback(created_at DESC);

-- ============================================================================
-- 2. Reviewer Queue - Workflow d'approbation
-- ============================================================================
CREATE TABLE IF NOT EXISTS sira_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id UUID NOT NULL REFERENCES siramodel_predictions(id) ON DELETE CASCADE,
  
  assigned_to UUID, -- Optional: specific reviewer assigned
  -- NULL = unassigned, available to any reviewer
  
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed', 'escalated')),
  
  priority SMALLINT DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  -- 1 = highest priority, 10 = lowest
  
  -- Assignment metadata
  assigned_at TIMESTAMPTZ,
  assigned_by UUID,
  
  -- Closure metadata
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  closure_reason TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sira_review_queue_status ON sira_review_queue(status);
CREATE INDEX idx_sira_review_queue_assigned_to ON sira_review_queue(assigned_to);
CREATE INDEX idx_sira_review_queue_priority ON sira_review_queue(priority);
CREATE INDEX idx_sira_review_queue_created_at ON sira_review_queue(created_at DESC);

-- ============================================================================
-- 3. Explain Cache - Cache des explications SHAP
-- ============================================================================
CREATE TABLE IF NOT EXISTS sira_explain_cache (
  prediction_id UUID PRIMARY KEY REFERENCES siramodel_predictions(id) ON DELETE CASCADE,
  
  explain_json JSONB NOT NULL,
  -- Structure:
  -- {
  --   summary: [
  --     {feature: 'amount', contribution: 0.15, direction: 'positive'},
  --     {feature: 'user_age_days', contribution: -0.08, direction: 'negative'},
  --     ...
  --   ],
  --   shap_values: [...], -- Full SHAP values if needed
  --   top_features: 10,
  --   model_version: 'v1.2.3'
  -- }
  
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  computed_by TEXT DEFAULT 'explainer_service',
  computation_time_ms INTEGER,
  
  -- Cache metadata
  cache_hit_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ
);

CREATE INDEX idx_sira_explain_cache_computed_at ON sira_explain_cache(computed_at DESC);
CREATE INDEX idx_sira_explain_cache_last_accessed ON sira_explain_cache(last_accessed_at DESC);

-- ============================================================================
-- 4. Evidence Storage Metadata (optional, if not using S3 metadata)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sira_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES sira_feedback(id) ON DELETE CASCADE,
  
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('image', 'pdf', 'text', 'json')),
  s3_key TEXT NOT NULL,
  s3_bucket TEXT NOT NULL DEFAULT 'molam-sira-evidence',
  
  file_hash TEXT, -- SHA256 hash for provenance
  file_size_bytes INTEGER,
  content_type TEXT,
  
  -- Security scan results
  malware_scan_status TEXT DEFAULT 'pending' CHECK (malware_scan_status IN ('pending', 'clean', 'infected', 'error')),
  malware_scan_at TIMESTAMPTZ,
  
  -- PII redaction
  pii_redacted BOOLEAN DEFAULT false,
  redaction_applied_at TIMESTAMPTZ,
  
  uploaded_by UUID NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sira_evidence_feedback_id ON sira_evidence(feedback_id);
CREATE INDEX idx_sira_evidence_s3_key ON sira_evidence(s3_key);
CREATE INDEX idx_sira_evidence_hash ON sira_evidence(file_hash);

-- ============================================================================
-- 5. Multi-Signature Approvals - Tracking des approbations multi-sig
-- ============================================================================
CREATE TABLE IF NOT EXISTS sira_multisig_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES sira_feedback(id) ON DELETE CASCADE,
  
  approver_id UUID NOT NULL,
  approver_role TEXT NOT NULL,
  
  approval_type TEXT NOT NULL CHECK (approval_type IN ('override_decision', 'high_risk_override')),
  
  signature TEXT NOT NULL, -- Cryptographic signature
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sira_multisig_feedback_id ON sira_multisig_approvals(feedback_id);
CREATE INDEX idx_sira_multisig_approver_id ON sira_multisig_approvals(approver_id);

-- ============================================================================
-- 6. Fonctions utilitaires
-- ============================================================================

-- Trigger pour updated_at
CREATE TRIGGER update_sira_feedback_updated_at
  BEFORE UPDATE ON sira_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sira_review_queue_updated_at
  BEFORE UPDATE ON sira_review_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Fonction pour vérifier si multi-sig est requis
CREATE OR REPLACE FUNCTION requires_multisig(
  p_prediction_id UUID,
  p_override_decision TEXT,
  p_amount NUMERIC DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  pred RECORD;
  threshold NUMERIC := 10000.0; -- Default threshold (configurable)
BEGIN
  -- Get prediction details
  SELECT * INTO pred FROM siramodel_predictions WHERE id = p_prediction_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Multi-sig required if:
  -- 1. Override decision is set
  -- 2. AND (amount > threshold OR decision is 'reject'/'block')
  IF p_override_decision IS NOT NULL THEN
    IF p_amount IS NOT NULL AND p_amount > threshold THEN
      RETURN true;
    END IF;
    
    IF p_override_decision IN ('reject', 'block') THEN
      RETURN true;
    END IF;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour vérifier si multi-sig est complet
CREATE OR REPLACE FUNCTION is_multisig_complete(
  p_feedback_id UUID,
  p_required_count INTEGER DEFAULT 2
)
RETURNS BOOLEAN AS $$
DECLARE
  approval_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO approval_count
  FROM sira_multisig_approvals
  WHERE feedback_id = p_feedback_id;
  
  RETURN approval_count >= p_required_count;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour obtenir le top N des features d'explication
CREATE OR REPLACE FUNCTION get_top_explain_features(
  p_prediction_id UUID,
  p_top_n INTEGER DEFAULT 10
)
RETURNS JSONB AS $$
DECLARE
  explain_data JSONB;
  summary JSONB;
BEGIN
  SELECT explain_json INTO explain_data
  FROM sira_explain_cache
  WHERE prediction_id = p_prediction_id;
  
  IF explain_data IS NULL THEN
    RETURN '[]'::JSONB;
  END IF;
  
  summary := explain_data->'summary';
  
  -- Return top N features sorted by absolute contribution
  RETURN (
    SELECT jsonb_agg(feature ORDER BY ABS((feature->>'contribution')::NUMERIC) DESC)
    FROM jsonb_array_elements(summary) AS feature
    LIMIT p_top_n
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. Vues utiles
-- ============================================================================

-- Vue pour predictions avec feedback status
CREATE OR REPLACE VIEW sira_predictions_with_feedback AS
SELECT 
  p.*,
  COUNT(DISTINCT f.id) as feedback_count,
  MAX(f.created_at) as last_feedback_at,
  ARRAY_AGG(DISTINCT f.label) FILTER (WHERE f.label IS NOT NULL) as feedback_labels,
  BOOL_OR(f.override_decision IS NOT NULL) as has_override,
  rq.status as review_queue_status,
  rq.assigned_to as review_assigned_to
FROM siramodel_predictions p
LEFT JOIN sira_feedback f ON f.prediction_id = p.id
LEFT JOIN sira_review_queue rq ON rq.prediction_id = p.id
GROUP BY p.id, rq.status, rq.assigned_to;

-- Vue pour reviewer dashboard stats
CREATE OR REPLACE VIEW sira_reviewer_stats AS
SELECT 
  DATE(created_at) as review_date,
  reviewer_role,
  label,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE override_decision IS NOT NULL) as override_count
FROM sira_feedback
WHERE created_at >= now() - interval '30 days'
GROUP BY DATE(created_at), reviewer_role, label
ORDER BY review_date DESC, reviewer_role, label;

-- ============================================================================
-- 8. Commentaires
-- ============================================================================

COMMENT ON TABLE sira_feedback IS 'Feedback des reviewers pour améliorer SIRA (labels, evidence, overrides)';
COMMENT ON TABLE sira_review_queue IS 'Queue de review avec workflow d''assignation';
COMMENT ON TABLE sira_explain_cache IS 'Cache des explications SHAP pour performance';
COMMENT ON TABLE sira_evidence IS 'Métadonnées des fichiers evidence (S3)';
COMMENT ON TABLE sira_multisig_approvals IS 'Approbations multi-signature pour overrides à haut risque';

