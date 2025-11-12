/**
 * SIRA Enrichment Schema
 * Advanced AI-guided observability, fraud detection, and immutable audit
 * Brique 73 v2.1
 */

-- ========================================
-- Webhook Behavioral Profiles
-- ========================================

CREATE TABLE IF NOT EXISTS webhook_profiles (
  webhook_id UUID PRIMARY KEY REFERENCES webhooks(id) ON DELETE CASCADE,

  -- Performance metrics
  avg_latency_ms NUMERIC(10,2) DEFAULT 0,
  p50_latency_ms NUMERIC(10,2) DEFAULT 0,
  p95_latency_ms NUMERIC(10,2) DEFAULT 0,
  p99_latency_ms NUMERIC(10,2) DEFAULT 0,

  -- Success/failure tracking
  success_rate NUMERIC(5,2) DEFAULT 100.0,
  failure_rate NUMERIC(5,2) DEFAULT 0,
  consecutive_failures INT DEFAULT 0,
  consecutive_successes INT DEFAULT 0,

  -- Adaptive strategy
  preferred_strategy TEXT DEFAULT 'exponential_backoff',
  -- Options: exponential_backoff, linear_backoff, adaptive, aggressive, conservative

  optimal_batch_size INT DEFAULT 1,
  optimal_retry_delay_ms INT DEFAULT 1000,

  -- Endpoint characteristics
  supports_compression BOOLEAN DEFAULT false,
  supports_json_light BOOLEAN DEFAULT false,
  max_payload_size_bytes INT DEFAULT 1048576, -- 1MB

  -- Availability tracking
  uptime_percentage NUMERIC(5,2) DEFAULT 100.0,
  last_successful_delivery TIMESTAMPTZ,
  last_failed_delivery TIMESTAMPTZ,

  -- AI analysis
  ai_health_score NUMERIC(3,2) DEFAULT 1.0, -- 0.0 to 1.0
  ai_recommendations TEXT[],

  -- Metadata
  total_deliveries BIGINT DEFAULT 0,
  last_analysis TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_profiles_health ON webhook_profiles(ai_health_score);
CREATE INDEX idx_webhook_profiles_failure_rate ON webhook_profiles(failure_rate);

-- ========================================
-- API Abuse & Fraud Detection
-- ========================================

CREATE TABLE IF NOT EXISTS api_abuse_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,

  -- Pattern identification
  pattern_type TEXT NOT NULL,
  -- Types: ip_rotation, brute_force, replay_attack, credential_stuffing,
  --        rate_limit_abuse, data_scraping, bot_pattern, geo_impossible

  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  confidence_score NUMERIC(3,2) NOT NULL, -- 0.0 to 1.0

  -- Evidence
  details JSONB NOT NULL,
  evidence_summary TEXT,

  -- Geographic analysis
  unique_countries INT DEFAULT 0,
  unique_ips INT DEFAULT 0,
  geographic_spread_km NUMERIC(10,2), -- Max distance between IPs

  -- Timing analysis
  requests_per_minute NUMERIC(10,2),
  requests_per_hour NUMERIC(10,2),
  timing_uniformity_score NUMERIC(3,2), -- How consistent the timing is (bot indicator)

  -- Action taken
  action_taken TEXT,
  -- Actions: none, alert, throttle, temp_ban, perm_ban, require_2fa

  auto_action_enabled BOOLEAN DEFAULT true,
  manual_review_required BOOLEAN DEFAULT false,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'false_positive', 'under_review')),

  -- Timestamps
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  first_occurrence TIMESTAMPTZ DEFAULT NOW(),
  last_occurrence TIMESTAMPTZ DEFAULT NOW(),
  occurrence_count INT DEFAULT 1
);

CREATE INDEX idx_abuse_patterns_key_id ON api_abuse_patterns(key_id);
CREATE INDEX idx_abuse_patterns_severity ON api_abuse_patterns(severity);
CREATE INDEX idx_abuse_patterns_pattern_type ON api_abuse_patterns(pattern_type);
CREATE INDEX idx_abuse_patterns_status ON api_abuse_patterns(status);
CREATE INDEX idx_abuse_patterns_detected_at ON api_abuse_patterns(detected_at DESC);

-- ========================================
-- Immutable Audit Log (WORM - Write Once Read Many)
-- ========================================

CREATE TABLE IF NOT EXISTS api_audit_log (
  id BIGSERIAL PRIMARY KEY,

  -- Entity references
  key_id UUID REFERENCES api_keys(id),
  webhook_id UUID REFERENCES webhooks(id),
  app_id UUID REFERENCES dev_apps(id),

  -- Event details
  event_type TEXT NOT NULL,
  -- Types: api_call, webhook_delivery, key_created, key_revoked,
  --        abuse_detected, config_changed, data_access

  event_category TEXT NOT NULL,
  -- Categories: security, access, config, delivery, abuse, compliance

  actor_id UUID, -- User who performed the action
  actor_type TEXT, -- system, user, api, webhook

  -- Request details
  http_method TEXT,
  endpoint TEXT,
  ip_address INET,
  user_agent TEXT,
  request_headers JSONB,

  -- Payload (encrypted for sensitive data)
  payload JSONB,
  payload_encrypted BOOLEAN DEFAULT false,

  -- Response
  response_code INT,
  response_time_ms NUMERIC(10,2),

  -- Immutability chain (blockchain-style)
  hash TEXT NOT NULL UNIQUE, -- SHA256 of current record
  prev_hash TEXT, -- SHA256 of previous record (creates chain)
  chain_index BIGINT NOT NULL,

  -- Compliance metadata
  compliance_flags TEXT[], -- PCI_DSS, GDPR, BCEAO, SEC
  data_classification TEXT, -- public, internal, confidential, restricted
  retention_period_days INT DEFAULT 2555, -- 7 years default

  -- Geographic tracking
  geo_country TEXT,
  geo_region TEXT,
  geo_city TEXT,

  -- Timestamps (immutable)
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Prevent updates and deletes
  CONSTRAINT no_updates CHECK (created_at <= NOW())
);

-- Prevent any updates or deletes
CREATE OR REPLACE RULE no_update_audit_log AS
  ON UPDATE TO api_audit_log
  DO INSTEAD NOTHING;

CREATE OR REPLACE RULE no_delete_audit_log AS
  ON DELETE TO api_audit_log
  DO INSTEAD NOTHING;

CREATE INDEX idx_audit_log_key_id ON api_audit_log(key_id);
CREATE INDEX idx_audit_log_webhook_id ON api_audit_log(webhook_id);
CREATE INDEX idx_audit_log_event_type ON api_audit_log(event_type);
CREATE INDEX idx_audit_log_event_category ON api_audit_log(event_category);
CREATE INDEX idx_audit_log_created_at ON api_audit_log(created_at DESC);
CREATE INDEX idx_audit_log_hash ON api_audit_log(hash);
CREATE INDEX idx_audit_log_chain_index ON api_audit_log(chain_index);
CREATE INDEX idx_audit_log_ip_address ON api_audit_log(ip_address);

-- ========================================
-- API Version Contracts
-- ========================================

CREATE TABLE IF NOT EXISTS api_version_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES dev_apps(id) ON DELETE CASCADE,

  -- Version tracking
  api_version TEXT NOT NULL, -- v1, v2, v3
  webhook_version TEXT NOT NULL, -- v1, v2

  -- Contract details
  scopes_used TEXT[],
  endpoints_used TEXT[],
  events_subscribed TEXT[],

  -- Usage statistics
  total_calls BIGINT DEFAULT 0,
  last_call_at TIMESTAMPTZ,

  -- Version health
  is_deprecated BOOLEAN DEFAULT false,
  deprecation_date TIMESTAMPTZ,
  sunset_date TIMESTAMPTZ,
  migration_deadline TIMESTAMPTZ,

  -- Migration tracking
  migration_status TEXT DEFAULT 'current',
  -- Status: current, needs_upgrade, migrating, deprecated, sunset

  recommended_version TEXT,
  migration_guide_url TEXT,

  -- Alerts
  alert_sent BOOLEAN DEFAULT false,
  alert_sent_at TIMESTAMPTZ,
  alert_acknowledged BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_version_contracts_app_id ON api_version_contracts(app_id);
CREATE INDEX idx_version_contracts_api_version ON api_version_contracts(api_version);
CREATE INDEX idx_version_contracts_migration_status ON api_version_contracts(migration_status);
CREATE INDEX idx_version_contracts_is_deprecated ON api_version_contracts(is_deprecated);

-- ========================================
-- SIRA AI Recommendations
-- ========================================

CREATE TABLE IF NOT EXISTS sira_ai_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target entity
  entity_type TEXT NOT NULL, -- webhook, api_key, app
  entity_id UUID NOT NULL,

  -- Recommendation details
  recommendation_type TEXT NOT NULL,
  -- Types: reduce_payload, enable_compression, change_retry_strategy,
  --        upgrade_version, increase_timeout, batch_requests, use_json_light

  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),

  title TEXT NOT NULL,
  description TEXT NOT NULL,

  -- Expected impact
  expected_improvement_pct NUMERIC(5,2),
  expected_latency_reduction_ms NUMERIC(10,2),
  expected_success_rate_increase_pct NUMERIC(5,2),

  -- Implementation
  action_steps TEXT[],
  auto_apply_enabled BOOLEAN DEFAULT false,
  auto_applied BOOLEAN DEFAULT false,
  auto_applied_at TIMESTAMPTZ,

  -- Validation
  ai_confidence NUMERIC(3,2), -- 0.0 to 1.0
  triggered_by TEXT, -- abuse_detection, performance_analysis, health_check
  evidence JSONB,

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'dismissed', 'failed')),
  applied_by UUID REFERENCES users(id),
  applied_at TIMESTAMPTZ,
  dismissed_reason TEXT,

  -- Results tracking
  result_measured BOOLEAN DEFAULT false,
  actual_improvement_pct NUMERIC(5,2),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
);

CREATE INDEX idx_sira_recommendations_entity ON sira_ai_recommendations(entity_type, entity_id);
CREATE INDEX idx_sira_recommendations_priority ON sira_ai_recommendations(priority);
CREATE INDEX idx_sira_recommendations_status ON sira_ai_recommendations(status);
CREATE INDEX idx_sira_recommendations_created_at ON sira_ai_recommendations(created_at DESC);

-- ========================================
-- Webhook Replay Queue
-- ========================================

CREATE TABLE IF NOT EXISTS webhook_replay_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_delivery_id UUID NOT NULL REFERENCES webhook_deliveries(id),
  webhook_id UUID NOT NULL REFERENCES webhooks(id),

  -- AI-guided replay configuration
  replay_strategy TEXT NOT NULL,
  -- Strategies: standard, reduced_payload, compressed, json_light,
  --             increased_timeout, linear_backoff

  ai_suggestions JSONB,

  -- Modified payload
  original_payload JSONB NOT NULL,
  modified_payload JSONB,
  payload_reduced_by_pct NUMERIC(5,2),

  -- Retry configuration override
  custom_timeout_ms INT,
  custom_retry_delay_ms INT,
  custom_max_attempts INT,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  new_delivery_id UUID REFERENCES webhook_deliveries(id),

  -- Results
  succeeded BOOLEAN,
  improvement_vs_original TEXT,

  -- Metadata
  requested_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_replay_queue_webhook_id ON webhook_replay_queue(webhook_id);
CREATE INDEX idx_replay_queue_status ON webhook_replay_queue(status);
CREATE INDEX idx_replay_queue_created_at ON webhook_replay_queue(created_at DESC);

-- ========================================
-- Functions & Triggers
-- ========================================

-- Update webhook profile on delivery
CREATE OR REPLACE FUNCTION update_webhook_profile() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO webhook_profiles (webhook_id, total_deliveries)
  VALUES (NEW.webhook_id, 1)
  ON CONFLICT (webhook_id) DO UPDATE SET
    total_deliveries = webhook_profiles.total_deliveries + 1,
    last_analysis = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_webhook_profile
  AFTER INSERT ON webhook_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_webhook_profile();

-- Compute hash chain for immutable audit log
CREATE OR REPLACE FUNCTION compute_audit_hash() RETURNS TRIGGER AS $$
DECLARE
  prev_rec RECORD;
  hash_input TEXT;
BEGIN
  -- Get previous record
  SELECT hash, chain_index INTO prev_rec
  FROM api_audit_log
  ORDER BY chain_index DESC
  LIMIT 1;

  -- Set chain index
  IF prev_rec.chain_index IS NULL THEN
    NEW.chain_index := 1;
    NEW.prev_hash := 'genesis';
  ELSE
    NEW.chain_index := prev_rec.chain_index + 1;
    NEW.prev_hash := prev_rec.hash;
  END IF;

  -- Compute hash of current record
  hash_input := NEW.chain_index::TEXT ||
                COALESCE(NEW.key_id::TEXT, '') ||
                NEW.event_type ||
                NEW.created_at::TEXT ||
                COALESCE(NEW.prev_hash, '');

  NEW.hash := encode(digest(hash_input, 'sha256'), 'hex');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_compute_audit_hash
  BEFORE INSERT ON api_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION compute_audit_hash();

-- ========================================
-- Views
-- ========================================

-- High-risk webhooks view
CREATE OR REPLACE VIEW v_high_risk_webhooks AS
SELECT
  w.id,
  w.url,
  w.app_id,
  wp.failure_rate,
  wp.ai_health_score,
  wp.consecutive_failures,
  wp.ai_recommendations,
  wp.last_failed_delivery
FROM webhooks w
JOIN webhook_profiles wp ON w.id = wp.webhook_id
WHERE wp.failure_rate > 30 OR wp.ai_health_score < 0.5 OR wp.consecutive_failures > 5
ORDER BY wp.failure_rate DESC, wp.ai_health_score ASC;

-- Active abuse patterns view
CREATE OR REPLACE VIEW v_active_abuse_patterns AS
SELECT
  aap.*,
  ak.kid,
  ak.app_id,
  da.name as app_name
FROM api_abuse_patterns aap
JOIN api_keys ak ON aap.key_id = ak.id
JOIN dev_apps da ON ak.app_id = da.id
WHERE aap.status = 'active'
  AND aap.severity IN ('high', 'critical')
ORDER BY aap.detected_at DESC;

-- Deprecated API versions view
CREATE OR REPLACE VIEW v_deprecated_api_usage AS
SELECT
  avc.*,
  da.name as app_name,
  da.tenant_type,
  EXTRACT(DAY FROM (avc.migration_deadline - NOW())) as days_until_deadline
FROM api_version_contracts avc
JOIN dev_apps da ON avc.app_id = da.id
WHERE avc.is_deprecated = true
  AND avc.migration_status != 'current'
ORDER BY avc.migration_deadline ASC;

COMMENT ON TABLE webhook_profiles IS 'AI-driven behavioral profiles for adaptive webhook delivery';
COMMENT ON TABLE api_abuse_patterns IS 'Detected abuse and fraud patterns with automatic protection';
COMMENT ON TABLE api_audit_log IS 'Immutable audit trail with hash chain for compliance (WORM)';
COMMENT ON TABLE api_version_contracts IS 'API version tracking and migration management';
COMMENT ON TABLE sira_ai_recommendations IS 'AI-generated recommendations for optimization';
COMMENT ON TABLE webhook_replay_queue IS 'Intelligent webhook replay with AI-guided strategies';
