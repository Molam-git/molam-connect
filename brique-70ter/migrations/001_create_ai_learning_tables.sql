-- =====================================================
-- Sous-Brique 70ter — SIRA Auto-Learning Marketing Engine
-- Migration: Federated Learning & Auto-Training tables
-- =====================================================

-- Table: AI training runs per merchant (local models)
CREATE TABLE IF NOT EXISTS marketing_ai_training_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

    model_version   TEXT NOT NULL,
    -- Version format: "v1.0-local", "v1.2-federated", "v2.0-personalized"

    model_type      TEXT NOT NULL DEFAULT 'local',
    -- local: Trained only on merchant's data
    -- federated: Trained with federated learning
    -- personalized: Fine-tuned from global model
    -- external: Trained with external data

    training_data   JSONB NOT NULL,
    -- Metadata about training data (NOT the actual data):
    -- {
    --   "orders_count": 1250,
    --   "date_range": {"start": "2024-10-01", "end": "2025-01-15"},
    --   "features_used": ["amount", "category", "country", "seasonality"],
    --   "external_sources": ["industry_benchmarks", "seasonal_trends"]
    -- }

    metrics         JSONB NOT NULL,
    -- Training metrics:
    -- {
    --   "accuracy": 0.87,
    --   "precision": 0.84,
    --   "recall": 0.89,
    --   "f1_score": 0.86,
    --   "loss": 0.13,
    --   "predicted_uplift": 12.5,
    --   "confidence": 0.92,
    --   "training_time_ms": 1250,
    --   "data_size_mb": 2.3
    -- }

    hyperparameters JSONB,
    -- Model hyperparameters:
    -- {
    --   "learning_rate": 0.001,
    --   "batch_size": 32,
    --   "epochs": 50,
    --   "optimizer": "adam",
    --   "regularization": 0.01
    -- }

    source_type     TEXT NOT NULL,
    -- internal: Only merchant's transactional data
    -- external: Crawler + APIs + open datasets
    -- federated: Aggregated from multiple merchants
    -- hybrid: Mix of internal + external

    model_weights_hash TEXT,
    -- Hash of model weights for integrity check
    -- Actual weights stored separately (file storage or separate table)

    deployed        BOOLEAN DEFAULT false,
    deployed_at     TIMESTAMPTZ,

    training_duration_ms INTEGER,
    -- How long training took

    notes           TEXT,
    -- Human or system notes about this training run

    created_by      UUID REFERENCES users(id),
    -- NULL if automated, user ID if manual trigger

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_runs_merchant ON marketing_ai_training_runs(merchant_id);
CREATE INDEX idx_training_runs_version ON marketing_ai_training_runs(model_version);
CREATE INDEX idx_training_runs_type ON marketing_ai_training_runs(model_type);
CREATE INDEX idx_training_runs_source ON marketing_ai_training_runs(source_type);
CREATE INDEX idx_training_runs_created ON marketing_ai_training_runs(created_at DESC);
CREATE INDEX idx_training_runs_deployed ON marketing_ai_training_runs(deployed, deployed_at DESC) WHERE deployed = true;

COMMENT ON TABLE marketing_ai_training_runs IS 'Local model training runs per merchant with federated learning support';


-- Table: Global aggregated models (federated aggregation)
CREATE TABLE IF NOT EXISTS marketing_ai_global_models (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    version         TEXT NOT NULL UNIQUE,
    -- Global version: "v1.0-global", "v2.0-global"

    description     TEXT,
    -- Human-readable description of what this model does

    aggregation_method TEXT NOT NULL DEFAULT 'federated_averaging',
    -- federated_averaging: FedAvg algorithm
    -- weighted_averaging: Weighted by data size
    -- ensemble: Ensemble of models

    metrics         JSONB NOT NULL,
    -- Global aggregated metrics:
    -- {
    --   "avg_accuracy": 0.85,
    --   "std_accuracy": 0.03,
    --   "contributing_merchants": 45,
    --   "total_data_points": 125000,
    --   "aggregation_rounds": 10
    -- }

    contributing_runs UUID[],
    -- Array of training_run IDs that contributed to this global model

    model_weights_hash TEXT,
    -- Hash of global aggregated weights

    deployed        BOOLEAN DEFAULT false,
    -- Is this the currently deployed global model?

    deployed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_global_models_version ON marketing_ai_global_models(version);
CREATE INDEX idx_global_models_deployed ON marketing_ai_global_models(deployed, deployed_at DESC) WHERE deployed = true;

COMMENT ON TABLE marketing_ai_global_models IS 'Global federated models aggregated from merchant local models';


-- Table: External data collection logs (crawler, APIs, datasets)
CREATE TABLE IF NOT EXISTS marketing_ai_external_data (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    source_type     TEXT NOT NULL,
    -- crawler: Web scraping
    -- api: Public API data
    -- dataset: Open dataset import
    -- benchmark: Industry benchmark data

    source_name     TEXT NOT NULL,
    -- e.g., "shopify_trends", "stripe_industry_report", "black_friday_dataset"

    data_category   TEXT NOT NULL,
    -- pricing, seasonality, conversion_rates, discount_rates, churn_benchmarks

    data_summary    JSONB NOT NULL,
    -- Summary of collected data (NOT raw data):
    -- {
    --   "records_count": 5000,
    --   "date_range": {"start": "2024-01-01", "end": "2024-12-31"},
    --   "countries": ["US", "FR", "SN"],
    --   "industries": ["e-commerce", "saas"],
    --   "key_insights": ["avg_discount_rate": 15.2, "peak_season": "Q4"]
    -- }

    quality_score   NUMERIC(3,2) CHECK (quality_score >= 0 AND quality_score <= 1),
    -- Data quality assessment 0-1

    used_in_training BOOLEAN DEFAULT false,
    -- Has this data been used in any training run?

    expires_at      TIMESTAMPTZ,
    -- When this data should be refreshed

    collected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_external_data_source ON marketing_ai_external_data(source_type, source_name);
CREATE INDEX idx_external_data_category ON marketing_ai_external_data(data_category);
CREATE INDEX idx_external_data_collected ON marketing_ai_external_data(collected_at DESC);
CREATE INDEX idx_external_data_expires ON marketing_ai_external_data(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE marketing_ai_external_data IS 'External data collection logs for AI training enrichment';


-- Table: Personalized model configurations per merchant
CREATE TABLE IF NOT EXISTS marketing_ai_merchant_configs (
    merchant_id     UUID PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,

    model_version   TEXT NOT NULL,
    -- Which model version is active for this merchant

    personalization_level TEXT NOT NULL DEFAULT 'medium',
    -- low: Use mostly global model
    -- medium: Balanced local + global
    -- high: Heavy personalization
    -- custom: Fully custom model

    training_frequency TEXT NOT NULL DEFAULT 'weekly',
    -- daily, weekly, monthly, on_demand

    auto_deploy     BOOLEAN DEFAULT false,
    -- Automatically deploy new models after training?

    min_confidence  NUMERIC(3,2) DEFAULT 0.80,
    -- Minimum confidence to auto-deploy

    features_enabled JSONB DEFAULT '{}',
    -- Which features to enable:
    -- {
    --   "seasonal_adjustment": true,
    --   "competitor_analysis": true,
    --   "churn_prediction": true,
    --   "cross_sell": false
    -- }

    data_sources    JSONB DEFAULT '{"internal": true, "external": false, "federated": false}',
    -- Which data sources to use

    privacy_level   TEXT NOT NULL DEFAULT 'private',
    -- private: Data never leaves merchant environment
    -- federated: Participate in federated learning
    -- public: Allow anonymized data sharing for research

    last_trained_at TIMESTAMPTZ,
    next_training_at TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_merchant_configs_version ON marketing_ai_merchant_configs(model_version);
CREATE INDEX idx_merchant_configs_next_training ON marketing_ai_merchant_configs(next_training_at) WHERE next_training_at IS NOT NULL;

COMMENT ON TABLE marketing_ai_merchant_configs IS 'Per-merchant AI model configuration and preferences';


-- Table: Model performance tracking over time
CREATE TABLE IF NOT EXISTS marketing_ai_performance_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    model_version   TEXT NOT NULL,

    metric_name     TEXT NOT NULL,
    -- e.g., "recommendation_acceptance_rate", "predicted_vs_actual_uplift", "false_positive_rate"

    metric_value    NUMERIC NOT NULL,

    reference_period JSONB NOT NULL,
    -- {"start": "2025-01-01", "end": "2025-01-07"}

    comparison_baseline NUMERIC,
    -- Baseline to compare against (e.g., previous model, industry average)

    improvement     NUMERIC,
    -- Percentage improvement vs baseline

    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_performance_merchant ON marketing_ai_performance_logs(merchant_id);
CREATE INDEX idx_performance_model ON marketing_ai_performance_logs(model_version);
CREATE INDEX idx_performance_metric ON marketing_ai_performance_logs(metric_name);
CREATE INDEX idx_performance_recorded ON marketing_ai_performance_logs(recorded_at DESC);

COMMENT ON TABLE marketing_ai_performance_logs IS 'Real-world performance tracking of deployed models';


-- Table: Crawler job queue
CREATE TABLE IF NOT EXISTS marketing_ai_crawler_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    job_type        TEXT NOT NULL,
    -- competitor_pricing, seasonal_trends, industry_reports, discount_analysis

    target_urls     TEXT[],
    -- URLs to crawl

    filters         JSONB,
    -- Filters to apply: {"industry": "e-commerce", "country": "FR"}

    status          TEXT NOT NULL DEFAULT 'pending',
    -- pending, running, completed, failed

    progress        JSONB DEFAULT '{"urls_crawled": 0, "urls_total": 0, "data_collected": 0}',

    result_summary  JSONB,
    -- Summary of crawl results

    error_message   TEXT,

    priority        INTEGER DEFAULT 5,
    -- 1 (highest) to 10 (lowest)

    scheduled_at    TIMESTAMPTZ,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,

    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crawler_jobs_status ON marketing_ai_crawler_jobs(status);
CREATE INDEX idx_crawler_jobs_priority ON marketing_ai_crawler_jobs(priority, scheduled_at);
CREATE INDEX idx_crawler_jobs_created ON marketing_ai_crawler_jobs(created_at DESC);

COMMENT ON TABLE marketing_ai_crawler_jobs IS 'Queue for autonomous web crawler jobs';


-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_ai_learning_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marketing_ai_training_runs_updated_at
    BEFORE UPDATE ON marketing_ai_training_runs
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_learning_updated_at();

CREATE TRIGGER marketing_ai_merchant_configs_updated_at
    BEFORE UPDATE ON marketing_ai_merchant_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_learning_updated_at();
