-- =====================================================================
-- Brique 83 — SIRA Insights (AI Layer)
-- =====================================================================
-- Feature store, model registry, predictions, feedback
-- Date: 2025-11-12
-- =====================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- =====================================================================
-- Feature Store Tables
-- =====================================================================

-- Raw features (time-series, append-only)
CREATE TABLE IF NOT EXISTS sira_features (
  id BIGSERIAL PRIMARY KEY,

  -- Entity identification
  entity_type TEXT NOT NULL CHECK (entity_type IN ('user', 'merchant', 'agent', 'transaction', 'device', 'session')),
  entity_id UUID NOT NULL,

  -- Feature details
  feature_key TEXT NOT NULL,
  feature_value DOUBLE PRECISION,
  feature_value_text TEXT, -- For categorical features

  -- Temporal information
  sample_ts TIMESTAMPTZ NOT NULL,
  event_id TEXT, -- Link to source event

  -- Metadata
  feature_group TEXT, -- e.g., 'user_behavior', 'txn_velocity'
  source TEXT, -- e.g., 'kafka:wallet_txn', 'batch:daily_aggregates'
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast feature lookup
CREATE INDEX idx_sira_features_entity ON sira_features(entity_type, entity_id, feature_key, sample_ts DESC);
CREATE INDEX idx_sira_features_sample_ts ON sira_features(sample_ts DESC);
CREATE INDEX idx_sira_features_group ON sira_features(feature_group) WHERE feature_group IS NOT NULL;

-- Partitioning by month for scalability
-- CREATE TABLE sira_features_2025_11 PARTITION OF sira_features FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

COMMENT ON TABLE sira_features IS 'Raw time-series features for ML models';

-- =====================================================================
-- Feature Snapshots (Materialized for fast serving)
-- =====================================================================

CREATE TABLE IF NOT EXISTS sira_feature_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Entity identification
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,

  -- Snapshot information
  snapshot_ts TIMESTAMPTZ NOT NULL,
  features JSONB NOT NULL, -- Flattened feature vector: {"feature_1": 0.5, "feature_2": 10}

  -- Feature schema version (for compatibility)
  schema_version TEXT DEFAULT '1.0',

  -- TTL for cache invalidation
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(entity_type, entity_id, snapshot_ts)
);

-- Indexes
CREATE INDEX idx_sira_snapshots_entity_ts ON sira_feature_snapshots(entity_type, entity_id, snapshot_ts DESC);
CREATE INDEX idx_sira_snapshots_expires ON sira_feature_snapshots(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_sira_snapshots_features ON sira_feature_snapshots USING gin(features);

COMMENT ON TABLE sira_feature_snapshots IS 'Materialized feature snapshots for fast inference serving';

-- =====================================================================
-- Model Registry
-- =====================================================================

CREATE TABLE IF NOT EXISTS sira_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Model identification
  name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  description TEXT,

  -- Model type
  model_type TEXT NOT NULL CHECK (model_type IN (
    'fraud_detection',
    'risk_scoring',
    'churn_prediction',
    'route_optimization',
    'pricing_recommendation',
    'anomaly_detection',
    'sentiment_analysis',
    'custom'
  )),

  -- Ownership
  owner TEXT NOT NULL, -- User ID or team name
  team TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  tags TEXT[],
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sira_models_type ON sira_models(model_type);
CREATE INDEX idx_sira_models_active ON sira_models(is_active) WHERE is_active = true;

COMMENT ON TABLE sira_models IS 'Model registry - high-level model definitions';

-- =====================================================================
-- Model Versions
-- =====================================================================

CREATE TABLE IF NOT EXISTS sira_model_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Model reference
  model_id UUID NOT NULL REFERENCES sira_models(id) ON DELETE CASCADE,

  -- Version information
  version INTEGER NOT NULL,
  semantic_version TEXT, -- e.g., "1.2.3"

  -- Artifact storage
  artifact_s3_key TEXT NOT NULL, -- S3 path to model binary
  artifact_size_bytes BIGINT,
  artifact_checksum TEXT, -- SHA256 for integrity

  -- Model schema
  input_schema JSONB NOT NULL, -- {"feature_1": "float", "feature_2": "int"}
  output_schema JSONB, -- {"risk_score": "float", "classification": "string"}

  -- Performance metrics
  metrics JSONB, -- {"auc": 0.95, "precision": 0.90, "recall": 0.88}
  validation_results JSONB, -- Detailed validation test results

  -- Training information
  training_dataset_id TEXT,
  training_run_id UUID,
  hyperparameters JSONB,
  feature_importance JSONB, -- Top features and their importance scores

  -- Deployment status
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN (
    'candidate',      -- Newly trained, awaiting validation
    'validated',      -- Passed validation tests
    'staging',        -- Deployed to staging environment
    'production',     -- Active in production
    'shadow',         -- Running in shadow mode (predictions logged but not used)
    'deprecated',     -- Old version, no longer used
    'rejected'        -- Failed validation or rejected by ops
  )),

  -- Approval workflow
  requires_approval BOOLEAN DEFAULT true,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  approval_notes TEXT,

  -- Deployment tracking
  promoted_at TIMESTAMPTZ,
  promoted_by UUID,
  deprecated_at TIMESTAMPTZ,

  -- Metadata
  tags TEXT[],
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(model_id, version)
);

-- Indexes
CREATE INDEX idx_model_versions_model ON sira_model_versions(model_id, version DESC);
CREATE INDEX idx_model_versions_status ON sira_model_versions(status);
CREATE INDEX idx_model_versions_production ON sira_model_versions(model_id, status) WHERE status = 'production';

COMMENT ON TABLE sira_model_versions IS 'Model versions with artifacts, metrics, and deployment status';

-- =====================================================================
-- Training Runs (Audit log for model training)
-- =====================================================================

CREATE TABLE IF NOT EXISTS sira_training_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Model version reference (NULL if training failed before version creation)
  model_id UUID REFERENCES sira_models(id) ON DELETE SET NULL,
  model_version_id UUID REFERENCES sira_model_versions(id) ON DELETE SET NULL,

  -- Run identification
  run_name TEXT,
  run_id_external TEXT, -- e.g., MLflow run ID

  -- Training parameters
  algorithm TEXT, -- 'lightgbm', 'xgboost', 'pytorch', etc.
  hyperparameters JSONB,
  dataset_id TEXT,
  dataset_size INTEGER,

  -- Training environment
  environment TEXT, -- 'dev', 'staging', 'production'
  executor TEXT, -- User or system that triggered training
  git_commit TEXT, -- Code version
  docker_image TEXT,

  -- Performance metrics
  metrics JSONB, -- {"train_auc": 0.96, "val_auc": 0.95, "test_auc": 0.94}

  -- Artifacts
  run_artifact_s3 TEXT, -- Logs, plots, artifacts
  model_artifact_s3 TEXT,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN (
    'pending',
    'running',
    'finished',
    'failed',
    'cancelled'
  )),

  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  duration_seconds INTEGER,

  -- Error tracking
  error_message TEXT,
  error_stack TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_training_runs_model ON sira_training_runs(model_id, started_at DESC);
CREATE INDEX idx_training_runs_status ON sira_training_runs(status, started_at DESC);
CREATE INDEX idx_training_runs_external ON sira_training_runs(run_id_external) WHERE run_id_external IS NOT NULL;

COMMENT ON TABLE sira_training_runs IS 'Audit log for model training runs';

-- =====================================================================
-- Predictions (Audit log for inference)
-- =====================================================================

CREATE TABLE IF NOT EXISTS sira_predictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Model reference
  model_id UUID REFERENCES sira_models(id) ON DELETE SET NULL,
  model_version_id UUID REFERENCES sira_model_versions(id) ON DELETE SET NULL,

  -- Entity being scored
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,

  -- Prediction input/output
  input_features JSONB NOT NULL,
  prediction JSONB NOT NULL, -- {"risk_score": 0.85, "classification": "high_risk"}
  raw_score DOUBLE PRECISION, -- Main score for quick filtering

  -- Explainability
  explanation JSONB, -- SHAP values, feature contributions
  explanation_type TEXT, -- 'shap', 'lime', 'feature_importance'

  -- Request context
  request_id TEXT,
  session_id TEXT,
  user_agent TEXT,
  ip_address INET,

  -- Confidence & calibration
  confidence DOUBLE PRECISION, -- Model confidence (0-1)
  calibrated_score DOUBLE PRECISION, -- Post-calibration score

  -- Action taken
  action_taken TEXT, -- 'approved', 'rejected', 'held_for_review'
  action_metadata JSONB,

  -- Performance tracking
  inference_time_ms INTEGER,
  cache_hit BOOLEAN DEFAULT false,

  -- Metadata
  tags TEXT[],
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_predictions_entity ON sira_predictions(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_predictions_model ON sira_predictions(model_version_id, created_at DESC);
CREATE INDEX idx_predictions_score ON sira_predictions(raw_score) WHERE raw_score IS NOT NULL;
CREATE INDEX idx_predictions_created ON sira_predictions(created_at DESC);

-- Partitioning by month for scalability
-- CREATE TABLE sira_predictions_2025_11 PARTITION OF sira_predictions FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

COMMENT ON TABLE sira_predictions IS 'Audit log for model predictions (inference)';

-- =====================================================================
-- Feedback (Human-in-the-loop labels)
-- =====================================================================

CREATE TABLE IF NOT EXISTS sira_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Prediction reference
  prediction_id UUID REFERENCES sira_predictions(id) ON DELETE CASCADE,

  -- Entity reference (if not tied to specific prediction)
  entity_type TEXT,
  entity_id UUID,

  -- Feedback details
  feedback_type TEXT NOT NULL CHECK (feedback_type IN (
    'label',           -- Ground truth label
    'correction',      -- Correction to prediction
    'flag',            -- Flag as incorrect
    'verification',    -- Verification that prediction was correct
    'comment'          -- General comment
  )),

  -- Label information
  label JSONB, -- {"is_fraud": true, "fraud_type": "synthetic_identity"}
  original_prediction JSONB, -- Original model prediction for comparison

  -- Reviewer information
  reviewer_id UUID NOT NULL,
  reviewer_role TEXT, -- 'ops', 'fraud_analyst', 'merchant', 'system'

  -- Feedback quality
  confidence TEXT, -- 'high', 'medium', 'low'
  source TEXT, -- 'manual_review', 'customer_complaint', 'automated_check'

  -- Notes and reasoning
  note TEXT,
  reasoning TEXT,

  -- Workflow
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'disputed')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,

  -- Impact tracking
  used_in_retraining BOOLEAN DEFAULT false,
  retraining_run_id UUID,

  -- Metadata
  tags TEXT[],
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_feedback_prediction ON sira_feedback(prediction_id);
CREATE INDEX idx_feedback_entity ON sira_feedback(entity_type, entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX idx_feedback_reviewer ON sira_feedback(reviewer_id, created_at DESC);
CREATE INDEX idx_feedback_type ON sira_feedback(feedback_type, created_at DESC);
CREATE INDEX idx_feedback_retraining ON sira_feedback(used_in_retraining) WHERE used_in_retraining = false;

COMMENT ON TABLE sira_feedback IS 'Human-in-the-loop feedback and labels for model improvement';

-- =====================================================================
-- Data Drift Detection
-- =====================================================================

CREATE TABLE IF NOT EXISTS sira_data_drift (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Model reference
  model_id UUID NOT NULL REFERENCES sira_models(id) ON DELETE CASCADE,

  -- Drift detection window
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,

  -- Drift metrics
  feature_name TEXT NOT NULL,
  drift_metric TEXT NOT NULL, -- 'kl_divergence', 'psi', 'ks_statistic'
  drift_score DOUBLE PRECISION NOT NULL,
  threshold DOUBLE PRECISION NOT NULL,
  is_drift_detected BOOLEAN NOT NULL,

  -- Statistical details
  baseline_distribution JSONB, -- {"mean": 0.5, "std": 0.2, "percentiles": [...]}
  current_distribution JSONB,

  -- Alert status
  alert_sent BOOLEAN DEFAULT false,
  alert_sent_at TIMESTAMPTZ,

  -- Actions taken
  action_taken TEXT, -- 'retrain_triggered', 'alert_only', 'none'
  action_metadata JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_drift_model ON sira_data_drift(model_id, window_end DESC);
CREATE INDEX idx_drift_detected ON sira_data_drift(is_drift_detected, created_at DESC) WHERE is_drift_detected = true;

COMMENT ON TABLE sira_data_drift IS 'Data drift detection results for model monitoring';

-- =====================================================================
-- Model Performance Monitoring
-- =====================================================================

CREATE TABLE IF NOT EXISTS sira_model_performance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Model reference
  model_version_id UUID NOT NULL REFERENCES sira_model_versions(id) ON DELETE CASCADE,

  -- Time window
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  aggregation_period TEXT NOT NULL, -- 'hourly', 'daily', 'weekly'

  -- Performance metrics
  prediction_count INTEGER NOT NULL,
  avg_inference_time_ms DOUBLE PRECISION,
  p95_inference_time_ms DOUBLE PRECISION,
  p99_inference_time_ms DOUBLE PRECISION,

  -- Model metrics (if ground truth available)
  accuracy DOUBLE PRECISION,
  precision DOUBLE PRECISION,
  recall DOUBLE PRECISION,
  f1_score DOUBLE PRECISION,
  auc DOUBLE PRECISION,

  -- Prediction distribution
  avg_score DOUBLE PRECISION,
  std_score DOUBLE PRECISION,
  score_distribution JSONB, -- Histogram of scores

  -- Cache performance
  cache_hit_rate DOUBLE PRECISION,

  -- Errors
  error_count INTEGER DEFAULT 0,
  error_rate DOUBLE PRECISION,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(model_version_id, window_start, window_end, aggregation_period)
);

-- Indexes
CREATE INDEX idx_performance_model ON sira_model_performance(model_version_id, window_end DESC);
CREATE INDEX idx_performance_period ON sira_model_performance(aggregation_period, window_end DESC);

COMMENT ON TABLE sira_model_performance IS 'Aggregated model performance metrics over time';

-- =====================================================================
-- Functions & Triggers
-- =====================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_sira_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to relevant tables
CREATE TRIGGER trigger_update_sira_models_timestamp
  BEFORE UPDATE ON sira_models
  FOR EACH ROW
  EXECUTE FUNCTION update_sira_updated_at();

CREATE TRIGGER trigger_update_sira_model_versions_timestamp
  BEFORE UPDATE ON sira_model_versions
  FOR EACH ROW
  EXECUTE FUNCTION update_sira_updated_at();

CREATE TRIGGER trigger_update_sira_snapshots_timestamp
  BEFORE UPDATE ON sira_feature_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION update_sira_updated_at();

CREATE TRIGGER trigger_update_sira_feedback_timestamp
  BEFORE UPDATE ON sira_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_sira_updated_at();

-- =====================================================================
-- Views
-- =====================================================================

-- Active production models
CREATE OR REPLACE VIEW v_sira_production_models AS
SELECT
  m.id as model_id,
  m.name as model_name,
  m.model_type,
  mv.id as version_id,
  mv.version,
  mv.semantic_version,
  mv.metrics,
  mv.promoted_at,
  mv.promoted_by
FROM sira_models m
JOIN sira_model_versions mv ON m.id = mv.model_id
WHERE m.is_active = true
  AND mv.status = 'production';

-- Recent predictions with feedback
CREATE OR REPLACE VIEW v_sira_predictions_with_feedback AS
SELECT
  p.*,
  f.id as feedback_id,
  f.feedback_type,
  f.label as feedback_label,
  f.reviewer_id,
  f.created_at as feedback_created_at
FROM sira_predictions p
LEFT JOIN sira_feedback f ON p.id = f.prediction_id
WHERE p.created_at >= NOW() - INTERVAL '7 days';

-- =====================================================================
-- Seed Data (Example)
-- =====================================================================

-- Insert example fraud detection model
INSERT INTO sira_models (name, display_name, description, model_type, owner, team) VALUES
  ('fraud-detector-v1', 'Fraud Detection Model', 'Real-time transaction fraud detection using LightGBM', 'fraud_detection', 'sira-team', 'ml-platform'),
  ('risk-scorer-v1', 'Risk Scoring Model', 'Merchant risk assessment', 'risk_scoring', 'sira-team', 'ml-platform'),
  ('churn-predictor-v1', 'Churn Prediction', 'Merchant churn prediction', 'churn_prediction', 'sira-team', 'ml-platform')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- Permissions
-- =====================================================================

-- Grant permissions to application roles
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO sira_app;
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO sira_readonly;
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO sira_admin;

-- =====================================================================
-- End of Migration
-- =====================================================================
