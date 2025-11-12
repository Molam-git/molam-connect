-- =====================================================
-- Brique 74quater - Test Harness Distribué Schema
-- =====================================================
-- Version: 1.0.0
-- Purpose: Integrated load testing and chaos engineering platform
-- Dependencies: Requires Brique 74 (001_developer_portal_schema.sql)
-- =====================================================

-- =====================================================
-- 1. TEST DEFINITIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS dev_test_harness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Test metadata
  name TEXT NOT NULL,
  description TEXT,
  test_type TEXT NOT NULL CHECK (test_type IN ('load_test','chaos_test','spike_test','stress_test','soak_test')),

  -- Target configuration
  target_url TEXT NOT NULL,
  method TEXT DEFAULT 'GET' CHECK (method IN ('GET','POST','PUT','DELETE','PATCH')),
  request_headers JSONB DEFAULT '{}'::JSONB,
  request_body JSONB,

  -- Load test parameters
  requests_per_second INTEGER DEFAULT 10 CHECK (requests_per_second > 0 AND requests_per_second <= 10000),
  duration_seconds INTEGER DEFAULT 60 CHECK (duration_seconds > 0 AND duration_seconds <= 3600),
  concurrent_users INTEGER DEFAULT 1 CHECK (concurrent_users > 0 AND concurrent_users <= 1000),
  ramp_up_seconds INTEGER DEFAULT 0,

  -- Chaos engineering parameters
  chaos_config JSONB DEFAULT '{}'::JSONB,
  -- Example: {"drop_traffic":0.1,"latency_jitter_ms":200,"inject_errors":0.05,"partial_outage":true}

  -- Ownership
  tenant_type TEXT NOT NULL,
  tenant_id UUID NOT NULL,
  created_by_user_id UUID NOT NULL,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','scheduled','running','completed','failed','cancelled')),

  -- Scheduling
  scheduled_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_test_harness_tenant ON dev_test_harness(tenant_type, tenant_id);
CREATE INDEX idx_test_harness_status ON dev_test_harness(status, scheduled_at);
CREATE INDEX idx_test_harness_type ON dev_test_harness(test_type);

-- =====================================================
-- 2. TEST RESULTS
-- =====================================================
CREATE TABLE IF NOT EXISTS dev_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Test reference
  test_id UUID NOT NULL REFERENCES dev_test_harness(id) ON DELETE CASCADE,

  -- Execution details
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_seconds NUMERIC(10,2),

  -- Request metrics
  total_requests BIGINT DEFAULT 0,
  success_count BIGINT DEFAULT 0,
  error_count BIGINT DEFAULT 0,
  timeout_count BIGINT DEFAULT 0,

  -- Latency metrics
  avg_latency_ms NUMERIC(10,2),
  min_latency_ms NUMERIC(10,2),
  max_latency_ms NUMERIC(10,2),
  p50_latency_ms NUMERIC(10,2),
  p95_latency_ms NUMERIC(10,2),
  p99_latency_ms NUMERIC(10,2),

  -- Throughput metrics
  requests_per_second NUMERIC(10,2),
  bytes_received BIGINT DEFAULT 0,
  bytes_sent BIGINT DEFAULT 0,

  -- Error breakdown
  status_code_distribution JSONB DEFAULT '{}'::JSONB,
  error_types JSONB DEFAULT '{}'::JSONB,

  -- Chaos events
  chaos_events JSONB DEFAULT '[]'::JSONB,

  -- SIRA analysis
  sira_analysis JSONB,
  sira_recommendations TEXT[],

  -- Status
  status TEXT DEFAULT 'running' CHECK (status IN ('running','completed','failed','cancelled')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_test_results_test ON dev_test_results(test_id, start_time DESC);
CREATE INDEX idx_test_results_status ON dev_test_results(status);

-- =====================================================
-- 3. TEST METRICS (Time-series data)
-- =====================================================
CREATE TABLE IF NOT EXISTS dev_test_metrics (
  id BIGSERIAL PRIMARY KEY,

  -- Result reference
  result_id UUID NOT NULL REFERENCES dev_test_results(id) ON DELETE CASCADE,

  -- Timestamp
  timestamp TIMESTAMPTZ NOT NULL,

  -- Instant metrics
  active_users INTEGER,
  requests_per_second NUMERIC(10,2),
  avg_response_time_ms NUMERIC(10,2),
  error_rate NUMERIC(5,2),

  -- Resource metrics (if available)
  cpu_usage NUMERIC(5,2),
  memory_usage NUMERIC(5,2),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
) PARTITION BY RANGE (timestamp);

-- Create partitions
CREATE TABLE dev_test_metrics_2025_11 PARTITION OF dev_test_metrics
  FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE dev_test_metrics_2025_12 PARTITION OF dev_test_metrics
  FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

CREATE INDEX idx_test_metrics_result ON dev_test_metrics(result_id, timestamp);

-- =====================================================
-- VIEWS
-- =====================================================
CREATE OR REPLACE VIEW v_test_performance_summary AS
SELECT
  t.id AS test_id,
  t.name,
  t.test_type,
  COUNT(r.id) AS total_runs,
  AVG(r.requests_per_second) AS avg_throughput,
  AVG(r.p95_latency_ms) AS avg_p95_latency,
  AVG(r.error_count::NUMERIC / NULLIF(r.total_requests,0) * 100) AS avg_error_rate
FROM dev_test_harness t
LEFT JOIN dev_test_results r ON r.test_id = t.id
WHERE r.status = 'completed'
GROUP BY t.id;

-- =====================================================
-- TRIGGERS
-- =====================================================
CREATE TRIGGER trg_test_harness_updated_at
  BEFORE UPDATE ON dev_test_harness
  FOR EACH ROW EXECUTE FUNCTION update_mock_updated_at();

-- =====================================================
-- COMPLETION
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Brique 74quater - Test Harness Schema installed';
  RAISE NOTICE '📊 Tables: 3 (tests, results, metrics)';
  RAISE NOTICE '📈 Views: 1';
  RAISE NOTICE '⚡ Triggers: 1';
END $$;
