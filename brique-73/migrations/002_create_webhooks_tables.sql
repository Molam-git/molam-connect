/**
 * Brique 73 - Webhooks Management
 * Version: 1.0.0 (Industrial Fusion)
 * Migration 002: Webhooks tables
 */

-- ========================================
-- 1) Webhooks Configuration
-- ========================================

CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES dev_apps(id) ON DELETE CASCADE,
  tenant_type TEXT NOT NULL,
  tenant_id UUID NOT NULL,

  -- Endpoint configuration
  url TEXT NOT NULL,
  secret TEXT NOT NULL,                    -- HMAC signing secret (encrypted)
  enabled BOOLEAN DEFAULT TRUE,

  -- Event subscription
  event_types TEXT[] NOT NULL DEFAULT '{}', -- ['payment.succeeded', 'refund.created']
  version TEXT DEFAULT 'v1',

  -- Delivery configuration
  retry_config JSONB DEFAULT '{
    "max_attempts": 3,
    "backoff": "exponential",
    "initial_delay_ms": 1000,
    "max_delay_ms": 60000
  }'::jsonb,

  -- Custom headers
  custom_headers JSONB,                    -- {"X-Custom": "value"}

  -- Metadata
  description TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT webhooks_url_check CHECK (url ~ '^https?://'),
  CONSTRAINT webhooks_tenant_type_check CHECK (tenant_type IN ('merchant', 'partner', 'internal'))
);

CREATE INDEX idx_webhooks_app ON webhooks(app_id);
CREATE INDEX idx_webhooks_tenant ON webhooks(tenant_type, tenant_id);
CREATE INDEX idx_webhooks_enabled ON webhooks(enabled) WHERE enabled = TRUE;

COMMENT ON TABLE webhooks IS 'Webhook endpoint configurations';
COMMENT ON COLUMN webhooks.secret IS 'HMAC-SHA256 signing secret (encrypted at rest)';
COMMENT ON COLUMN webhooks.retry_config IS 'Retry strategy configuration (JSON)';

-- ========================================
-- 2) Webhook Event Catalog
-- ========================================

CREATE TABLE IF NOT EXISTS webhook_events (
  event_type TEXT PRIMARY KEY,
  category TEXT NOT NULL,                  -- 'payment', 'payout', 'dispute', 'kyc'
  description TEXT NOT NULL,
  schema_version TEXT DEFAULT 'v1',
  payload_example JSONB,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed common webhook events
INSERT INTO webhook_events (event_type, category, description, payload_example) VALUES
('payment.succeeded', 'payment', 'Payment was successful', '{"payment_id":"uuid","amount":1000,"currency":"USD"}'::jsonb),
('payment.failed', 'payment', 'Payment failed', '{"payment_id":"uuid","error":"insufficient_funds"}'::jsonb),
('payment.canceled', 'payment', 'Payment was canceled', '{"payment_id":"uuid","reason":"user_canceled"}'::jsonb),
('refund.created', 'refund', 'Refund was created', '{"refund_id":"uuid","amount":500,"currency":"USD"}'::jsonb),
('refund.succeeded', 'refund', 'Refund was successful', '{"refund_id":"uuid"}'::jsonb),
('refund.failed', 'refund', 'Refund failed', '{"refund_id":"uuid","error":"insufficient_balance"}'::jsonb),
('payout.created', 'payout', 'Payout was created', '{"payout_id":"uuid","amount":10000,"currency":"XOF"}'::jsonb),
('payout.succeeded', 'payout', 'Payout was successful', '{"payout_id":"uuid"}'::jsonb),
('payout.failed', 'payout', 'Payout failed', '{"payout_id":"uuid","error":"bank_declined"}'::jsonb),
('dispute.created', 'dispute', 'Dispute was opened', '{"dispute_id":"uuid","payment_id":"uuid"}'::jsonb),
('dispute.closed', 'dispute', 'Dispute was closed', '{"dispute_id":"uuid","outcome":"merchant_win"}'::jsonb),
('kyc.approved', 'kyc', 'KYC verification approved', '{"user_id":"uuid","kyc_level":"P2"}'::jsonb),
('kyc.rejected', 'kyc', 'KYC verification rejected', '{"user_id":"uuid","reason":"document_expired"}'::jsonb)
ON CONFLICT (event_type) DO NOTHING;

CREATE INDEX idx_webhook_events_category ON webhook_events(category);

COMMENT ON TABLE webhook_events IS 'Catalog of available webhook events';

-- ========================================
-- 3) Webhook Deliveries
-- ========================================

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,

  -- Event details
  event_type TEXT NOT NULL,
  event_id UUID,                           -- Original event ID
  idempotency_key TEXT,

  -- Payload
  payload JSONB NOT NULL,
  signature TEXT NOT NULL,                 -- HMAC-SHA256 signature

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'delivered', 'failed', 'retrying'
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,

  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  -- Response
  response_code INTEGER,
  response_body TEXT,
  response_headers JSONB,
  latency_ms INTEGER,

  -- Error tracking
  error_message TEXT,
  error_type TEXT,

  CONSTRAINT webhook_deliveries_status_check CHECK (status IN ('pending', 'delivered', 'failed', 'retrying'))
);

CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id, created_at DESC);
CREATE INDEX idx_webhook_deliveries_event ON webhook_deliveries(event_type, created_at DESC);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status, next_retry_at) WHERE status IN ('pending', 'retrying');
CREATE INDEX idx_webhook_deliveries_idempotency ON webhook_deliveries(idempotency_key) WHERE idempotency_key IS NOT NULL;

COMMENT ON TABLE webhook_deliveries IS 'Webhook delivery attempts with retry logic';
COMMENT ON COLUMN webhook_deliveries.signature IS 'HMAC-SHA256 signature for payload verification';

-- ========================================
-- 4) Webhook Delivery Attempts (detailed history)
-- ========================================

CREATE TABLE IF NOT EXISTS webhook_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES webhook_deliveries(id) ON DELETE CASCADE,

  attempt_number INTEGER NOT NULL,
  attempted_at TIMESTAMPTZ DEFAULT NOW(),

  -- Request details
  request_url TEXT NOT NULL,
  request_headers JSONB,
  request_payload JSONB,

  -- Response details
  response_code INTEGER,
  response_body TEXT,
  response_headers JSONB,
  latency_ms INTEGER,

  -- Error details
  success BOOLEAN NOT NULL,
  error_type TEXT,                         -- 'timeout', 'connection_refused', 'invalid_response'
  error_message TEXT,

  UNIQUE(delivery_id, attempt_number)
);

CREATE INDEX idx_webhook_attempts_delivery ON webhook_delivery_attempts(delivery_id, attempt_number);
CREATE INDEX idx_webhook_attempts_time ON webhook_delivery_attempts(attempted_at DESC);

COMMENT ON TABLE webhook_delivery_attempts IS 'Detailed history of each delivery attempt';

-- ========================================
-- 5) Webhook Audit Log
-- ========================================

CREATE TABLE IF NOT EXISTS webhook_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID,
  app_id UUID,
  action TEXT NOT NULL,                    -- 'created', 'updated', 'deleted', 'enabled', 'disabled'
  actor_id UUID,
  actor_role TEXT,
  changes JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_audit_webhook ON webhook_audit(webhook_id, created_at DESC);
CREATE INDEX idx_webhook_audit_app ON webhook_audit(app_id, created_at DESC);

COMMENT ON TABLE webhook_audit IS 'Audit trail for webhook configuration changes';

-- ========================================
-- Triggers
-- ========================================

-- Auto-update updated_at on webhooks
CREATE OR REPLACE FUNCTION update_webhooks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_webhooks_updated
  BEFORE UPDATE ON webhooks
  FOR EACH ROW
  EXECUTE FUNCTION update_webhooks_updated_at();

-- Auto-audit webhook changes
CREATE OR REPLACE FUNCTION audit_webhook_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO webhook_audit (webhook_id, app_id, action, changes)
    VALUES (NEW.id, NEW.app_id, 'created', jsonb_build_object(
      'url', NEW.url,
      'event_types', NEW.event_types,
      'enabled', NEW.enabled
    ));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.enabled != OLD.enabled THEN
      INSERT INTO webhook_audit (webhook_id, app_id, action, changes)
      VALUES (NEW.id, NEW.app_id,
        CASE WHEN NEW.enabled THEN 'enabled' ELSE 'disabled' END,
        jsonb_build_object('enabled', NEW.enabled)
      );
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO webhook_audit (webhook_id, app_id, action)
    VALUES (OLD.id, OLD.app_id, 'deleted');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_audit_webhooks
  AFTER INSERT OR UPDATE OR DELETE ON webhooks
  FOR EACH ROW
  EXECUTE FUNCTION audit_webhook_change();

-- ========================================
-- Helper Functions
-- ========================================

-- Get active webhooks for an event type
CREATE OR REPLACE FUNCTION get_webhooks_for_event(p_event_type TEXT, p_tenant_type TEXT, p_tenant_id UUID)
RETURNS TABLE (
  webhook_id UUID,
  url TEXT,
  secret TEXT,
  retry_config JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT w.id, w.url, w.secret, w.retry_config
  FROM webhooks w
  WHERE w.enabled = TRUE
    AND w.tenant_type = p_tenant_type
    AND w.tenant_id = p_tenant_id
    AND p_event_type = ANY(w.event_types);
END;
$$ LANGUAGE plpgsql;

-- Calculate next retry time with exponential backoff
CREATE OR REPLACE FUNCTION calculate_next_retry(
  p_attempt_number INTEGER,
  p_initial_delay_ms INTEGER DEFAULT 1000,
  p_max_delay_ms INTEGER DEFAULT 60000
) RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_delay_ms INTEGER;
BEGIN
  -- Exponential backoff: delay = initial_delay * 2^(attempt - 1)
  v_delay_ms := p_initial_delay_ms * POWER(2, p_attempt_number - 1);
  v_delay_ms := LEAST(v_delay_ms, p_max_delay_ms);

  RETURN NOW() + (v_delay_ms || ' milliseconds')::INTERVAL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ========================================
-- Views
-- ========================================

-- Webhook delivery statistics
CREATE VIEW v_webhook_delivery_stats AS
SELECT
  w.id AS webhook_id,
  w.url,
  w.enabled,
  COUNT(wd.id) AS total_deliveries,
  COUNT(wd.id) FILTER (WHERE wd.status = 'delivered') AS successful_deliveries,
  COUNT(wd.id) FILTER (WHERE wd.status = 'failed') AS failed_deliveries,
  COUNT(wd.id) FILTER (WHERE wd.status IN ('pending', 'retrying')) AS pending_deliveries,
  AVG(wd.latency_ms) FILTER (WHERE wd.status = 'delivered') AS avg_latency_ms,
  MAX(wd.created_at) AS last_delivery_at
FROM webhooks w
LEFT JOIN webhook_deliveries wd ON w.id = wd.webhook_id
GROUP BY w.id, w.url, w.enabled;

-- Pending retries (for worker)
CREATE VIEW v_pending_webhook_retries AS
SELECT
  wd.id,
  wd.webhook_id,
  wd.event_type,
  wd.payload,
  wd.attempts,
  wd.max_attempts,
  wd.next_retry_at,
  w.url,
  w.secret,
  w.custom_headers
FROM webhook_deliveries wd
JOIN webhooks w ON wd.webhook_id = w.id
WHERE wd.status IN ('pending', 'retrying')
  AND wd.attempts < wd.max_attempts
  AND (wd.next_retry_at IS NULL OR wd.next_retry_at <= NOW())
  AND w.enabled = TRUE
ORDER BY wd.next_retry_at ASC NULLS FIRST;

COMMENT ON VIEW v_webhook_delivery_stats IS 'Delivery statistics per webhook';
COMMENT ON VIEW v_pending_webhook_retries IS 'Webhooks ready for retry (used by worker)';
