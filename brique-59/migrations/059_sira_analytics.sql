-- Brique 59: SIRA Dispute Analytics & Auto-Resolution
-- Self-improving ML system for dispute automation

-- 1) Merchant dispute profiles (benchmarking & analytics)
CREATE TABLE IF NOT EXISTS merchant_dispute_profiles (
  merchant_id UUID PRIMARY KEY,
  total_disputes BIGINT DEFAULT 0,
  disputes_won BIGINT DEFAULT 0,
  disputes_lost BIGINT DEFAULT 0,
  disputes_settled BIGINT DEFAULT 0,
  win_rate NUMERIC(5,2) DEFAULT 0,
  loss_rate NUMERIC(5,2) DEFAULT 0,
  avg_resolution_days NUMERIC(6,2) DEFAULT 0,
  avg_dispute_amount NUMERIC(18,2) DEFAULT 0,
  total_chargebacks NUMERIC(18,2) DEFAULT 0,
  -- Sector/country context
  sector TEXT,
  country TEXT,
  -- Benchmarks
  benchmark_win_rate NUMERIC(5,2) DEFAULT 0,
  benchmark_avg_days NUMERIC(6,2) DEFAULT 0,
  percentile_rank NUMERIC(5,2) DEFAULT 50,
  -- Evidence quality metrics
  avg_evidence_count NUMERIC(6,2) DEFAULT 0,
  evidence_quality_score NUMERIC(5,2) DEFAULT 0,
  -- Automation metrics
  auto_resolution_rate NUMERIC(5,2) DEFAULT 0,
  sira_accuracy NUMERIC(5,2) DEFAULT 0,
  -- Metadata
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_profiles_sector ON merchant_dispute_profiles(sector, country);
CREATE INDEX IF NOT EXISTS idx_merchant_profiles_updated ON merchant_dispute_profiles(last_updated);

-- 2) Sector benchmarks (aggregated stats)
CREATE TABLE IF NOT EXISTS sector_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector TEXT NOT NULL,
  country TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  merchant_count INTEGER DEFAULT 0,
  avg_win_rate NUMERIC(5,2) DEFAULT 0,
  median_win_rate NUMERIC(5,2) DEFAULT 0,
  p25_win_rate NUMERIC(5,2) DEFAULT 0,
  p75_win_rate NUMERIC(5,2) DEFAULT 0,
  avg_resolution_days NUMERIC(6,2) DEFAULT 0,
  total_disputes BIGINT DEFAULT 0,
  auto_resolution_rate NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sector, country, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_sector_benchmarks_lookup ON sector_benchmarks(sector, country, period_end DESC);

-- 3) SIRA ML models (versioning & A/B testing)
CREATE TABLE IF NOT EXISTS sira_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'candidate',  -- candidate|active|retired|testing
  model_type TEXT NOT NULL,                  -- dispute_scorer|evidence_quality|chargeback_predictor
  -- Artifacts
  artifact_s3_key TEXT,
  artifact_hash TEXT,
  -- Performance metrics
  accuracy NUMERIC(5,4) DEFAULT 0,
  precision_score NUMERIC(5,4) DEFAULT 0,
  recall NUMERIC(5,4) DEFAULT 0,
  f1_score NUMERIC(5,4) DEFAULT 0,
  -- Training info
  training_dataset_size BIGINT,
  training_completed_at TIMESTAMPTZ,
  -- Hyperparameters and config
  hyperparameters JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  -- Deployment
  deployed_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'system',
  UNIQUE(model_name, version)
);

CREATE INDEX IF NOT EXISTS idx_sira_models_status ON sira_models(status, model_type);
CREATE INDEX IF NOT EXISTS idx_sira_models_active ON sira_models(model_type, status) WHERE status = 'active';

-- 4) SIRA model predictions (for feedback loop)
CREATE TABLE IF NOT EXISTS sira_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL,
  model_id UUID NOT NULL REFERENCES sira_models(id),
  model_version TEXT NOT NULL,
  -- Prediction
  win_probability NUMERIC(5,4) NOT NULL,
  confidence NUMERIC(5,4) NOT NULL,
  recommended_action TEXT NOT NULL,
  reasons JSONB DEFAULT '[]',
  -- Actual outcome (for feedback)
  actual_outcome TEXT,                        -- won|lost|settled
  prediction_correct BOOLEAN,
  -- Metadata
  features_used JSONB DEFAULT '{}',
  prediction_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  outcome_recorded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sira_predictions_dispute ON sira_predictions(dispute_id);
CREATE INDEX IF NOT EXISTS idx_sira_predictions_model ON sira_predictions(model_id);
CREATE INDEX IF NOT EXISTS idx_sira_predictions_feedback ON sira_predictions(actual_outcome, prediction_correct) WHERE actual_outcome IS NOT NULL;

-- 5) SIRA self-improvement patches (auto-evolution)
CREATE TABLE IF NOT EXISTS sira_patches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patch_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  patch_type TEXT NOT NULL,                  -- code|hyperparameters|training_data|feature_engineering
  -- Patch content
  code_diff TEXT,
  config_changes JSONB DEFAULT '{}',
  description TEXT,
  -- Testing
  tests_passed BOOLEAN DEFAULT false,
  test_results JSONB DEFAULT '{}',
  sandbox_accuracy_before NUMERIC(5,4),
  sandbox_accuracy_after NUMERIC(5,4),
  accuracy_improvement NUMERIC(5,4),
  -- Deployment
  status TEXT DEFAULT 'pending',             -- pending|testing|approved|deployed|rejected
  deployed BOOLEAN DEFAULT false,
  deployed_at TIMESTAMPTZ,
  approved_by TEXT,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'sira_self_improver',
  rejection_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_sira_patches_status ON sira_patches(status, created_at DESC);

-- 6) SIRA recommendations (dynamic widgets)
CREATE TABLE IF NOT EXISTS sira_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  recommendation_type TEXT NOT NULL,         -- evidence_improvement|process_optimization|threshold_adjustment|training_needed
  priority TEXT DEFAULT 'medium',            -- low|medium|high|critical
  title TEXT NOT NULL,
  description TEXT,
  action_items JSONB DEFAULT '[]',
  -- Metrics
  potential_impact_win_rate NUMERIC(5,2),
  estimated_disputes_affected INTEGER,
  -- Status
  status TEXT DEFAULT 'active',              -- active|dismissed|implemented|expired
  dismissed_at TIMESTAMPTZ,
  implemented_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sira_recommendations_merchant ON sira_recommendations(merchant_id, status, priority);

-- 7) SIRA feature importance (explainability)
CREATE TABLE IF NOT EXISTS sira_feature_importance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES sira_models(id),
  feature_name TEXT NOT NULL,
  importance_score NUMERIC(6,4) NOT NULL,
  rank INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(model_id, feature_name)
);

CREATE INDEX IF NOT EXISTS idx_feature_importance_model ON sira_feature_importance(model_id, rank);

-- 8) Audit logs (shared)
CREATE TABLE IF NOT EXISTS molam_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT,
  changes JSONB,
  merchant_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON molam_audit_logs(entity_type, entity_id, created_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER merchant_profiles_updated_at
BEFORE UPDATE ON merchant_dispute_profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
