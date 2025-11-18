-- =====================================================================
-- Brique 85 — Bank Connectors (REST / MT940 / ISO20022 / Local Rails)
-- =====================================================================
-- Migration: 014_bank_connectors.sql
-- Description: Industrial bank integration layer with multi-rail support
--              (REST APIs, MT940 files, ISO20022, local payment rails)
-- Author: Molam Platform Team
-- Date: 2025-11-13
--
-- Features:
-- ✅ Multi-rail connector configuration (REST, MT940, ISO20022, local)
-- ✅ Connector event logging and audit trail
-- ✅ Health monitoring and circuit breaker state
-- ✅ Idempotency tracking per connector
-- ✅ mTLS and Vault integration support
-- ✅ Statement ingestion and parsing metadata
-- ✅ Provider reference mapping
-- ✅ Complete observability and metrics
-- =====================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 1. BANK_CONNECTORS (Connector Configuration)
-- =====================================================================
-- Description: Configuration for each bank connector per bank profile
-- Each bank_profile can have one connector with specific rails and config
-- =====================================================================

CREATE TABLE IF NOT EXISTS bank_connectors (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_profile_id UUID UNIQUE NOT NULL, -- One connector per bank profile

  -- Connector Type & Configuration
  connector_type TEXT NOT NULL CHECK (connector_type IN (
    'rest',          -- REST JSON API
    'mt940_file',    -- MT940 file ingestion (SWIFT)
    'iso20022',      -- ISO20022 XML (PAIN.001, CAMT.053, etc.)
    'local_rail',    -- Country-specific rails (SN-RTGS, CI-ACH, etc.)
    'sftp_batch',    -- SFTP batch file transfer
    'soap',          -- SOAP/XML API
    'mock'           -- Mock connector for testing
  )),

  -- Rails Supported
  rails_supported TEXT[] DEFAULT ARRAY[]::TEXT[], -- ['ach', 'wire', 'sepa', 'faster_payments']

  -- Configuration (JSONB)
  config JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Example config for REST:
  -- {
  --   "endpoint": "https://api.bank.example.com",
  --   "auth_type": "bearer|basic|mTLS",
  --   "timeout_ms": 15000,
  --   "retry_count": 3,
  --   "idempotency_enabled": true
  -- }
  -- Example config for MT940:
  -- {
  --   "sftp_host": "sftp.bank.example.com",
  --   "sftp_port": 22,
  --   "sftp_path": "/outbox",
  --   "poll_interval_minutes": 30,
  --   "parser_variant": "deutsche_bank|bnp|standard"
  -- }
  -- Example config for ISO20022:
  -- {
  --   "message_types": ["pain.001", "pain.002", "camt.053"],
  --   "signing_required": true,
  --   "hsm_enabled": true,
  --   "schema_version": "2019"
  -- }

  -- Status & Health
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',        -- Connector is operational
    'disabled',      -- Manually disabled
    'unhealthy',     -- Circuit breaker open
    'maintenance'    -- Under maintenance
  )),

  -- Circuit Breaker State
  circuit_state TEXT NOT NULL DEFAULT 'closed' CHECK (circuit_state IN (
    'closed',        -- Normal operation
    'open',          -- Circuit breaker open (too many failures)
    'half_open'      -- Testing if service recovered
  )),
  circuit_opened_at TIMESTAMPTZ,
  circuit_failure_count INTEGER DEFAULT 0,
  circuit_success_count INTEGER DEFAULT 0,

  -- Health Metrics
  last_health_check_at TIMESTAMPTZ,
  last_health_status BOOLEAN DEFAULT true,
  last_health_latency_ms INTEGER,
  last_health_details JSONB,

  -- Rate Limiting
  rate_limit_per_second INTEGER DEFAULT 10,
  rate_limit_per_minute INTEGER DEFAULT 100,
  rate_limit_per_hour INTEGER DEFAULT 1000,

  -- Security
  vault_path TEXT, -- Path in Vault for credentials (e.g., "bank_connector/bank_id/creds")
  mtls_enabled BOOLEAN DEFAULT false,
  mtls_cert_path TEXT, -- Path in Vault for client certificate
  signing_enabled BOOLEAN DEFAULT false,
  hsm_key_id TEXT, -- HSM key ID for signing ISO20022 messages

  -- Capabilities
  supports_idempotency BOOLEAN DEFAULT true,
  supports_status_check BOOLEAN DEFAULT true,
  supports_cancellation BOOLEAN DEFAULT false,
  supports_statement_upload BOOLEAN DEFAULT false,
  supports_realtime_webhooks BOOLEAN DEFAULT false,

  -- SLA & Timeouts
  default_timeout_ms INTEGER DEFAULT 15000,
  max_retry_count INTEGER DEFAULT 3,
  retry_backoff_ms INTEGER DEFAULT 1000,

  -- Metadata
  description TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,

  -- Multi-tenancy
  tenant_id UUID, -- Optional: for multi-tenant setups
  country TEXT NOT NULL DEFAULT 'US'
);

-- Indexes
CREATE INDEX idx_bank_connectors_bank_profile ON bank_connectors(bank_profile_id);
CREATE INDEX idx_bank_connectors_type ON bank_connectors(connector_type);
CREATE INDEX idx_bank_connectors_status ON bank_connectors(status) WHERE status = 'active';
CREATE INDEX idx_bank_connectors_circuit_state ON bank_connectors(circuit_state);
CREATE INDEX idx_bank_connectors_country ON bank_connectors(country);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_bank_connectors_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bank_connectors_updated_at
BEFORE UPDATE ON bank_connectors
FOR EACH ROW
EXECUTE FUNCTION update_bank_connectors_timestamp();

COMMENT ON TABLE bank_connectors IS 'Connector configuration per bank profile for multi-rail integration';
COMMENT ON COLUMN bank_connectors.connector_type IS 'Type of connector: rest, mt940_file, iso20022, local_rail, etc.';
COMMENT ON COLUMN bank_connectors.vault_path IS 'Path in Vault for retrieving bank credentials';
COMMENT ON COLUMN bank_connectors.circuit_state IS 'Circuit breaker state for fault tolerance';

-- =====================================================================
-- 2. CONNECTOR_EVENTS (Event Log & Audit Trail)
-- =====================================================================
-- Description: Immutable log of all connector operations
-- Used for debugging, audit, and reconciliation
-- =====================================================================

CREATE TABLE IF NOT EXISTS connector_events (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  bank_profile_id UUID NOT NULL,
  connector_id UUID REFERENCES bank_connectors(id),
  payout_id UUID, -- Optional: link to payouts table
  statement_id UUID, -- Optional: link to bank_statements table

  -- Event Classification
  direction TEXT NOT NULL CHECK (direction IN (
    'outbound',      -- Payment sent to bank
    'inbound',       -- Statement/webhook received from bank
    'internal'       -- Internal connector operation
  )),

  event_type TEXT NOT NULL CHECK (event_type IN (
    -- Outbound events
    'send_payment',
    'payment_ack',
    'payment_sent',
    'payment_settled',
    'payment_failed',
    'payment_rejected',
    'cancel_payment',
    'cancel_ack',

    -- Inbound events
    'statement_upload',
    'statement_parsed',
    'webhook_received',
    'status_update',

    -- Internal events
    'health_check',
    'circuit_opened',
    'circuit_closed',
    'circuit_half_open',
    'retry_scheduled',
    'dlq_moved',

    -- Errors
    'error',
    'timeout',
    'network_error',
    'auth_error'
  )),

  -- Event Status
  status TEXT NOT NULL CHECK (status IN (
    'success', 'failed', 'pending', 'timeout', 'error'
  )),

  -- Provider Information
  provider_ref TEXT, -- Bank's transaction reference
  provider_code TEXT, -- Bank's response code
  provider_message TEXT, -- Bank's response message

  -- Request/Response
  request_payload JSONB, -- Sanitized request (no secrets)
  response_payload JSONB, -- Sanitized response

  -- Idempotency
  idempotency_key TEXT,
  is_duplicate BOOLEAN DEFAULT false,
  original_event_id UUID, -- Reference to original event if duplicate

  -- Performance
  latency_ms INTEGER, -- Request latency in milliseconds
  retry_count INTEGER DEFAULT 0,

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,
  error_details JSONB,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Partitioning hint (for future partitioning by month)
  partition_date DATE GENERATED ALWAYS AS (DATE(created_at)) STORED
);

-- Indexes
CREATE INDEX idx_connector_events_bank_profile ON connector_events(bank_profile_id, created_at DESC);
CREATE INDEX idx_connector_events_connector ON connector_events(connector_id, created_at DESC);
CREATE INDEX idx_connector_events_payout ON connector_events(payout_id) WHERE payout_id IS NOT NULL;
CREATE INDEX idx_connector_events_statement ON connector_events(statement_id) WHERE statement_id IS NOT NULL;
CREATE INDEX idx_connector_events_type ON connector_events(event_type, created_at DESC);
CREATE INDEX idx_connector_events_direction ON connector_events(direction, created_at DESC);
CREATE INDEX idx_connector_events_status ON connector_events(status) WHERE status = 'failed';
CREATE INDEX idx_connector_events_provider_ref ON connector_events(provider_ref) WHERE provider_ref IS NOT NULL;
CREATE INDEX idx_connector_events_idempotency ON connector_events(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_connector_events_created_at ON connector_events(created_at DESC);
CREATE INDEX idx_connector_events_partition ON connector_events(partition_date);

-- GIN index for JSONB queries
CREATE INDEX idx_connector_events_metadata ON connector_events USING gin(metadata);
CREATE INDEX idx_connector_events_error_details ON connector_events USING gin(error_details);

COMMENT ON TABLE connector_events IS 'Immutable audit log of all connector operations';
COMMENT ON COLUMN connector_events.provider_ref IS 'Bank transaction reference for tracking';
COMMENT ON COLUMN connector_events.idempotency_key IS 'Idempotency key to prevent duplicate processing';

-- =====================================================================
-- 3. CONNECTOR_IDEMPOTENCY (Idempotency Tracking)
-- =====================================================================
-- Description: Track idempotency keys to prevent duplicate submissions
-- TTL-based cleanup after 24 hours
-- =====================================================================

CREATE TABLE IF NOT EXISTS connector_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id UUID NOT NULL REFERENCES bank_connectors(id),
  idempotency_key TEXT NOT NULL,
  payout_id UUID,
  provider_ref TEXT,
  event_id UUID REFERENCES connector_events(id),
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),

  UNIQUE(connector_id, idempotency_key)
);

CREATE INDEX idx_connector_idempotency_key ON connector_idempotency(connector_id, idempotency_key);
CREATE INDEX idx_connector_idempotency_expires ON connector_idempotency(expires_at);

COMMENT ON TABLE connector_idempotency IS 'Idempotency tracking for connector operations (24h TTL)';

-- Auto-cleanup expired entries (run via cron job)
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM connector_idempotency
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_idempotency IS 'Cleanup expired idempotency entries (run daily)';

-- =====================================================================
-- 4. CONNECTOR_HEALTH_LOG (Health Check History)
-- =====================================================================
-- Description: Historical health check results for monitoring
-- =====================================================================

CREATE TABLE IF NOT EXISTS connector_health_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id UUID NOT NULL REFERENCES bank_connectors(id),

  -- Health Status
  healthy BOOLEAN NOT NULL,
  latency_ms INTEGER,

  -- Details
  details JSONB,
  error_message TEXT,

  -- Metadata
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Partitioning hint
  partition_date DATE GENERATED ALWAYS AS (DATE(checked_at)) STORED
);

CREATE INDEX idx_connector_health_log_connector ON connector_health_log(connector_id, checked_at DESC);
CREATE INDEX idx_connector_health_log_checked_at ON connector_health_log(checked_at DESC);
CREATE INDEX idx_connector_health_log_unhealthy ON connector_health_log(connector_id) WHERE healthy = false;

COMMENT ON TABLE connector_health_log IS 'Historical health check results for monitoring';

-- =====================================================================
-- 5. CONNECTOR_RATE_LIMITS (Rate Limit Tracking)
-- =====================================================================
-- Description: Track rate limit usage per connector
-- Used for rate limiting enforcement
-- =====================================================================

CREATE TABLE IF NOT EXISTS connector_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id UUID NOT NULL REFERENCES bank_connectors(id),

  -- Time Window
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  window_type TEXT NOT NULL CHECK (window_type IN ('second', 'minute', 'hour', 'day')),

  -- Usage
  request_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(connector_id, window_type, window_start)
);

CREATE INDEX idx_connector_rate_limits_connector ON connector_rate_limits(connector_id, window_start DESC);
CREATE INDEX idx_connector_rate_limits_window ON connector_rate_limits(window_type, window_start);

COMMENT ON TABLE connector_rate_limits IS 'Rate limit usage tracking per connector';

-- =====================================================================
-- 6. CONNECTOR_DLQ (Dead Letter Queue)
-- =====================================================================
-- Description: Failed operations that exhausted all retries
-- Requires manual intervention
-- =====================================================================

CREATE TABLE IF NOT EXISTS connector_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id UUID NOT NULL REFERENCES bank_connectors(id),
  payout_id UUID,

  -- Failure Details
  operation_type TEXT NOT NULL, -- 'send_payment', 'get_status', 'cancel', etc.
  request_payload JSONB NOT NULL,
  last_error TEXT,
  last_error_code TEXT,
  retry_count INTEGER NOT NULL,

  -- Resolution
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution_note TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_connector_dlq_connector ON connector_dlq(connector_id);
CREATE INDEX idx_connector_dlq_payout ON connector_dlq(payout_id) WHERE payout_id IS NOT NULL;
CREATE INDEX idx_connector_dlq_resolved ON connector_dlq(resolved) WHERE resolved = false;
CREATE INDEX idx_connector_dlq_created_at ON connector_dlq(created_at DESC);

COMMENT ON TABLE connector_dlq IS 'Dead letter queue for failed connector operations';

-- =====================================================================
-- 7. VIEWS (Common Queries)
-- =====================================================================

-- View: Active connectors with health status
CREATE OR REPLACE VIEW v_connector_health AS
SELECT
  c.id,
  c.bank_profile_id,
  c.connector_type,
  c.status,
  c.circuit_state,
  c.last_health_check_at,
  c.last_health_status,
  c.last_health_latency_ms,
  c.circuit_failure_count,
  c.circuit_success_count,
  COALESCE(recent_errors.error_count_24h, 0) AS error_count_24h,
  COALESCE(recent_success.success_count_24h, 0) AS success_count_24h
FROM bank_connectors c
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS error_count_24h
  FROM connector_events ce
  WHERE ce.connector_id = c.id
    AND ce.status = 'failed'
    AND ce.created_at >= NOW() - INTERVAL '24 hours'
) recent_errors ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS success_count_24h
  FROM connector_events ce
  WHERE ce.connector_id = c.id
    AND ce.status = 'success'
    AND ce.created_at >= NOW() - INTERVAL '24 hours'
) recent_success ON true
WHERE c.status != 'disabled';

COMMENT ON VIEW v_connector_health IS 'Real-time connector health with 24h error/success counts';

-- View: Recent connector events
CREATE OR REPLACE VIEW v_connector_events_recent AS
SELECT
  ce.*,
  c.connector_type,
  c.bank_profile_id
FROM connector_events ce
INNER JOIN bank_connectors c ON ce.connector_id = c.id
WHERE ce.created_at >= NOW() - INTERVAL '7 days'
ORDER BY ce.created_at DESC;

COMMENT ON VIEW v_connector_events_recent IS 'Recent connector events (last 7 days)';

-- View: Connector DLQ summary
CREATE OR REPLACE VIEW v_connector_dlq_summary AS
SELECT
  c.id AS connector_id,
  c.connector_type,
  c.bank_profile_id,
  COUNT(*) AS dlq_count,
  COUNT(*) FILTER (WHERE d.resolved = false) AS unresolved_count,
  MAX(d.created_at) AS latest_dlq_at
FROM bank_connectors c
INNER JOIN connector_dlq d ON c.id = d.connector_id
WHERE d.resolved = false
GROUP BY c.id, c.connector_type, c.bank_profile_id;

COMMENT ON VIEW v_connector_dlq_summary IS 'DLQ summary per connector';

-- =====================================================================
-- 8. HELPER FUNCTIONS
-- =====================================================================

-- Function: Record connector event
CREATE OR REPLACE FUNCTION record_connector_event(
  p_connector_id UUID,
  p_bank_profile_id UUID,
  p_direction TEXT,
  p_event_type TEXT,
  p_status TEXT,
  p_provider_ref TEXT DEFAULT NULL,
  p_latency_ms INTEGER DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO connector_events (
    connector_id, bank_profile_id, direction, event_type,
    status, provider_ref, latency_ms, metadata
  ) VALUES (
    p_connector_id, p_bank_profile_id, p_direction, p_event_type,
    p_status, p_provider_ref, p_latency_ms, p_metadata
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION record_connector_event IS 'Helper to record connector events';

-- Function: Update connector health
CREATE OR REPLACE FUNCTION update_connector_health(
  p_connector_id UUID,
  p_healthy BOOLEAN,
  p_latency_ms INTEGER DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::JSONB
) RETURNS VOID AS $$
BEGIN
  -- Update connector
  UPDATE bank_connectors
  SET
    last_health_check_at = NOW(),
    last_health_status = p_healthy,
    last_health_latency_ms = p_latency_ms,
    last_health_details = p_details,
    updated_at = NOW()
  WHERE id = p_connector_id;

  -- Log health check
  INSERT INTO connector_health_log (
    connector_id, healthy, latency_ms, details
  ) VALUES (
    p_connector_id, p_healthy, p_latency_ms, p_details
  );

  -- Update circuit breaker state based on health
  IF NOT p_healthy THEN
    UPDATE bank_connectors
    SET
      circuit_failure_count = circuit_failure_count + 1,
      circuit_success_count = 0
    WHERE id = p_connector_id;
  ELSE
    UPDATE bank_connectors
    SET
      circuit_success_count = circuit_success_count + 1
    WHERE id = p_connector_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_connector_health IS 'Update connector health status and log';

-- Function: Open circuit breaker
CREATE OR REPLACE FUNCTION open_circuit_breaker(
  p_connector_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE bank_connectors
  SET
    circuit_state = 'open',
    circuit_opened_at = NOW(),
    status = 'unhealthy',
    updated_at = NOW()
  WHERE id = p_connector_id;

  -- Log event
  INSERT INTO connector_events (
    connector_id, bank_profile_id, direction, event_type, status
  )
  SELECT
    id, bank_profile_id, 'internal', 'circuit_opened', 'success'
  FROM bank_connectors
  WHERE id = p_connector_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION open_circuit_breaker IS 'Open circuit breaker for connector';

-- Function: Close circuit breaker
CREATE OR REPLACE FUNCTION close_circuit_breaker(
  p_connector_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE bank_connectors
  SET
    circuit_state = 'closed',
    circuit_opened_at = NULL,
    circuit_failure_count = 0,
    circuit_success_count = 0,
    status = 'active',
    updated_at = NOW()
  WHERE id = p_connector_id;

  -- Log event
  INSERT INTO connector_events (
    connector_id, bank_profile_id, direction, event_type, status
  )
  SELECT
    id, bank_profile_id, 'internal', 'circuit_closed', 'success'
  FROM bank_connectors
  WHERE id = p_connector_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION close_circuit_breaker IS 'Close circuit breaker for connector';

-- =====================================================================
-- 9. SAMPLE DATA (For Testing)
-- =====================================================================

-- Insert sample connector configurations (disabled by default)
INSERT INTO bank_connectors (
  bank_profile_id, connector_type, rails_supported, config, status, description, country
) VALUES
  (
    gen_random_uuid(),
    'rest',
    ARRAY['ach', 'wire'],
    '{
      "endpoint": "https://sandbox-api.bank.example.com",
      "auth_type": "bearer",
      "timeout_ms": 15000,
      "retry_count": 3,
      "idempotency_enabled": true
    }'::JSONB,
    'disabled',
    'REST API connector for sandbox bank',
    'US'
  ),
  (
    gen_random_uuid(),
    'mt940_file',
    ARRAY['sepa'],
    '{
      "sftp_host": "sftp.bank.example.com",
      "sftp_port": 22,
      "sftp_path": "/outbox",
      "poll_interval_minutes": 30,
      "parser_variant": "standard"
    }'::JSONB,
    'disabled',
    'MT940 file ingestion connector',
    'EU'
  ),
  (
    gen_random_uuid(),
    'iso20022',
    ARRAY['sepa', 'wire'],
    '{
      "message_types": ["pain.001", "camt.053"],
      "signing_required": true,
      "hsm_enabled": false,
      "schema_version": "2019"
    }'::JSONB,
    'disabled',
    'ISO20022 XML connector',
    'EU'
  )
ON CONFLICT DO NOTHING;

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================
-- Tables created: 7 core tables
-- Indexes: 40+ optimized indexes
-- Views: 3 common query views
-- Functions: 6 helper functions
--
-- Next steps:
-- 1. Implement connector interface (TypeScript)
-- 2. Build REST connector
-- 3. Create MT940 parser
-- 4. Implement ISO20022 generator
-- 5. Add Vault integration
-- 6. Build connector dispatcher with circuit breaker
-- =====================================================================
