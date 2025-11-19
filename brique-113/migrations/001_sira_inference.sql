-- =====================================================================
-- Brique 113: SIRA Inference Service & Low-Latency Router
-- =====================================================================
-- Extensions for inference service performance and observability
-- =====================================================================

-- Ensure siramodel_predictions table exists (from Brique 112)
-- Add additional fields for inference-specific metadata

-- Add inference-specific columns if not present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='siramodel_predictions' AND column_name='decision') THEN
    ALTER TABLE siramodel_predictions ADD COLUMN decision TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='siramodel_predictions' AND column_name='explain') THEN
    ALTER TABLE siramodel_predictions ADD COLUMN explain JSONB;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='siramodel_predictions' AND column_name='latency_ms') THEN
    ALTER TABLE siramodel_predictions ADD COLUMN latency_ms INT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='siramodel_predictions' AND column_name='model_role') THEN
    ALTER TABLE siramodel_predictions ADD COLUMN model_role TEXT; -- 'production' | 'canary'
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='siramodel_predictions' AND column_name='product') THEN
    ALTER TABLE siramodel_predictions ADD COLUMN product TEXT;
  END IF;
END $$;

-- Performance indices for querying predictions
CREATE INDEX IF NOT EXISTS idx_sira_preds_event
  ON siramodel_predictions(event_id);

CREATE INDEX IF NOT EXISTS idx_sira_preds_model_time
  ON siramodel_predictions(model_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sira_preds_product_time
  ON siramodel_predictions(product, created_at DESC)
  WHERE product IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sira_preds_decision
  ON siramodel_predictions(decision, created_at DESC)
  WHERE decision IS NOT NULL;

-- Index for canary analysis
CREATE INDEX IF NOT EXISTS idx_sira_preds_model_role
  ON siramodel_predictions(model_id, model_role, created_at DESC)
  WHERE model_role IS NOT NULL;

-- =====================================================================
-- Inference Metrics Table
-- =====================================================================
-- Real-time aggregated metrics for monitoring and auto-rollback

CREATE TABLE IF NOT EXISTS sira_inference_metrics (
  metric_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product TEXT NOT NULL,
  model_id UUID,
  model_role TEXT, -- 'production' | 'canary'
  metric_name TEXT NOT NULL, -- 'latency_p50', 'latency_p95', 'error_rate', 'fp_rate', etc.
  metric_value NUMERIC(12,6) NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  sample_count INT DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sira_inference_metrics_product_time
  ON sira_inference_metrics(product, window_start DESC);

CREATE INDEX idx_sira_inference_metrics_model_time
  ON sira_inference_metrics(model_id, window_start DESC);

-- =====================================================================
-- Inference Service Health Table
-- =====================================================================
-- Track service health, pod status, and circuit breaker states

CREATE TABLE IF NOT EXISTS sira_inference_health (
  pod_id TEXT PRIMARY KEY,
  service_version TEXT,
  status TEXT NOT NULL, -- 'healthy' | 'degraded' | 'unhealthy'
  models_loaded INT DEFAULT 0,
  cache_hit_rate NUMERIC(5,4),
  avg_latency_ms NUMERIC(10,2),
  error_rate NUMERIC(5,4),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sira_inference_health_heartbeat
  ON sira_inference_health(last_heartbeat DESC);

-- =====================================================================
-- Canary Rollback Log
-- =====================================================================
-- Immutable audit log of canary rollbacks

CREATE TABLE IF NOT EXISTS sira_canary_rollback_log (
  rollback_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product TEXT NOT NULL,
  canary_model_id UUID NOT NULL,
  production_model_id UUID NOT NULL,
  reason TEXT NOT NULL, -- 'high_error_rate' | 'high_latency' | 'manual' | 'fp_rate_threshold'
  trigger_metric_name TEXT,
  trigger_metric_value NUMERIC(12,6),
  threshold_value NUMERIC(12,6),
  rolled_back_by TEXT, -- 'auto' | user_id
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sira_canary_rollback_product
  ON sira_canary_rollback_log(product, created_at DESC);

-- =====================================================================
-- Feature Store Cache Table (Optional)
-- =====================================================================
-- Cache precomputed features for ultra-low latency inference

CREATE TABLE IF NOT EXISTS sira_feature_cache (
  cache_key TEXT PRIMARY KEY,
  event_id UUID,
  product TEXT NOT NULL,
  features JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  hit_count INT DEFAULT 0,
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sira_feature_cache_expires
  ON sira_feature_cache(expires_at)
  WHERE expires_at > now();

CREATE INDEX idx_sira_feature_cache_product
  ON sira_feature_cache(product, computed_at DESC);

-- Auto-cleanup expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_feature_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM sira_feature_cache WHERE expires_at < now() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- Helper Functions
-- =====================================================================

-- Get model performance metrics for comparison
CREATE OR REPLACE FUNCTION get_model_performance(
  p_model_id UUID,
  p_window_hours INT DEFAULT 24
)
RETURNS TABLE (
  metric_name TEXT,
  avg_value NUMERIC,
  p50_value NUMERIC,
  p95_value NUMERIC,
  p99_value NUMERIC,
  sample_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    metric_name,
    AVG(metric_value) as avg_value,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY metric_value) as p50_value,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY metric_value) as p95_value,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY metric_value) as p99_value,
    COUNT(*)::BIGINT as sample_count
  FROM sira_inference_metrics
  WHERE model_id = p_model_id
    AND window_start >= now() - (p_window_hours || ' hours')::INTERVAL
  GROUP BY metric_name;
END;
$$ LANGUAGE plpgsql;

-- Compare canary vs production performance
CREATE OR REPLACE FUNCTION compare_canary_performance(
  p_product TEXT,
  p_canary_model_id UUID,
  p_production_model_id UUID,
  p_window_hours INT DEFAULT 1
)
RETURNS TABLE (
  metric_name TEXT,
  canary_value NUMERIC,
  production_value NUMERIC,
  delta_pct NUMERIC,
  exceeds_threshold BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH canary_metrics AS (
    SELECT metric_name, AVG(metric_value) as avg_val
    FROM sira_inference_metrics
    WHERE model_id = p_canary_model_id
      AND window_start >= now() - (p_window_hours || ' hours')::INTERVAL
    GROUP BY metric_name
  ),
  prod_metrics AS (
    SELECT metric_name, AVG(metric_value) as avg_val
    FROM sira_inference_metrics
    WHERE model_id = p_production_model_id
      AND window_start >= now() - (p_window_hours || ' hours')::INTERVAL
    GROUP BY metric_name
  )
  SELECT
    COALESCE(c.metric_name, p.metric_name) as metric_name,
    c.avg_val as canary_value,
    p.avg_val as production_value,
    CASE
      WHEN p.avg_val = 0 THEN NULL
      ELSE ((c.avg_val - p.avg_val) / p.avg_val * 100)
    END as delta_pct,
    CASE
      WHEN c.metric_name LIKE '%error%' THEN c.avg_val > p.avg_val * 1.5
      WHEN c.metric_name LIKE '%latency%' THEN c.avg_val > p.avg_val * 1.3
      ELSE FALSE
    END as exceeds_threshold
  FROM canary_metrics c
  FULL OUTER JOIN prod_metrics p USING (metric_name);
END;
$$ LANGUAGE plpgsql;

-- Get recent predictions for event
CREATE OR REPLACE FUNCTION get_event_predictions(
  p_event_id UUID,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  prediction_id UUID,
  model_id UUID,
  model_version TEXT,
  score NUMERIC,
  decision TEXT,
  explain JSONB,
  latency_ms INT,
  model_role TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.prediction_id,
    p.model_id,
    p.model_version,
    p.score,
    p.decision,
    p.explain,
    p.latency_ms,
    p.model_role,
    p.created_at
  FROM siramodel_predictions p
  WHERE p.event_id = p_event_id
  ORDER BY p.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- Views
-- =====================================================================

-- Active inference pods view
CREATE OR REPLACE VIEW v_active_inference_pods AS
SELECT
  pod_id,
  service_version,
  status,
  models_loaded,
  cache_hit_rate,
  avg_latency_ms,
  error_rate,
  last_heartbeat,
  EXTRACT(EPOCH FROM (now() - last_heartbeat)) as seconds_since_heartbeat
FROM sira_inference_health
WHERE last_heartbeat >= now() - INTERVAL '5 minutes'
ORDER BY last_heartbeat DESC;

-- Real-time canary performance view
CREATE OR REPLACE VIEW v_canary_performance AS
SELECT
  c.product,
  c.canary_model_id,
  c.production_model_id,
  c.canary_percent,
  m_canary.metric_name,
  m_canary.avg_value as canary_value,
  m_prod.avg_value as production_value,
  CASE
    WHEN m_prod.avg_value = 0 THEN NULL
    ELSE ((m_canary.avg_value - m_prod.avg_value) / m_prod.avg_value * 100)
  END as delta_pct
FROM sira_canary_config c
LEFT JOIN LATERAL (
  SELECT metric_name, AVG(metric_value) as avg_value
  FROM sira_inference_metrics
  WHERE model_id = c.canary_model_id
    AND window_start >= now() - INTERVAL '1 hour'
  GROUP BY metric_name
) m_canary ON true
LEFT JOIN LATERAL (
  SELECT metric_name, AVG(metric_value) as avg_value
  FROM sira_inference_metrics
  WHERE model_id = c.production_model_id
    AND window_start >= now() - INTERVAL '1 hour'
  GROUP BY metric_name
) m_prod ON m_canary.metric_name = m_prod.metric_name
WHERE c.canary_percent > 0;

-- Prediction volume by model and decision
CREATE OR REPLACE VIEW v_prediction_volume_summary AS
SELECT
  product,
  model_id,
  model_role,
  decision,
  COUNT(*) as prediction_count,
  AVG(latency_ms) as avg_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95_latency_ms,
  DATE_TRUNC('hour', created_at) as hour_bucket
FROM siramodel_predictions
WHERE created_at >= now() - INTERVAL '24 hours'
  AND product IS NOT NULL
GROUP BY product, model_id, model_role, decision, DATE_TRUNC('hour', created_at)
ORDER BY hour_bucket DESC;

-- =====================================================================
-- Triggers
-- =====================================================================

-- Update sira_inference_health.updated_at on heartbeat
CREATE OR REPLACE FUNCTION update_inference_health_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_inference_health_timestamp
BEFORE UPDATE ON sira_inference_health
FOR EACH ROW
EXECUTE FUNCTION update_inference_health_timestamp();

-- =====================================================================
-- Sample Data for Testing
-- =====================================================================

-- Insert sample canary config for testing
INSERT INTO sira_canary_config (product, production_model_id, canary_model_id, canary_percent)
VALUES ('fraud_score', gen_random_uuid(), gen_random_uuid(), 0)
ON CONFLICT (product) DO NOTHING;

-- =====================================================================
-- Cleanup Function (Optional - for maintenance)
-- =====================================================================

CREATE OR REPLACE FUNCTION cleanup_old_predictions(p_retention_days INT DEFAULT 90)
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM siramodel_predictions
  WHERE created_at < now() - (p_retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- Grants (adjust based on your RBAC setup)
-- =====================================================================

-- Grant permissions for inference service role
-- GRANT SELECT, INSERT ON siramodel_predictions TO sira_inference_service;
-- GRANT SELECT ON siramodel_registry TO sira_inference_service;
-- GRANT SELECT, UPDATE ON sira_canary_config TO sira_inference_service;
-- GRANT SELECT, INSERT ON sira_inference_metrics TO sira_inference_service;
-- GRANT SELECT, INSERT, UPDATE ON sira_inference_health TO sira_inference_service;

COMMENT ON TABLE sira_inference_metrics IS 'Real-time aggregated metrics for inference monitoring and auto-rollback';
COMMENT ON TABLE sira_inference_health IS 'Service health tracking for inference pods';
COMMENT ON TABLE sira_canary_rollback_log IS 'Immutable audit log of canary rollbacks';
COMMENT ON TABLE sira_feature_cache IS 'Precomputed features cache for ultra-low latency inference';
