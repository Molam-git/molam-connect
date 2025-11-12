/**
 * Brique 73 - Webhooks & Developer Tools
 * Version: 1.0.0
 * Dependencies: PostgreSQL 14+
 */

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Check PostgreSQL version
DO $$
BEGIN
  IF current_setting('server_version_num')::int < 140000 THEN
    RAISE EXCEPTION 'PostgreSQL 14+ required (current: %)', version();
  END IF;
END $$;

-- ========================================
-- 1) Developer Apps
-- ========================================

CREATE TABLE IF NOT EXISTS dev_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_type TEXT NOT NULL,              -- 'merchant', 'partner', 'internal'
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  environment TEXT NOT NULL DEFAULT 'test', -- 'test' | 'live'
  status TEXT NOT NULL DEFAULT 'active',    -- 'active' | 'paused' | 'revoked'
  icon_url TEXT,
  redirect_uris TEXT[],                    -- OAuth redirect URIs
  webhook_url TEXT,                        -- Default webhook endpoint
  webhook_secret TEXT,                     -- Webhook signing secret
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT dev_apps_tenant_type_check CHECK (tenant_type IN ('merchant', 'partner', 'internal')),
  CONSTRAINT dev_apps_environment_check CHECK (environment IN ('test', 'live')),
  CONSTRAINT dev_apps_status_check CHECK (status IN ('active', 'paused', 'revoked'))
);

CREATE INDEX idx_dev_apps_tenant ON dev_apps(tenant_type, tenant_id);
CREATE INDEX idx_dev_apps_status ON dev_apps(status);
CREATE INDEX idx_dev_apps_created_at ON dev_apps(created_at DESC);

COMMENT ON TABLE dev_apps IS 'Developer applications with API access';
COMMENT ON COLUMN dev_apps.tenant_type IS 'Type of entity owning this app';
COMMENT ON COLUMN dev_apps.environment IS 'test = sandbox only, live = production';

-- ========================================
-- 2) API Keys
-- ========================================

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES dev_apps(id) ON DELETE CASCADE,
  kid TEXT NOT NULL,                       -- Key ID / version
  name TEXT,                               -- Friendly name
  secret_hash TEXT NOT NULL,               -- bcrypt hash of secret
  secret_ciphertext BYTEA NOT NULL,        -- Encrypted secret for Vault
  scopes TEXT[] NOT NULL DEFAULT '{}',     -- ['payments:read', 'payments:write']
  environment TEXT NOT NULL,               -- 'test' | 'live'
  status TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'retiring' | 'revoked'
  last_used_at TIMESTAMPTZ,
  last_used_ip TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID,
  revoked_reason TEXT,

  CONSTRAINT api_keys_environment_check CHECK (environment IN ('test', 'live')),
  CONSTRAINT api_keys_status_check CHECK (status IN ('active', 'retiring', 'revoked'))
);

CREATE UNIQUE INDEX idx_api_keys_kid ON api_keys(kid) WHERE status != 'revoked';
CREATE INDEX idx_api_keys_app ON api_keys(app_id);
CREATE INDEX idx_api_keys_status ON api_keys(status);
CREATE INDEX idx_api_keys_expires ON api_keys(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE api_keys IS 'API keys for programmatic access';
COMMENT ON COLUMN api_keys.kid IS 'Public key identifier (shown in requests)';
COMMENT ON COLUMN api_keys.secret_hash IS 'Bcrypt hash for quick validation';
COMMENT ON COLUMN api_keys.secret_ciphertext IS 'Encrypted full secret (Vault)';
COMMENT ON COLUMN api_keys.scopes IS 'Array of permission scopes';

-- ========================================
-- 3) API Request Logs (high-volume)
-- ========================================

CREATE TABLE IF NOT EXISTS api_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID,
  key_id UUID,
  tenant_type TEXT,
  tenant_id UUID,
  method TEXT NOT NULL,                    -- GET, POST, PUT, DELETE
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  latency_ms INTEGER,
  request_bytes INTEGER,
  response_bytes INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  error_code TEXT,
  error_message TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partitioned by month for performance (hypertable in TimescaleDB)
CREATE INDEX idx_api_logs_app_time ON api_request_logs(app_id, created_at DESC);
CREATE INDEX idx_api_logs_key_time ON api_request_logs(key_id, created_at DESC);
CREATE INDEX idx_api_logs_tenant_time ON api_request_logs(tenant_type, tenant_id, created_at DESC);
CREATE INDEX idx_api_logs_status ON api_request_logs(status_code, created_at DESC);
CREATE INDEX idx_api_logs_created_at ON api_request_logs(created_at DESC);

COMMENT ON TABLE api_request_logs IS 'High-volume API request logs for analytics and billing';

-- ========================================
-- 4) API Quotas & Rate Limits
-- ========================================

CREATE TABLE IF NOT EXISTS api_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_type TEXT NOT NULL,
  tenant_id UUID NOT NULL,
  period TEXT NOT NULL DEFAULT 'day',      -- 'minute', 'hour', 'day', 'month'
  requests_limit BIGINT NOT NULL,
  billing_tier TEXT,                       -- 'free', 'starter', 'growth', 'enterprise'
  overage_allowed BOOLEAN DEFAULT FALSE,
  overage_rate NUMERIC(10,4),              -- Cost per request over limit
  effective_from TIMESTAMPTZ DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT api_quotas_period_check CHECK (period IN ('minute', 'hour', 'day', 'month'))
);

CREATE UNIQUE INDEX idx_api_quotas_tenant ON api_quotas(tenant_type, tenant_id, period, effective_from);
CREATE INDEX idx_api_quotas_tier ON api_quotas(billing_tier);

COMMENT ON TABLE api_quotas IS 'Rate limits and quotas per tenant with billing tiers';

-- ========================================
-- 5) Sandbox Bindings (test data isolation)
-- ========================================

CREATE TABLE IF NOT EXISTS sandbox_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES dev_apps(id) ON DELETE CASCADE,
  sandbox_tenant_id UUID NOT NULL,         -- Virtual tenant ID for sandbox
  sandbox_merchant_id UUID,
  sandbox_wallet_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(app_id)
);

CREATE INDEX idx_sandbox_bindings_app ON sandbox_bindings(app_id);

COMMENT ON TABLE sandbox_bindings IS 'Maps test apps to isolated sandbox tenant data';

-- ========================================
-- 6) Sandbox Events (simulated events for testing)
-- ========================================

CREATE TABLE IF NOT EXISTS sandbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES dev_apps(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,                -- 'payment.succeeded', 'refund.created', etc.
  event_data JSONB NOT NULL,
  webhook_status TEXT DEFAULT 'pending',   -- 'pending', 'delivered', 'failed'
  webhook_attempts INTEGER DEFAULT 0,
  webhook_delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT sandbox_events_webhook_status_check CHECK (webhook_status IN ('pending', 'delivered', 'failed'))
);

CREATE INDEX idx_sandbox_events_app ON sandbox_events(app_id, created_at DESC);
CREATE INDEX idx_sandbox_events_type ON sandbox_events(event_type);
CREATE INDEX idx_sandbox_events_status ON sandbox_events(webhook_status) WHERE webhook_status = 'pending';

COMMENT ON TABLE sandbox_events IS 'Test events generated in developer playground';

-- ========================================
-- 7) Usage Metrics (aggregated for billing)
-- ========================================

CREATE TABLE IF NOT EXISTS api_usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_type TEXT NOT NULL,
  tenant_id UUID NOT NULL,
  app_id UUID,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  total_requests BIGINT DEFAULT 0,
  successful_requests BIGINT DEFAULT 0,   -- 2xx status codes
  failed_requests BIGINT DEFAULT 0,       -- 4xx, 5xx
  total_latency_ms BIGINT DEFAULT 0,
  total_bytes_in BIGINT DEFAULT 0,
  total_bytes_out BIGINT DEFAULT 0,
  webhook_deliveries BIGINT DEFAULT 0,
  billed_amount NUMERIC(18,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_type, tenant_id, app_id, period_start)
);

CREATE INDEX idx_usage_metrics_tenant ON api_usage_metrics(tenant_type, tenant_id, period_start DESC);
CREATE INDEX idx_usage_metrics_app ON api_usage_metrics(app_id, period_start DESC);

COMMENT ON TABLE api_usage_metrics IS 'Aggregated usage metrics for billing';

-- ========================================
-- 8) Audit Log (API key lifecycle)
-- ========================================

CREATE TABLE IF NOT EXISTS api_key_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID,
  app_id UUID,
  action TEXT NOT NULL,                    -- 'created', 'rotated', 'revoked', 'used'
  actor_id UUID,
  actor_role TEXT,
  metadata JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_key_audit_key ON api_key_audit(key_id, created_at DESC);
CREATE INDEX idx_api_key_audit_app ON api_key_audit(app_id, created_at DESC);
CREATE INDEX idx_api_key_audit_action ON api_key_audit(action);

COMMENT ON TABLE api_key_audit IS 'Immutable audit trail for API key operations';

-- ========================================
-- 9) Scopes Definition (reference table)
-- ========================================

CREATE TABLE IF NOT EXISTS api_scopes (
  scope_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,                  -- 'payments', 'payouts', 'billing', 'webhooks'
  risk_level TEXT DEFAULT 'low',           -- 'low', 'medium', 'high', 'critical'
  requires_pci BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default scopes
INSERT INTO api_scopes (scope_key, display_name, description, category, risk_level) VALUES
('payments:read', 'Read Payments', 'View payment transactions and details', 'payments', 'low'),
('payments:write', 'Create Payments', 'Initiate payment transactions', 'payments', 'high'),
('payments:refund', 'Refund Payments', 'Create refunds for payments', 'payments', 'high'),
('payouts:read', 'Read Payouts', 'View payout transactions', 'payouts', 'low'),
('payouts:write', 'Create Payouts', 'Initiate payouts to users', 'payouts', 'critical'),
('wallets:read', 'Read Wallets', 'View wallet balances and history', 'wallets', 'medium'),
('wallets:write', 'Modify Wallets', 'Transfer funds, adjust balances', 'wallets', 'critical'),
('billing:read', 'Read Billing', 'View invoices and billing data', 'billing', 'low'),
('webhooks:manage', 'Manage Webhooks', 'Configure webhook endpoints', 'webhooks', 'medium'),
('disputes:read', 'Read Disputes', 'View dispute cases', 'disputes', 'low'),
('disputes:write', 'Manage Disputes', 'Respond to disputes', 'disputes', 'high'),
('kyc:read', 'Read KYC', 'View KYC verification status', 'kyc', 'medium'),
('analytics:read', 'Read Analytics', 'Access analytics and reports', 'analytics', 'low')
ON CONFLICT (scope_key) DO NOTHING;

-- ========================================
-- Triggers
-- ========================================

-- Auto-update updated_at on dev_apps
CREATE OR REPLACE FUNCTION update_dev_apps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_dev_apps_updated
  BEFORE UPDATE ON dev_apps
  FOR EACH ROW
  EXECUTE FUNCTION update_dev_apps_updated_at();

-- Auto-audit API key changes
CREATE OR REPLACE FUNCTION audit_api_key_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO api_key_audit (key_id, app_id, action, metadata)
    VALUES (NEW.id, NEW.app_id, 'created', jsonb_build_object(
      'kid', NEW.kid,
      'environment', NEW.environment,
      'scopes', NEW.scopes
    ));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'revoked' AND OLD.status != 'revoked' THEN
      INSERT INTO api_key_audit (key_id, app_id, action, actor_id, metadata)
      VALUES (NEW.id, NEW.app_id, 'revoked', NEW.revoked_by, jsonb_build_object(
        'reason', NEW.revoked_reason,
        'previous_status', OLD.status
      ));
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_audit_api_keys
  AFTER INSERT OR UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION audit_api_key_change();

-- Auto-expire API keys
CREATE OR REPLACE FUNCTION expire_api_keys()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NOT NULL AND NEW.expires_at <= NOW() AND NEW.status = 'active' THEN
    NEW.status = 'revoked';
    NEW.revoked_reason = 'Expired';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_expire_api_keys
  BEFORE UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION expire_api_keys();

-- ========================================
-- Helper Functions
-- ========================================

-- Get active API key by kid
CREATE OR REPLACE FUNCTION get_api_key_by_kid(p_kid TEXT)
RETURNS TABLE (
  key_id UUID,
  app_id UUID,
  secret_hash TEXT,
  scopes TEXT[],
  environment TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT ak.id, ak.app_id, ak.secret_hash, ak.scopes, ak.environment
  FROM api_keys ak
  WHERE ak.kid = p_kid
    AND ak.status = 'active'
    AND (ak.expires_at IS NULL OR ak.expires_at > NOW())
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Check quota usage
CREATE OR REPLACE FUNCTION check_quota_usage(
  p_tenant_type TEXT,
  p_tenant_id UUID,
  p_period TEXT,
  p_current_count BIGINT
) RETURNS JSONB AS $$
DECLARE
  v_quota RECORD;
  v_usage_percent NUMERIC;
BEGIN
  SELECT * INTO v_quota
  FROM api_quotas
  WHERE tenant_type = p_tenant_type
    AND tenant_id = p_tenant_id
    AND period = p_period
    AND (effective_from IS NULL OR effective_from <= NOW())
    AND (effective_to IS NULL OR effective_to >= NOW())
  ORDER BY effective_from DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'no_quota_configured'
    );
  END IF;

  v_usage_percent = (p_current_count::NUMERIC / v_quota.requests_limit::NUMERIC) * 100;

  IF p_current_count >= v_quota.requests_limit THEN
    IF v_quota.overage_allowed THEN
      RETURN jsonb_build_object(
        'allowed', true,
        'overage', true,
        'usage_percent', v_usage_percent,
        'overage_rate', v_quota.overage_rate
      );
    ELSE
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'quota_exceeded',
        'usage_percent', v_usage_percent,
        'limit', v_quota.requests_limit
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'usage_percent', v_usage_percent,
    'remaining', v_quota.requests_limit - p_current_count
  );
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- Views
-- ========================================

-- Active apps with key counts
CREATE VIEW v_active_apps AS
SELECT
  da.id,
  da.tenant_type,
  da.tenant_id,
  da.name,
  da.environment,
  da.status,
  COUNT(ak.id) FILTER (WHERE ak.status = 'active') as active_keys,
  COUNT(ak.id) as total_keys,
  da.created_at
FROM dev_apps da
LEFT JOIN api_keys ak ON da.id = ak.app_id
WHERE da.status = 'active'
GROUP BY da.id;

-- API usage summary (last 24h)
CREATE VIEW v_api_usage_24h AS
SELECT
  app_id,
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 300) as successful_requests,
  COUNT(*) FILTER (WHERE status_code >= 400) as error_requests,
  AVG(latency_ms)::INTEGER as avg_latency_ms,
  MAX(latency_ms) as max_latency_ms,
  SUM(request_bytes) as total_bytes_in,
  SUM(response_bytes) as total_bytes_out
FROM api_request_logs
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY app_id;

COMMENT ON VIEW v_active_apps IS 'Active developer apps with key statistics';
COMMENT ON VIEW v_api_usage_24h IS 'API usage summary for last 24 hours';
