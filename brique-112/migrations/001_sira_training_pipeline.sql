-- Brique 112: SIRA Training & Data Pipeline
-- Infrastructure for SIRA model training, validation, deployment, and monitoring

-- ========================================
-- 1) Dataset Records & Metadata
-- ========================================

-- Events table stores feature snapshots for training
CREATE TABLE IF NOT EXISTS siradata_events (
  event_id UUID PRIMARY KEY,         -- same id as wallet_txn/payment/payout
  source_module TEXT NOT NULL,       -- 'wallet','connect','agent','billing'
  country TEXT,
  currency TEXT,
  features JSONB NOT NULL,           -- raw features snapshot (PII redacted)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_source_module CHECK (source_module IN ('wallet', 'connect', 'agent', 'billing', 'other'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_siradata_events_source ON siradata_events(source_module);
CREATE INDEX IF NOT EXISTS idx_siradata_events_country ON siradata_events(country);
CREATE INDEX IF NOT EXISTS idx_siradata_events_created_at ON siradata_events(created_at DESC);

-- ========================================
-- 2) Labels for Supervised Learning
-- ========================================

CREATE TABLE IF NOT EXISTS siradata_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES siradata_events(event_id) ON DELETE CASCADE,
  label TEXT NOT NULL,               -- 'fraudulent','legit','dispute_won','dispute_lost','chargeback','false_positive','true_positive'
  labelled_by TEXT NOT NULL,         -- 'sira'|'auditor'|'ops'|'merchant'|user_id
  confidence NUMERIC(5,4) DEFAULT 1.0, -- 0.0000-1.0000
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_label CHECK (label IN ('fraudulent', 'legit', 'dispute_won', 'dispute_lost', 'chargeback', 'false_positive', 'true_positive', 'review', 'unknown')),
  CONSTRAINT valid_confidence CHECK (confidence >= 0 AND confidence <= 1)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_labels_event ON siradata_labels(event_id);
CREATE INDEX IF NOT EXISTS idx_labels_label ON siradata_labels(label);
CREATE INDEX IF NOT EXISTS idx_labels_by ON siradata_labels(labelled_by);
CREATE INDEX IF NOT EXISTS idx_labels_created_at ON siradata_labels(created_at DESC);

-- ========================================
-- 3) Model Registry
-- ========================================

CREATE TABLE IF NOT EXISTS siramodel_registry (
  model_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                -- 'sira-fraud','sira-routing','sira-pricing'
  version TEXT NOT NULL,             -- semver or timestamp (e.g., '20250118-1430')
  product TEXT NOT NULL,             -- 'fraud_score','routing','pricing','risk_assessment'
  storage_s3_key TEXT NOT NULL,      -- S3 path to model artifact
  metadata JSONB,                    -- training config, hyperparams, etc.
  metrics JSONB,                     -- validation metrics: auc, f1, recall, precision, etc.
  status TEXT NOT NULL DEFAULT 'candidate', -- candidate, validated, canary, production, archived
  created_by UUID,                   -- Molam ID of who registered the model
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_model_status CHECK (status IN ('candidate', 'validated', 'canary', 'production', 'archived')),
  UNIQUE(name, version)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_model_registry_product ON siramodel_registry(product);
CREATE INDEX IF NOT EXISTS idx_model_registry_status ON siramodel_registry(status);
CREATE INDEX IF NOT EXISTS idx_model_registry_created_at ON siramodel_registry(created_at DESC);

-- ========================================
-- 4) Predictions Log (Immutable)
-- ========================================

CREATE TABLE IF NOT EXISTS siramodel_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID REFERENCES siramodel_registry(model_id) ON DELETE SET NULL,
  event_id UUID NOT NULL,
  score NUMERIC(10,6),               -- prediction score (e.g., fraud probability 0.000000-1.000000)
  decision TEXT,                     -- 'block','allow','review','flag'
  explain JSONB,                     -- SHAP summary or feature importance
  latency_ms INT,                    -- inference latency in milliseconds
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_decision CHECK (decision IN ('block', 'allow', 'review', 'flag', 'none'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_preds_model ON siramodel_predictions(model_id);
CREATE INDEX IF NOT EXISTS idx_preds_event ON siramodel_predictions(event_id);
CREATE INDEX IF NOT EXISTS idx_preds_created_at ON siramodel_predictions(created_at DESC);

-- ========================================
-- 5) Canary Deployment Configuration
-- ========================================

CREATE TABLE IF NOT EXISTS sira_canary_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product TEXT NOT NULL UNIQUE,     -- 'fraud_score','routing','pricing'
  canary_model_id UUID REFERENCES siramodel_registry(model_id) ON DELETE SET NULL,
  production_model_id UUID REFERENCES siramodel_registry(model_id) ON DELETE SET NULL,
  canary_percent INT DEFAULT 0,     -- percentage of traffic to canary (0-100)
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  rollback_threshold JSONB,         -- {'fp_rate_increase': 0.05, 'latency_p99_ms': 500}
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_canary_percent CHECK (canary_percent >= 0 AND canary_percent <= 100)
);

-- ========================================
-- 6) Training Jobs Log
-- ========================================

CREATE TABLE IF NOT EXISTS sira_training_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product TEXT NOT NULL,
  model_name TEXT NOT NULL,
  train_start TIMESTAMPTZ NOT NULL,  -- training window start
  train_end TIMESTAMPTZ NOT NULL,    -- training window end
  status TEXT NOT NULL DEFAULT 'queued', -- queued, running, completed, failed
  result_model_id UUID REFERENCES siramodel_registry(model_id) ON DELETE SET NULL,
  logs TEXT,                         -- training logs/summary
  error_message TEXT,
  started_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT valid_training_status CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_training_jobs_product ON sira_training_jobs(product);
CREATE INDEX IF NOT EXISTS idx_training_jobs_status ON sira_training_jobs(status);
CREATE INDEX IF NOT EXISTS idx_training_jobs_created_at ON sira_training_jobs(created_at DESC);

-- ========================================
-- 7) Model Performance Metrics (Time-Series)
-- ========================================

CREATE TABLE IF NOT EXISTS sira_model_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES siramodel_registry(model_id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,         -- 'auc','f1','precision','recall','fp_rate','latency_p99'
  metric_value NUMERIC(10,6) NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_model_metrics_model ON sira_model_metrics(model_id);
CREATE INDEX IF NOT EXISTS idx_model_metrics_name ON sira_model_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_model_metrics_created_at ON sira_model_metrics(created_at DESC);

-- ========================================
-- Helper Functions
-- ========================================

-- Get production model for a product
CREATE OR REPLACE FUNCTION get_production_model(p_product TEXT)
RETURNS UUID AS $$
DECLARE
  v_model_id UUID;
BEGIN
  SELECT model_id
  INTO v_model_id
  FROM siramodel_registry
  WHERE product = p_product
    AND status = 'production'
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN v_model_id;
END;
$$ LANGUAGE plpgsql;

-- Get canary model for a product
CREATE OR REPLACE FUNCTION get_canary_model(p_product TEXT)
RETURNS UUID AS $$
DECLARE
  v_model_id UUID;
BEGIN
  SELECT canary_model_id
  INTO v_model_id
  FROM sira_canary_config
  WHERE product = p_product
    AND canary_percent > 0
    AND (end_at IS NULL OR end_at > now());

  RETURN v_model_id;
END;
$$ LANGUAGE plpgsql;

-- Count events by label
CREATE OR REPLACE FUNCTION count_events_by_label(
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ
)
RETURNS TABLE(label TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.label,
    COUNT(*)::BIGINT as count
  FROM siradata_labels l
  WHERE l.created_at BETWEEN p_start AND p_end
  GROUP BY l.label
  ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- Views for Monitoring
-- ========================================

-- Active models view
CREATE OR REPLACE VIEW v_active_models AS
SELECT
  m.model_id,
  m.name,
  m.version,
  m.product,
  m.status,
  m.metrics,
  m.created_at,
  c.canary_percent,
  c.canary_model_id = m.model_id as is_canary
FROM siramodel_registry m
LEFT JOIN sira_canary_config c ON m.product = c.product
WHERE m.status IN ('production', 'canary')
ORDER BY m.product, m.created_at DESC;

-- Training dataset summary
CREATE OR REPLACE VIEW v_training_dataset_summary AS
SELECT
  source_module,
  country,
  currency,
  COUNT(*) as event_count,
  MIN(created_at) as earliest_event,
  MAX(created_at) as latest_event
FROM siradata_events
GROUP BY source_module, country, currency
ORDER BY event_count DESC;

-- ========================================
-- Triggers
-- ========================================

-- Update updated_at automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_siramodel_registry_updated_at
BEFORE UPDATE ON siramodel_registry
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sira_canary_config_updated_at
BEFORE UPDATE ON sira_canary_config
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- Comments
-- ========================================

COMMENT ON TABLE siradata_events IS 'Feature snapshots for SIRA training (PII redacted)';
COMMENT ON TABLE siradata_labels IS 'Supervised learning labels from ops, auditors, or SIRA auto-labeling';
COMMENT ON TABLE siramodel_registry IS 'Registry of all SIRA models with versions and metrics';
COMMENT ON TABLE siramodel_predictions IS 'Immutable log of all model predictions with explainability';
COMMENT ON TABLE sira_canary_config IS 'Canary deployment configuration for gradual rollout';
COMMENT ON TABLE sira_training_jobs IS 'Log of training job executions';
COMMENT ON TABLE sira_model_metrics IS 'Time-series metrics for model performance monitoring';

COMMENT ON COLUMN siradata_events.features IS 'JSONB containing redacted feature vector';
COMMENT ON COLUMN siradata_labels.confidence IS 'Label confidence (1.0 for human, <1.0 for SIRA auto-label)';
COMMENT ON COLUMN siramodel_predictions.explain IS 'SHAP summary or feature importance for explainability';
COMMENT ON COLUMN sira_canary_config.canary_percent IS 'Percentage of traffic routed to canary model (0-100)';
