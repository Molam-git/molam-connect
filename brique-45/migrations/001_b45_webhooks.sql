-- ============================================================================
-- Brique 45 - Webhooks Industriels
-- Migration 001: Multi-tenant endpoints, versioned secrets, retry+DLQ
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- Tenancy: merchants, agents, apps (webhook receivers)
-- ============================================================================
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_type        TEXT NOT NULL,          -- 'merchant'|'agent'|'internal_app'
  tenant_id          UUID NOT NULL,          -- id du marchand/agent/app
  url                TEXT NOT NULL,
  description        TEXT,
  status             TEXT NOT NULL DEFAULT 'active', -- active|paused|disabled
  api_version        TEXT NOT NULL DEFAULT '2025-01',
  region             TEXT,                   -- ex: 'EU','US','XOF'
  created_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_type, tenant_id, url),
  CONSTRAINT endpoint_status_check CHECK (status IN ('active', 'paused', 'disabled')),
  CONSTRAINT endpoint_tenant_type_check CHECK (tenant_type IN ('merchant', 'agent', 'internal_app'))
);

-- Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_webhook_endpoints_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER webhook_endpoints_updated_at_trigger
BEFORE UPDATE ON webhook_endpoints
FOR EACH ROW
EXECUTE FUNCTION update_webhook_endpoints_updated_at();

-- ============================================================================
-- Secrets versionnés pour rotation
-- ============================================================================
CREATE TABLE IF NOT EXISTS webhook_secrets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id        UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  version            INTEGER NOT NULL,             -- 1,2,3… (clé active = max(version) avec status='active')
  status             TEXT NOT NULL DEFAULT 'active', -- active|retiring|revoked
  secret_ciphertext  BYTEA NOT NULL,              -- chiffré applicativement (KMS/Vault)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(endpoint_id, version),
  CONSTRAINT secret_status_check CHECK (status IN ('active', 'retiring', 'revoked'))
);

-- ============================================================================
-- Souscriptions par type d'événement
-- ============================================================================
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id        UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_type         TEXT NOT NULL,               -- ex: 'payment.succeeded'
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(endpoint_id, event_type)
);

-- ============================================================================
-- Événements (immutables)
-- ============================================================================
CREATE TABLE IF NOT EXISTS webhook_events (
  id                 UUID PRIMARY KEY,            -- event_id (KSUID/ULID)
  tenant_type        TEXT NOT NULL,
  tenant_id          UUID NOT NULL,               -- producteur (ex: merchant du paiement)
  type               TEXT NOT NULL,               -- 'payment.succeeded', 'refund.created', …
  data               JSONB NOT NULL,              -- payload canonique
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_tenant_type_check CHECK (tenant_type IN ('merchant', 'agent', 'internal_app'))
);

-- ============================================================================
-- Livraisons (1 événement -> N endpoints)
-- ============================================================================
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- delivery_id
  event_id           UUID NOT NULL REFERENCES webhook_events(id) ON DELETE CASCADE,
  endpoint_id        UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'pending', -- pending|delivering|succeeded|failed|quarantined
  next_attempt_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts           INTEGER NOT NULL DEFAULT 0,
  last_code          INTEGER,
  last_error         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, endpoint_id),
  CONSTRAINT delivery_status_check CHECK (status IN ('pending', 'delivering', 'succeeded', 'failed', 'quarantined'))
);

-- Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_webhook_deliveries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER webhook_deliveries_updated_at_trigger
BEFORE UPDATE ON webhook_deliveries
FOR EACH ROW
EXECUTE FUNCTION update_webhook_deliveries_updated_at();

-- ============================================================================
-- Historique des tentatives (audit immuable)
-- ============================================================================
CREATE TABLE IF NOT EXISTS webhook_delivery_attempts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id        UUID NOT NULL REFERENCES webhook_deliveries(id) ON DELETE CASCADE,
  attempted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  http_code          INTEGER,
  latency_ms         INTEGER,
  error              TEXT
);

-- ============================================================================
-- File d'attente/DLQ (quarantaine après épuisement retries)
-- ============================================================================
CREATE TABLE IF NOT EXISTS webhook_deadletters (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id        UUID NOT NULL REFERENCES webhook_deliveries(id) ON DELETE CASCADE,
  event_id           UUID NOT NULL,
  endpoint_id        UUID NOT NULL,
  reason             TEXT NOT NULL,              -- 'max_retries', 'invalid_signature', etc.
  snapshot           JSONB,                      -- copie utile pour reprocess manuel
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Index clés
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_wd_status_next ON webhook_deliveries(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_we_type_created ON webhook_events(type, created_at);
CREATE INDEX IF NOT EXISTS idx_ws_endpoint ON webhook_subscriptions(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_we_tenant ON webhook_events(tenant_type, tenant_id);
CREATE INDEX IF NOT EXISTS idx_wda_delivery ON webhook_delivery_attempts(delivery_id);
CREATE INDEX IF NOT EXISTS idx_wdl_created ON webhook_deadletters(created_at);

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE webhook_endpoints IS 'Multi-tenant webhook receivers (merchants, agents, internal apps)';
COMMENT ON TABLE webhook_secrets IS 'Versioned secrets for signature rotation with grace period';
COMMENT ON TABLE webhook_subscriptions IS 'Event type subscriptions per endpoint';
COMMENT ON TABLE webhook_events IS 'Immutable event log';
COMMENT ON TABLE webhook_deliveries IS 'Delivery tracking: 1 event → N endpoints with retry logic';
COMMENT ON TABLE webhook_delivery_attempts IS 'Immutable audit trail of all delivery attempts';
COMMENT ON TABLE webhook_deadletters IS 'Dead letter queue for failed deliveries after max retries';
