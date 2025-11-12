/**
 * Brique 73 v2.1 - Unified Complete Schema
 * Fusion: Spec Détaillée + SIRA AI Enrichment
 *
 * 23 tables totales:
 * - 9 Core Webhooks
 * - 5 API Keys & Apps
 * - 7 SIRA AI
 * - 2 Support
 */

-- ========================================
-- CORE WEBHOOKS (9 tables)
-- ========================================

-- 1. Webhook Endpoints (fusionné spec + SIRA)
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenancy
  tenant_type TEXT NOT NULL, -- merchant | agent | internal_app
  tenant_id UUID NOT NULL,

  -- Endpoint configuration
  url TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active | paused | disabled
  api_version TEXT NOT NULL DEFAULT '2025-01',
  region TEXT, -- Multi-region support

  -- Retry configuration (SIRA adaptive)
  retry_config JSONB DEFAULT '{
    "maxAttempts": 6,
    "backoff": "exponential",
    "initialDelayMs": 60000,
    "maxDelayMs": 86400000
  }'::jsonb,

  -- Custom headers
  custom_headers JSONB,

  -- Circuit breaker
  circuit_breaker_threshold INTEGER DEFAULT 5,
  circuit_breaker_window_sec INTEGER DEFAULT 300,

  -- Audit tracking
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(tenant_type, tenant_id, url)
);

CREATE INDEX idx_webhook_endpoints_tenant ON webhook_endpoints(tenant_type, tenant_id);
CREATE INDEX idx_webhook_endpoints_status ON webhook_endpoints(status) WHERE status = 'active';
CREATE INDEX idx_webhook_endpoints_region ON webhook_endpoints(region) WHERE region IS NOT NULL;

-- 2. Webhook Subscriptions (event routing)
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- e.g., payment.succeeded, refund.created

  -- Filtering (optional)
  filter_conditions JSONB, -- Advanced event filtering

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(endpoint_id, event_type)
);

CREATE INDEX idx_webhook_subscriptions_event_type ON webhook_subscriptions(event_type);

-- 3. Webhook Secrets (versioned with rotation)
CREATE TABLE IF NOT EXISTS webhook_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,

  -- Versioning
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active | retiring | revoked

  -- Secret storage (encrypted)
  secret_ciphertext BYTEA NOT NULL,

  -- Rotation & expiration
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ, -- Grace period for rotation
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,

  UNIQUE(endpoint_id, version)
);

CREATE INDEX idx_webhook_secrets_status ON webhook_secrets(endpoint_id, status)
  WHERE status IN ('active', 'retiring');

-- 4. Webhook Events (immutable event log)
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event identity
  tenant_type TEXT NOT NULL,
  tenant_id UUID NOT NULL,
  type TEXT NOT NULL, -- payment.succeeded, etc.

  -- Event data (immutable)
  data JSONB NOT NULL,

  -- Metadata
  source TEXT, -- origin service
  trace_id TEXT, -- distributed tracing
  region TEXT,

  -- Timestamps (immutable)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_events_tenant ON webhook_events(tenant_type, tenant_id);
CREATE INDEX idx_webhook_events_type_created ON webhook_events(type, created_at DESC);
CREATE INDEX idx_webhook_events_created ON webhook_events(created_at DESC);

-- Partition by month for scalability
-- ALTER TABLE webhook_events PARTITION BY RANGE (created_at);

-- 5. Webhook Deliveries (delivery tracking)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  event_id UUID NOT NULL REFERENCES webhook_events(id) ON DELETE CASCADE,
  endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending | delivering | delivered | failed | retrying | quarantined

  -- Retry logic
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 6,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Response tracking
  last_code INTEGER,
  last_error TEXT,
  error_type TEXT, -- timeout | connection_refused | invalid_response | rate_limit

  -- Performance metrics
  latency_ms INTEGER,
  response_body TEXT, -- Truncated to 1KB

  -- Signature used
  signature TEXT,
  secret_version INTEGER,

  -- Idempotency
  idempotency_key TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,

  UNIQUE(event_id, endpoint_id)
);

CREATE INDEX idx_webhook_deliveries_status_next ON webhook_deliveries(status, next_attempt_at)
  WHERE status IN ('pending', 'failed', 'retrying');
CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries(endpoint_id, created_at DESC);
CREATE INDEX idx_webhook_deliveries_event ON webhook_deliveries(event_id);
CREATE INDEX idx_webhook_deliveries_idempotency ON webhook_deliveries(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 6. Webhook Delivery Attempts (immutable audit)
CREATE TABLE IF NOT EXISTS webhook_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES webhook_deliveries(id) ON DELETE CASCADE,

  -- Attempt details
  attempt_number INTEGER NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Request details
  request_url TEXT NOT NULL,
  request_headers JSONB,
  request_payload JSONB,

  -- Response details
  http_code INTEGER,
  response_body TEXT, -- Truncated
  latency_ms INTEGER,

  -- Result
  success BOOLEAN NOT NULL,
  error_type TEXT,
  error_message TEXT
);

CREATE INDEX idx_webhook_delivery_attempts_delivery ON webhook_delivery_attempts(delivery_id, attempt_number);
CREATE INDEX idx_webhook_delivery_attempts_attempted ON webhook_delivery_attempts(attempted_at DESC);

-- 7. Webhook Deadletters (DLQ)
CREATE TABLE IF NOT EXISTS webhook_deadletters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  delivery_id UUID NOT NULL REFERENCES webhook_deliveries(id) ON DELETE CASCADE,

  -- Snapshot
  event_snapshot JSONB NOT NULL,
  endpoint_snapshot JSONB NOT NULL,

  -- Failure details
  reason TEXT NOT NULL, -- max_retries | circuit_breaker | permanent_failure
  total_attempts INTEGER NOT NULL,
  error_summary TEXT,

  -- SIRA AI analysis
  sira_analysis JSONB, -- AI-generated insights
  sira_recommendations TEXT[],

  -- Resolution tracking
  resolution_status TEXT DEFAULT 'pending', -- pending | replaying | resolved | dismissed
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_deadletters_resolution ON webhook_deadletters(resolution_status)
  WHERE resolution_status = 'pending';
CREATE INDEX idx_webhook_deadletters_created ON webhook_deadletters(created_at DESC);

-- 8. Webhook Delivery Metrics (pre-aggregated)
CREATE TABLE IF NOT EXISTS webhook_delivery_metrics (
  webhook_id UUID NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_type TEXT NOT NULL, -- hour | day | week | month

  -- Volume metrics
  total_deliveries BIGINT DEFAULT 0,
  successful_deliveries BIGINT DEFAULT 0,
  failed_deliveries BIGINT DEFAULT 0,

  -- Latency metrics
  avg_latency_ms NUMERIC(10,2),
  p50_latency_ms NUMERIC(10,2),
  p95_latency_ms NUMERIC(10,2),
  p99_latency_ms NUMERIC(10,2),
  max_latency_ms NUMERIC(10,2),

  -- Error distribution
  status_distribution JSONB, -- {"200": 950, "500": 30, "timeout": 20}
  error_types JSONB, -- {"timeout": 15, "connection_refused": 5}

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (webhook_id, period_start, period_type)
);

CREATE INDEX idx_webhook_delivery_metrics_period ON webhook_delivery_metrics(period_start DESC);

-- 9. Webhook Events Catalog (available event types)
CREATE TABLE IF NOT EXISTS webhook_events_catalog (
  event_type TEXT PRIMARY KEY,
  category TEXT NOT NULL, -- payments | refunds | disputes | payouts | kyc
  description TEXT NOT NULL,
  example_payload JSONB,
  schema_version TEXT NOT NULL DEFAULT '1.0',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_events_catalog_category ON webhook_events_catalog(category, enabled);

-- ========================================
-- SIRA AI TABLES (7 tables)
-- ========================================

-- 10. Webhook Profiles (adaptive learning)
CREATE TABLE IF NOT EXISTS webhook_profiles (
  endpoint_id UUID PRIMARY KEY REFERENCES webhook_endpoints(id) ON DELETE CASCADE,

  -- Performance metrics
  avg_latency_ms NUMERIC(10,2) DEFAULT 0,
  p50_latency_ms NUMERIC(10,2) DEFAULT 0,
  p95_latency_ms NUMERIC(10,2) DEFAULT 0,
  p99_latency_ms NUMERIC(10,2) DEFAULT 0,

  -- Success/failure tracking
  success_rate NUMERIC(5,2) DEFAULT 100.0,
  failure_rate NUMERIC(5,2) DEFAULT 0,
  total_deliveries BIGINT DEFAULT 0,
  consecutive_failures INT DEFAULT 0,
  consecutive_successes INT DEFAULT 0,

  -- Adaptive strategy (SIRA AI)
  preferred_strategy TEXT DEFAULT 'exponential_backoff',
  -- exponential_backoff | linear_backoff | conservative | aggressive | adaptive

  optimal_batch_size INT DEFAULT 1,
  optimal_retry_delay_ms INT DEFAULT 60000,

  -- Endpoint characteristics
  supports_compression BOOLEAN DEFAULT false,
  supports_json_light BOOLEAN DEFAULT false,
  max_payload_size_bytes INT DEFAULT 1048576,

  -- Availability
  uptime_percentage NUMERIC(5,2) DEFAULT 100.0,
  last_successful_delivery TIMESTAMPTZ,
  last_failed_delivery TIMESTAMPTZ,

  -- AI health score
  ai_health_score NUMERIC(3,2) DEFAULT 1.0, -- 0.0 to 1.0
  ai_recommendations TEXT[],

  -- Analysis
  last_analysis TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_webhook_profiles_health ON webhook_profiles(ai_health_score);
CREATE INDEX idx_webhook_profiles_failure_rate ON webhook_profiles(failure_rate)
  WHERE failure_rate > 10;

-- 11. API Abuse Patterns (fraud detection)
CREATE TABLE IF NOT EXISTS api_abuse_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID, -- Can be NULL for webhook-based patterns
  endpoint_id UUID REFERENCES webhook_endpoints(id),

  -- Pattern identification
  pattern_type TEXT NOT NULL,
  -- ip_rotation | geo_impossible | credential_stuffing | bot_pattern |
  -- rate_limit_abuse | data_scraping | webhook_spam

  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  confidence_score NUMERIC(3,2) NOT NULL,

  -- Evidence
  details JSONB NOT NULL,
  evidence_summary TEXT,

  -- Geographic analysis
  unique_countries INT DEFAULT 0,
  unique_ips INT DEFAULT 0,
  geographic_spread_km NUMERIC(10,2),

  -- Timing analysis
  requests_per_minute NUMERIC(10,2),
  timing_uniformity_score NUMERIC(3,2),

  -- Action taken
  action_taken TEXT,
  -- none | alert | throttle | temp_ban | perm_ban | circuit_breaker

  auto_action_enabled BOOLEAN DEFAULT true,
  manual_review_required BOOLEAN DEFAULT false,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'false_positive', 'under_review')),

  -- Timestamps
  detected_at TIMESTAMPTZ DEFAULT now(),
  first_occurrence TIMESTAMPTZ DEFAULT now(),
  last_occurrence TIMESTAMPTZ DEFAULT now(),
  occurrence_count INT DEFAULT 1
);

CREATE INDEX idx_abuse_patterns_endpoint ON api_abuse_patterns(endpoint_id) WHERE endpoint_id IS NOT NULL;
CREATE INDEX idx_abuse_patterns_severity ON api_abuse_patterns(severity, status);
CREATE INDEX idx_abuse_patterns_detected ON api_abuse_patterns(detected_at DESC);

-- 12. API Audit Log (immutable blockchain-style)
CREATE TABLE IF NOT EXISTS api_audit_log (
  id BIGSERIAL PRIMARY KEY,

  -- Entity references
  key_id UUID,
  webhook_id UUID,
  app_id UUID,
  endpoint_id UUID,

  -- Event details
  event_type TEXT NOT NULL,
  event_category TEXT NOT NULL,
  -- security | access | config | delivery | abuse | compliance

  actor_id UUID,
  actor_type TEXT, -- system | user | api | webhook

  -- Request details
  http_method TEXT,
  endpoint TEXT,
  ip_address INET,
  user_agent TEXT,
  request_headers JSONB,

  -- Payload
  payload JSONB,
  payload_encrypted BOOLEAN DEFAULT false,

  -- Response
  response_code INT,
  response_time_ms NUMERIC(10,2),

  -- Immutability chain (blockchain-style)
  hash TEXT NOT NULL UNIQUE,
  prev_hash TEXT,
  chain_index BIGINT NOT NULL,

  -- Compliance
  compliance_flags TEXT[], -- PCI_DSS | GDPR | BCEAO | SEC
  data_classification TEXT, -- public | internal | confidential | restricted
  retention_period_days INT DEFAULT 2555, -- 7 years

  -- Geographic tracking
  geo_country TEXT,
  geo_region TEXT,
  geo_city TEXT,

  -- Timestamps (immutable)
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  CONSTRAINT no_updates CHECK (created_at <= now())
);

-- Prevent updates and deletes
CREATE OR REPLACE RULE no_update_audit_log AS
  ON UPDATE TO api_audit_log DO INSTEAD NOTHING;

CREATE OR REPLACE RULE no_delete_audit_log AS
  ON DELETE TO api_audit_log DO INSTEAD NOTHING;

CREATE INDEX idx_audit_log_endpoint ON api_audit_log(endpoint_id) WHERE endpoint_id IS NOT NULL;
CREATE INDEX idx_audit_log_event_type ON api_audit_log(event_type);
CREATE INDEX idx_audit_log_created ON api_audit_log(created_at DESC);
CREATE INDEX idx_audit_log_chain ON api_audit_log(chain_index);
CREATE INDEX idx_audit_log_hash ON api_audit_log(hash);

-- 13. Webhook Replay Queue (AI-guided)
CREATE TABLE IF NOT EXISTS webhook_replay_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  original_delivery_id UUID NOT NULL REFERENCES webhook_deliveries(id),
  endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id),

  -- AI-guided replay configuration
  replay_strategy TEXT NOT NULL,
  -- standard | reduced_payload | compressed | json_light |
  -- increased_timeout | conservative_backoff

  ai_suggestions JSONB,
  ai_confidence NUMERIC(3,2),

  -- Modified payload
  original_payload JSONB NOT NULL,
  modified_payload JSONB,
  payload_reduced_by_pct NUMERIC(5,2),

  -- Custom configuration
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
  requested_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_replay_queue_endpoint ON webhook_replay_queue(endpoint_id);
CREATE INDEX idx_replay_queue_status ON webhook_replay_queue(status) WHERE status = 'pending';

-- 14. SIRA AI Recommendations
CREATE TABLE IF NOT EXISTS sira_ai_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target entity
  entity_type TEXT NOT NULL, -- webhook | endpoint | api_key | app
  entity_id UUID NOT NULL,

  -- Recommendation details
  recommendation_type TEXT NOT NULL,
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
  ai_confidence NUMERIC(3,2),
  triggered_by TEXT,
  evidence JSONB,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'dismissed', 'failed')),
  applied_by UUID,
  applied_at TIMESTAMPTZ,
  dismissed_reason TEXT,

  -- Results
  result_measured BOOLEAN DEFAULT false,
  actual_improvement_pct NUMERIC(5,2),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '30 days'
);

CREATE INDEX idx_sira_recommendations_entity ON sira_ai_recommendations(entity_type, entity_id);
CREATE INDEX idx_sira_recommendations_status ON sira_ai_recommendations(status, priority);

-- 15. API Suspicious Events (anomaly detection)
CREATE TABLE IF NOT EXISTS api_suspicious_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID,
  endpoint_id UUID REFERENCES webhook_endpoints(id),

  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  confidence NUMERIC(3,2),

  metadata JSONB,
  evidence_summary TEXT,

  action_taken TEXT,
  sira_recommendations TEXT[],

  reviewed BOOLEAN DEFAULT false,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,

  detected_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_suspicious_events_endpoint ON api_suspicious_events(endpoint_id)
  WHERE endpoint_id IS NOT NULL;
CREATE INDEX idx_suspicious_events_severity ON api_suspicious_events(severity, reviewed);

-- 16. API Version Contracts
CREATE TABLE IF NOT EXISTS api_version_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL,
  endpoint_id UUID REFERENCES webhook_endpoints(id),

  -- Version tracking
  api_version TEXT NOT NULL,
  webhook_version TEXT NOT NULL,

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
  -- current | needs_upgrade | migrating | deprecated | sunset

  recommended_version TEXT,
  migration_guide_url TEXT,

  -- Alerts
  alert_sent BOOLEAN DEFAULT false,
  alert_sent_at TIMESTAMPTZ,
  alert_acknowledged BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_version_contracts_endpoint ON api_version_contracts(endpoint_id)
  WHERE endpoint_id IS NOT NULL;
CREATE INDEX idx_version_contracts_migration ON api_version_contracts(migration_status, is_deprecated);

-- ========================================
-- TRIGGERS & FUNCTIONS
-- ========================================

-- Update webhook profile on delivery completion
CREATE OR REPLACE FUNCTION update_webhook_profile_on_delivery() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('delivered', 'failed') AND OLD.status NOT IN ('delivered', 'failed') THEN
    INSERT INTO webhook_profiles (endpoint_id, total_deliveries, last_analysis)
    VALUES (NEW.endpoint_id, 1, now())
    ON CONFLICT (endpoint_id) DO UPDATE SET
      total_deliveries = webhook_profiles.total_deliveries + 1,
      consecutive_failures = CASE
        WHEN NEW.status = 'failed' THEN webhook_profiles.consecutive_failures + 1
        ELSE 0
      END,
      consecutive_successes = CASE
        WHEN NEW.status = 'delivered' THEN webhook_profiles.consecutive_successes + 1
        ELSE 0
      END,
      last_successful_delivery = CASE
        WHEN NEW.status = 'delivered' THEN now()
        ELSE webhook_profiles.last_successful_delivery
      END,
      last_failed_delivery = CASE
        WHEN NEW.status = 'failed' THEN now()
        ELSE webhook_profiles.last_failed_delivery
      END,
      last_analysis = now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_webhook_profile
  AFTER UPDATE ON webhook_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_webhook_profile_on_delivery();

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
                COALESCE(NEW.endpoint_id::TEXT, '') ||
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

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_webhook_endpoints_updated_at
  BEFORE UPDATE ON webhook_endpoints
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_update_webhook_deliveries_updated_at
  BEFORE UPDATE ON webhook_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ========================================
-- VIEWS
-- ========================================

-- High-risk webhooks view
CREATE OR REPLACE VIEW v_high_risk_webhooks AS
SELECT
  e.id,
  e.url,
  e.tenant_type,
  e.tenant_id,
  e.status,
  p.failure_rate,
  p.ai_health_score,
  p.consecutive_failures,
  p.ai_recommendations,
  p.last_failed_delivery
FROM webhook_endpoints e
LEFT JOIN webhook_profiles p ON e.id = p.endpoint_id
WHERE p.failure_rate > 30
   OR p.ai_health_score < 0.5
   OR p.consecutive_failures > 5
ORDER BY p.failure_rate DESC NULLS LAST, p.ai_health_score ASC NULLS LAST;

-- Active DLQ items
CREATE OR REPLACE VIEW v_active_deadletters AS
SELECT
  d.*,
  e.url,
  e.tenant_type,
  e.tenant_id,
  ev.type as event_type
FROM webhook_deadletters d
JOIN webhook_deliveries del ON d.delivery_id = del.id
JOIN webhook_endpoints e ON del.endpoint_id = e.id
JOIN webhook_events ev ON del.event_id = ev.id
WHERE d.resolution_status = 'pending'
ORDER BY d.created_at DESC;

-- Pending replays
CREATE OR REPLACE VIEW v_pending_replays AS
SELECT
  r.*,
  e.url,
  e.tenant_type,
  e.tenant_id
FROM webhook_replay_queue r
JOIN webhook_endpoints e ON r.endpoint_id = e.id
WHERE r.status = 'pending'
ORDER BY r.created_at ASC;

-- ========================================
-- SEED DATA
-- ========================================

-- Seed webhook event types
INSERT INTO webhook_events_catalog (event_type, category, description, example_payload) VALUES
('payment.created', 'payments', 'New payment initiated', '{"amount":100,"currency":"USD"}'::jsonb),
('payment.succeeded', 'payments', 'Payment successfully processed', '{"amount":100,"status":"succeeded"}'::jsonb),
('payment.failed', 'payments', 'Payment failed', '{"amount":100,"error":"insufficient_funds"}'::jsonb),
('payment.refunded', 'payments', 'Refund issued', '{"amount":50,"reason":"customer_request"}'::jsonb),
('dispute.created', 'disputes', 'New dispute filed', '{"amount":100,"reason":"fraud"}'::jsonb),
('dispute.resolved', 'disputes', 'Dispute resolved', '{"outcome":"won"}'::jsonb),
('payout.created', 'payouts', 'Payout initiated', '{"amount":1000,"destination":"bank_account"}'::jsonb),
('payout.completed', 'payouts', 'Payout completed', '{"amount":1000,"status":"paid"}'::jsonb),
('kyc.approved', 'kyc', 'KYC verification approved', '{"user_id":"uuid"}'::jsonb),
('kyc.rejected', 'kyc', 'KYC verification rejected', '{"reason":"document_expired"}'::jsonb)
ON CONFLICT (event_type) DO NOTHING;

-- ========================================
-- COMMENTS
-- ========================================

COMMENT ON TABLE webhook_endpoints IS 'Webhook endpoint registrations with multi-tenant isolation';
COMMENT ON TABLE webhook_secrets IS 'Versioned webhook secrets with rotation support';
COMMENT ON TABLE webhook_events IS 'Immutable event log (append-only)';
COMMENT ON TABLE webhook_deliveries IS 'Delivery tracking with retry logic';
COMMENT ON TABLE webhook_deadletters IS 'Dead letter queue for failed deliveries';
COMMENT ON TABLE webhook_profiles IS 'AI-driven adaptive profiles for self-optimization';
COMMENT ON TABLE api_audit_log IS 'Immutable audit trail with blockchain-style hash chain';
COMMENT ON TABLE webhook_replay_queue IS 'AI-guided intelligent replay queue';
COMMENT ON TABLE sira_ai_recommendations IS 'AI-generated optimization recommendations';

-- ========================================
-- PERFORMANCE NOTES
-- ========================================

-- Consider partitioning webhook_events and webhook_deliveries by created_at (monthly)
-- Consider materialized views for dashboard queries
-- Enable pg_stat_statements for query performance monitoring
-- Configure appropriate autovacuum settings for high-write tables

COMMIT;
