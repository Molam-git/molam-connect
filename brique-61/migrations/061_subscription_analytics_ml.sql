-- ============================================
-- Brique 61: Subscription Analytics & Churn Prevention (INDUSTRIAL ML)
-- Description: Complete ML platform with feature store, model registry, training pipeline
-- ============================================

-- ============================================
-- PART 1: BASIC ANALYTICS (Existing)
-- ============================================

-- 1) Cohort metrics & analytics
CREATE TABLE IF NOT EXISTS subscription_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  cohort_date DATE NOT NULL,
  plan_id UUID,
  country TEXT,
  currency TEXT,
  mrr NUMERIC(18,2),
  arr NUMERIC(18,2),
  arpu NUMERIC(18,2),
  cltv NUMERIC(18,2),
  churn_rate NUMERIC(5,2),
  active_count INT DEFAULT 0,
  cancelled_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_merchant ON subscription_analytics(merchant_id);
CREATE INDEX IF NOT EXISTS idx_analytics_cohort ON subscription_analytics(cohort_date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_merchant_cohort ON subscription_analytics(merchant_id, cohort_date DESC);

-- ============================================
-- PART 2: ML INFRASTRUCTURE (Feature Store)
-- ============================================

-- 2) Raw events ingestion (from Kafka/webhooks)
CREATE TABLE IF NOT EXISTS subscription_events_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL, -- 'payment_succeeded','payment_failed','login','cancel','plan_change'
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_user ON subscription_events_raw(user_id);
CREATE INDEX IF NOT EXISTS idx_events_merchant ON subscription_events_raw(merchant_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON subscription_events_raw(event_type);
CREATE INDEX IF NOT EXISTS idx_events_occurred ON subscription_events_raw(occurred_at DESC);

-- 3) Feature store (engineered features for ML)
CREATE TABLE IF NOT EXISTS subscription_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  merchant_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  features JSONB NOT NULL, -- flattened numeric & categorical features
  label TEXT, -- 'churned'|'active' (for training)
  label_ts TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, merchant_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_sub_feat_user_snapshot ON subscription_features(user_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_sub_feat_merchant ON subscription_features(merchant_id);
CREATE INDEX IF NOT EXISTS idx_sub_feat_label ON subscription_features(label) WHERE label IS NOT NULL;

-- ============================================
-- PART 3: ML PREDICTIONS & ACTIONS
-- ============================================

-- 4) Churn predictions (INDUSTRIAL VERSION)
CREATE TABLE IF NOT EXISTS churn_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  subscription_id UUID, -- nullable for flexibility
  merchant_id UUID NOT NULL,
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model_version TEXT NOT NULL,
  risk_score NUMERIC(5,2) NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  predicted_reason TEXT,
  recommended_action TEXT,
  decision_context JSONB, -- SHAP explanations / top features
  status TEXT DEFAULT 'suggested' CHECK (status IN ('suggested','actioned','dismissed')),
  actioned_by UUID, -- ops or merchant user who accepted
  actioned_at TIMESTAMPTZ,
  action_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_churn_user ON churn_predictions(user_id, merchant_id);
CREATE INDEX IF NOT EXISTS idx_churn_subscription ON churn_predictions(subscription_id);
CREATE INDEX IF NOT EXISTS idx_churn_merchant ON churn_predictions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_churn_status ON churn_predictions(status);
CREATE INDEX IF NOT EXISTS idx_churn_risk ON churn_predictions(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_churn_model ON churn_predictions(model_version);

-- 5) Feedback loop (INDUSTRIAL VERSION)
CREATE TABLE IF NOT EXISTS sira_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  churn_prediction_id UUID NOT NULL REFERENCES churn_predictions(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('merchant','ops','system')),
  feedback JSONB NOT NULL, -- {accepted: true/false, notes: "...", applied_action: "retry_payment"}
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_prediction ON sira_feedback(churn_prediction_id);
CREATE INDEX IF NOT EXISTS idx_feedback_source ON sira_feedback(source);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON sira_feedback(created_at DESC);

-- ============================================
-- PART 4: MODEL REGISTRY & TRAINING
-- ============================================

-- 6) Model registry (versioning & lifecycle)
CREATE TABLE IF NOT EXISTS model_registry (
  model_name TEXT NOT NULL,
  version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  s3_key TEXT NOT NULL, -- model artifact in S3 (encrypted)
  metrics JSONB, -- {auc:0.91, precision:0.85, recall:0.78}
  status TEXT DEFAULT 'staging' CHECK (status IN ('staging','canary','production','retired')),
  description TEXT,
  PRIMARY KEY(model_name, version)
);

CREATE INDEX IF NOT EXISTS idx_model_registry_status ON model_registry(status);
CREATE INDEX IF NOT EXISTS idx_model_registry_created ON model_registry(created_at DESC);

-- 7) Training logs & experiments
CREATE TABLE IF NOT EXISTS sira_training_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name TEXT NOT NULL,
  version TEXT,
  dataset_ref TEXT,
  params JSONB,
  metrics JSONB,
  artifact_s3_key TEXT,
  source TEXT NOT NULL CHECK (source IN ('auto_daily','ops','merchant_feedback','external_bench','on_demand')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_logs_model ON sira_training_logs(model_name);
CREATE INDEX IF NOT EXISTS idx_training_logs_created ON sira_training_logs(created_at DESC);

-- ============================================
-- PART 5: AUDIT & COMPLIANCE
-- ============================================

-- 8) Audit logs
CREATE TABLE IF NOT EXISTS molam_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON molam_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON molam_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON molam_audit_logs(created_at DESC);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_analytics_updated_at
  BEFORE UPDATE ON subscription_analytics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_features_updated_at
  BEFORE UPDATE ON subscription_features
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE subscription_analytics IS 'Cohort-based subscription analytics (MRR, ARR, churn rate)';
COMMENT ON TABLE subscription_events_raw IS 'Raw event stream for feature engineering';
COMMENT ON TABLE subscription_features IS 'ML feature store with engineered features';
COMMENT ON TABLE churn_predictions IS 'SIRA-powered churn predictions with ML explanations';
COMMENT ON TABLE sira_feedback IS 'Human feedback loop for continuous ML learning';
COMMENT ON TABLE model_registry IS 'ML model versioning and lifecycle management';
COMMENT ON TABLE sira_training_logs IS 'Training experiment tracking and audit trail';

COMMENT ON COLUMN churn_predictions.risk_score IS 'Churn risk 0-100, higher = more risk';
COMMENT ON COLUMN churn_predictions.model_version IS 'Model version used for this prediction';
COMMENT ON COLUMN churn_predictions.decision_context IS 'SHAP explanations and top features';
COMMENT ON COLUMN churn_predictions.recommended_action IS 'Suggested retention action';
COMMENT ON COLUMN model_registry.status IS 'Model lifecycle: staging → canary → production → retired';
COMMENT ON COLUMN model_registry.s3_key IS 'S3 path to encrypted model artifact (KMS)';
