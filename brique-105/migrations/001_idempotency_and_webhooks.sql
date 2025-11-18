-- Molam SDK Python - Database Schema
-- Idempotency and webhook management tables
--
-- Compatible with PostgreSQL 10+
-- For MySQL/MariaDB, adjust types as needed:
-- - UUID -> CHAR(36) or VARCHAR(36)
-- - TIMESTAMPTZ -> TIMESTAMP
-- - JSONB -> JSON
-- - gen_random_uuid() -> UUID()

-- ============================================================================
-- Idempotency Table
-- ============================================================================
-- Stores idempotency keys to prevent duplicate operations
-- Recommended retention: 30 days

CREATE TABLE IF NOT EXISTS server_idempotency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT UNIQUE NOT NULL,
    route TEXT NOT NULL,
    response JSONB,
    status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idempotency_key ON server_idempotency(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_idempotency_route ON server_idempotency(route);
CREATE INDEX IF NOT EXISTS idx_idempotency_created_at ON server_idempotency(created_at);

COMMENT ON TABLE server_idempotency IS 'Idempotency key storage for preventing duplicate operations';
COMMENT ON COLUMN server_idempotency.idempotency_key IS 'Unique idempotency key from client';
COMMENT ON COLUMN server_idempotency.route IS 'API route that was called';
COMMENT ON COLUMN server_idempotency.response IS 'Cached response data';
COMMENT ON COLUMN server_idempotency.status IS 'Operation status: processing, completed, failed';

-- ============================================================================
-- Webhooks Table
-- ============================================================================
-- Stores received webhook events for processing and deduplication

CREATE TABLE IF NOT EXISTS received_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT UNIQUE NOT NULL,
    tenant_type TEXT,
    tenant_id UUID,
    event_type TEXT NOT NULL,
    raw_payload JSONB NOT NULL,
    headers JSONB,
    signature TEXT,
    verified BOOLEAN DEFAULT false,
    processed BOOLEAN DEFAULT false,
    retry_count INT DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_event_id ON received_webhooks(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_event_type ON received_webhooks(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_tenant ON received_webhooks(tenant_type, tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_verified ON received_webhooks(verified);
CREATE INDEX IF NOT EXISTS idx_webhook_processed ON received_webhooks(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_created_at ON received_webhooks(created_at);

COMMENT ON TABLE received_webhooks IS 'Webhook event queue for processing and deduplication';
COMMENT ON COLUMN received_webhooks.event_id IS 'Unique event ID from Molam';
COMMENT ON COLUMN received_webhooks.tenant_type IS 'Tenant type (customer, merchant, etc.)';
COMMENT ON COLUMN received_webhooks.tenant_id IS 'Tenant identifier';
COMMENT ON COLUMN received_webhooks.event_type IS 'Event type (payment.succeeded, etc.)';
COMMENT ON COLUMN received_webhooks.verified IS 'Signature verification status';
COMMENT ON COLUMN received_webhooks.processed IS 'Processing status';

-- ============================================================================
-- Webhook Subscriptions Table (optional, for multi-tenant setups)
-- ============================================================================
-- Stores webhook endpoint configurations per tenant

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_type TEXT NOT NULL,
    tenant_id UUID NOT NULL,
    endpoint_url TEXT NOT NULL,
    secret_key_id TEXT NOT NULL,
    event_types JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    failure_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_type, tenant_id, endpoint_url)
);

CREATE INDEX IF NOT EXISTS idx_subscription_tenant ON webhook_subscriptions(tenant_type, tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscription_active ON webhook_subscriptions(is_active);

COMMENT ON TABLE webhook_subscriptions IS 'Webhook endpoint subscriptions per tenant';
COMMENT ON COLUMN webhook_subscriptions.secret_key_id IS 'Key ID for retrieving webhook secret';
COMMENT ON COLUMN webhook_subscriptions.event_types IS 'Array of subscribed event types';

-- ============================================================================
-- Cleanup Functions
-- ============================================================================

-- Function to clean up old idempotency keys
CREATE OR REPLACE FUNCTION cleanup_old_idempotency_keys(retention_days INT DEFAULT 30)
RETURNS INT AS $$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM server_idempotency
    WHERE created_at < NOW() - INTERVAL '1 day' * retention_days;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_idempotency_keys IS 'Delete idempotency keys older than retention period';

-- Function to clean up old processed webhooks
CREATE OR REPLACE FUNCTION cleanup_old_webhooks(retention_days INT DEFAULT 90)
RETURNS INT AS $$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM received_webhooks
    WHERE processed = true
    AND created_at < NOW() - INTERVAL '1 day' * retention_days;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_webhooks IS 'Delete processed webhooks older than retention period';

-- ============================================================================
-- Trigger for updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_idempotency_updated_at
    BEFORE UPDATE ON server_idempotency
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_updated_at
    BEFORE UPDATE ON webhook_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Usage Examples
-- ============================================================================

-- Store idempotency key
-- INSERT INTO server_idempotency (idempotency_key, route, response, status)
-- VALUES ('molam-1705420800000-abc123', '/v1/connect/payment_intents', '{"id": "pi_123"}', 'completed')
-- ON CONFLICT (idempotency_key) DO NOTHING;

-- Retrieve cached response
-- SELECT response FROM server_idempotency
-- WHERE idempotency_key = 'molam-1705420800000-abc123' AND route = '/v1/connect/payment_intents';

-- Store webhook event
-- INSERT INTO received_webhooks (event_id, event_type, raw_payload, verified)
-- VALUES ('evt_123', 'payment.succeeded', '{"data": {...}}'::jsonb, true);

-- Mark webhook as processed
-- UPDATE received_webhooks
-- SET processed = true, processed_at = NOW()
-- WHERE event_id = 'evt_123';

-- Run cleanup (should be scheduled via cron)
-- SELECT cleanup_old_idempotency_keys(30);
-- SELECT cleanup_old_webhooks(90);

-- ============================================================================
-- MySQL/MariaDB Compatibility Notes
-- ============================================================================
-- For MySQL/MariaDB, use the following adjustments:
--
-- 1. Replace UUID with CHAR(36) or use BINARY(16) with UUID_TO_BIN()
-- 2. Replace TIMESTAMPTZ with TIMESTAMP
-- 3. Replace JSONB with JSON
-- 4. Replace gen_random_uuid() with UUID()
-- 5. Replace CHECK constraints with triggers (MySQL <8.0.16)
-- 6. Functions use different syntax (DELIMITER, PROCEDURE instead of FUNCTION)
--
-- Example for MySQL:
-- CREATE TABLE server_idempotency (
--     id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
--     idempotency_key VARCHAR(255) UNIQUE NOT NULL,
--     route VARCHAR(255) NOT NULL,
--     response JSON,
--     status VARCHAR(20) DEFAULT 'processing',
--     last_error TEXT,
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--     INDEX idx_idempotency_key (idempotency_key),
--     INDEX idx_idempotency_route (route),
--     INDEX idx_idempotency_created_at (created_at)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
