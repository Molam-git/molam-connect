/**
 * Sous-Brique 73bis - Observabilité Développeur & SIRA Guard
 * Version: 1.0.0
 * Extension de Brique 73
 */

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ========================================
-- 1) API Key Metrics (aggregated rollups)
-- ========================================

CREATE TABLE IF NOT EXISTS api_key_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID NOT NULL,                    -- References api_keys(id) from B73
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'hour', -- 'minute', 'hour', 'day'

  -- Request metrics
  total_requests BIGINT NOT NULL DEFAULT 0,
  successful_requests BIGINT NOT NULL DEFAULT 0,  -- 2xx
  client_errors BIGINT NOT NULL DEFAULT 0,        -- 4xx
  server_errors BIGINT NOT NULL DEFAULT 0,        -- 5xx

  -- Latency metrics (milliseconds)
  avg_latency_ms NUMERIC(10,2),
  min_latency_ms INTEGER,
  max_latency_ms INTEGER,
  p50_latency_ms INTEGER,
  p95_latency_ms INTEGER,
  p99_latency_ms INTEGER,

  -- Traffic metrics
  total_bytes_in BIGINT DEFAULT 0,
  total_bytes_out BIGINT DEFAULT 0,

  -- IP diversity
  unique_ips INTEGER DEFAULT 0,
  top_ips JSONB,                          -- [{"ip":"1.2.3.4","count":100}]

  -- Status distribution
  status_distribution JSONB,               -- {"200":950,"400":30,"500":20}

  -- Flags
  suspicious BOOLEAN DEFAULT FALSE,
  anomaly_score NUMERIC(5,4),             -- 0.0-1.0 SIRA risk score

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT api_key_metrics_period_check CHECK (period_type IN ('minute', 'hour', 'day'))
);

CREATE UNIQUE INDEX idx_api_key_metrics_key_period ON api_key_metrics(key_id, period_start, period_type);
CREATE INDEX idx_api_key_metrics_suspicious ON api_key_metrics(suspicious, period_start DESC) WHERE suspicious = TRUE;
CREATE INDEX idx_api_key_metrics_period ON api_key_metrics(period_start DESC);

COMMENT ON TABLE api_key_metrics IS 'Aggregated metrics per API key for observability dashboards';
COMMENT ON COLUMN api_key_metrics.anomaly_score IS 'SIRA Guard anomaly detection score (0=normal, 1=highly suspicious)';

-- ========================================
-- 2) Suspicious Events (SIRA Guard detections)
-- ========================================

CREATE TABLE IF NOT EXISTS api_suspicious_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID,
  app_id UUID,
  tenant_type TEXT,
  tenant_id UUID,

  event_type TEXT NOT NULL,               -- 'brute_force', 'quota_abuse', 'ip_rotation', 'bot_pattern', 'spike_anomaly'
  severity TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'

  -- Detection details
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  detection_method TEXT,                   -- 'rate_analysis', 'ml_model', 'pattern_match'
  confidence NUMERIC(5,4),                 -- 0.0-1.0

  -- Evidence
  metadata JSONB NOT NULL,                 -- Full context: IPs, patterns, stats
  evidence_summary TEXT,                   -- Human-readable summary

  -- Action taken
  action_taken TEXT,                       -- 'alert', 'throttle', 'tempban', 'permban', 'none'
  action_details JSONB,                    -- {"throttle_rate":10,"duration_seconds":3600}

  -- Follow-up
  reviewed BOOLEAN DEFAULT FALSE,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  false_positive BOOLEAN DEFAULT FALSE,

  -- Recommendations
  sira_recommendations TEXT[],             -- ['rotate_key', 'split_keys', 'increase_quota']

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT api_suspicious_events_event_type_check CHECK (event_type IN (
    'brute_force', 'quota_abuse', 'ip_rotation', 'bot_pattern',
    'spike_anomaly', 'geographic_anomaly', 'credential_stuffing'
  )),
  CONSTRAINT api_suspicious_events_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT api_suspicious_events_action_check CHECK (action_taken IN ('alert', 'throttle', 'tempban', 'permban', 'none'))
);

CREATE INDEX idx_suspicious_events_key ON api_suspicious_events(key_id, detected_at DESC);
CREATE INDEX idx_suspicious_events_tenant ON api_suspicious_events(tenant_type, tenant_id, detected_at DESC);
CREATE INDEX idx_suspicious_events_severity ON api_suspicious_events(severity, detected_at DESC);
CREATE INDEX idx_suspicious_events_unreviewed ON api_suspicious_events(reviewed, detected_at DESC) WHERE reviewed = FALSE;
CREATE INDEX idx_suspicious_events_type ON api_suspicious_events(event_type);

COMMENT ON TABLE api_suspicious_events IS 'SIRA Guard detected suspicious API usage patterns';
COMMENT ON COLUMN api_suspicious_events.confidence IS 'ML model confidence in detection (0=uncertain, 1=certain)';

-- ========================================
-- 3) Request Traces (OpenTelemetry)
-- ========================================

CREATE TABLE IF NOT EXISTS api_request_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id TEXT NOT NULL,                 -- OpenTelemetry trace ID
  span_id TEXT NOT NULL,                  -- Span ID
  parent_span_id TEXT,                    -- Parent span (for nested calls)

  -- Request context
  key_id UUID,
  app_id UUID,
  method TEXT NOT NULL,
  path TEXT NOT NULL,

  -- Trace details
  service_name TEXT DEFAULT 'api-gateway',
  operation_name TEXT,                    -- 'http.request', 'db.query', 'webhook.send'
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Status
  status_code INTEGER,
  error BOOLEAN DEFAULT FALSE,
  error_message TEXT,

  -- Tags/Attributes
  tags JSONB,                             -- OpenTelemetry tags

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_request_traces_trace ON api_request_traces(trace_id);
CREATE INDEX idx_request_traces_key ON api_request_traces(key_id, start_time DESC);
CREATE INDEX idx_request_traces_time ON api_request_traces(start_time DESC);
CREATE INDEX idx_request_traces_errors ON api_request_traces(error, start_time DESC) WHERE error = TRUE;

COMMENT ON TABLE api_request_traces IS 'OpenTelemetry distributed traces for debugging';

-- ========================================
-- 4) Debug Packs (anonymized bundles for support)
-- ========================================

CREATE TABLE IF NOT EXISTS api_debug_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID NOT NULL,
  app_id UUID NOT NULL,

  -- Pack metadata
  created_by UUID,
  title TEXT NOT NULL,
  description TEXT,

  -- Time range
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,

  -- Contents
  includes_logs BOOLEAN DEFAULT TRUE,
  includes_traces BOOLEAN DEFAULT TRUE,
  includes_metrics BOOLEAN DEFAULT TRUE,

  -- Data (anonymized)
  pack_data JSONB NOT NULL,               -- Anonymized logs/traces/metrics
  pack_size_bytes BIGINT,

  -- Access
  access_token TEXT UNIQUE NOT NULL,      -- Shareable token for support
  expires_at TIMESTAMPTZ NOT NULL,
  accessed_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT debug_packs_dates_check CHECK (start_time < end_time),
  CONSTRAINT debug_packs_expiry_check CHECK (expires_at > created_at)
);

CREATE INDEX idx_debug_packs_key ON api_debug_packs(key_id, created_at DESC);
CREATE INDEX idx_debug_packs_token ON api_debug_packs(access_token);
CREATE INDEX idx_debug_packs_expires ON api_debug_packs(expires_at) WHERE expires_at > NOW();

COMMENT ON TABLE api_debug_packs IS 'Anonymized debug bundles shareable with support';

-- ========================================
-- 5) SIRA Recommendations Log
-- ========================================

CREATE TABLE IF NOT EXISTS api_sira_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID,
  app_id UUID,
  tenant_type TEXT,
  tenant_id UUID,

  recommendation_type TEXT NOT NULL,      -- 'rotate_key', 'split_keys', 'increase_quota', 'add_webhook', 'fix_errors'
  priority TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high'

  -- Recommendation details
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  action_steps TEXT[],                    -- ["Step 1: ...", "Step 2: ..."]

  -- Context
  triggered_by TEXT,                      -- 'metrics_analysis', 'suspicious_event', 'usage_pattern'
  evidence JSONB,

  -- Status
  status TEXT DEFAULT 'pending',          -- 'pending', 'acknowledged', 'applied', 'dismissed'
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  applied_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  CONSTRAINT sira_recommendations_type_check CHECK (recommendation_type IN (
    'rotate_key', 'split_keys', 'increase_quota', 'add_webhook',
    'fix_errors', 'optimize_calls', 'update_scopes'
  )),
  CONSTRAINT sira_recommendations_priority_check CHECK (priority IN ('low', 'medium', 'high')),
  CONSTRAINT sira_recommendations_status_check CHECK (status IN ('pending', 'acknowledged', 'applied', 'dismissed'))
);

CREATE INDEX idx_sira_recommendations_key ON api_sira_recommendations(key_id, status, created_at DESC);
CREATE INDEX idx_sira_recommendations_tenant ON api_sira_recommendations(tenant_type, tenant_id, status);
CREATE INDEX idx_sira_recommendations_pending ON api_sira_recommendations(status, priority DESC) WHERE status = 'pending';

COMMENT ON TABLE api_sira_recommendations IS 'SIRA-generated recommendations for developers';

-- ========================================
-- Triggers
-- ========================================

-- Auto-cleanup old traces (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_traces()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM api_request_traces
  WHERE start_time < NOW() - INTERVAL '7 days';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger runs daily
CREATE OR REPLACE FUNCTION trigger_cleanup_traces()
RETURNS void AS $$
BEGIN
  PERFORM cleanup_old_traces();
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- Helper Functions
-- ========================================

-- Calculate anomaly score based on metrics
CREATE OR REPLACE FUNCTION calculate_anomaly_score(
  p_error_rate NUMERIC,
  p_spike_ratio NUMERIC,
  p_ip_diversity NUMERIC,
  p_latency_anomaly NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  v_score NUMERIC := 0;
BEGIN
  -- Weight factors
  v_score := v_score + (p_error_rate * 0.35);        -- 35% weight on errors
  v_score := v_score + (p_spike_ratio * 0.25);       -- 25% weight on traffic spikes
  v_score := v_score + (p_ip_diversity * 0.20);      -- 20% weight on IP rotation
  v_score := v_score + (p_latency_anomaly * 0.20);   -- 20% weight on latency

  -- Clamp to 0-1
  v_score := GREATEST(0, LEAST(1, v_score));

  RETURN v_score;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Get latest metrics for a key
CREATE OR REPLACE FUNCTION get_latest_metrics(p_key_id UUID)
RETURNS TABLE (
  requests BIGINT,
  errors BIGINT,
  avg_latency NUMERIC,
  p95_latency INTEGER,
  anomaly_score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    akm.total_requests,
    akm.client_errors + akm.server_errors,
    akm.avg_latency_ms,
    akm.p95_latency_ms,
    akm.anomaly_score
  FROM api_key_metrics akm
  WHERE akm.key_id = p_key_id
  ORDER BY akm.period_start DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- Views
-- ========================================

-- Active suspicious events requiring attention
CREATE VIEW v_active_suspicious_events AS
SELECT
  ase.id,
  ase.key_id,
  ase.event_type,
  ase.severity,
  ase.detected_at,
  ase.confidence,
  ase.action_taken,
  ase.evidence_summary,
  ase.sira_recommendations,
  EXTRACT(EPOCH FROM (NOW() - ase.detected_at)) / 3600 AS hours_since_detection
FROM api_suspicious_events ase
WHERE ase.reviewed = FALSE
  AND ase.detected_at >= NOW() - INTERVAL '7 days'
ORDER BY
  CASE ase.severity
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    ELSE 4
  END,
  ase.detected_at DESC;

-- Key health overview
CREATE VIEW v_key_health_overview AS
SELECT
  akm.key_id,
  COUNT(*) as metric_periods,
  AVG(akm.total_requests) as avg_requests_per_period,
  AVG(CASE WHEN akm.total_requests > 0
    THEN (akm.client_errors + akm.server_errors)::NUMERIC / akm.total_requests
    ELSE 0 END) * 100 AS avg_error_rate_percent,
  AVG(akm.p95_latency_ms) as avg_p95_latency,
  MAX(akm.anomaly_score) as max_anomaly_score,
  SUM(CASE WHEN akm.suspicious THEN 1 ELSE 0 END) as suspicious_periods,
  MAX(akm.period_start) as last_activity
FROM api_key_metrics akm
WHERE akm.period_start >= NOW() - INTERVAL '24 hours'
GROUP BY akm.key_id;

COMMENT ON VIEW v_active_suspicious_events IS 'Unreviewed suspicious events for Ops dashboard';
COMMENT ON VIEW v_key_health_overview IS '24-hour health summary per API key';
