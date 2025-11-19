-- =============================================================================
-- BRIQUE 140 — Developer Portal
-- Migration: Developer accounts, apps, API keys, usage tracking, quotas, audit
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. Developer Accounts
-- =============================================================================
CREATE TABLE IF NOT EXISTS dev_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,                -- Links to molam_users (Molam ID)
  company TEXT,
  email TEXT NOT NULL,
  website TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|active|suspended|revoked
  compliance_level TEXT DEFAULT 'unverified', -- unverified|basic|verified
  kyc_verified BOOLEAN DEFAULT false,
  sandbox_only BOOLEAN DEFAULT true,     -- If true, cannot create live keys
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dev_accounts_user ON dev_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_dev_accounts_email ON dev_accounts(email);
CREATE INDEX IF NOT EXISTS idx_dev_accounts_status ON dev_accounts(status);

-- =============================================================================
-- 2. Developer Applications
-- =============================================================================
CREATE TABLE IF NOT EXISTS dev_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES dev_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  website TEXT,
  redirect_uris TEXT[],                 -- For OAuth flows
  allowed_ips TEXT[],                   -- CIDR whitelist (optional security)
  scopes TEXT[],                        -- Allowed API scopes
  environment TEXT NOT NULL DEFAULT 'test', -- test|live
  status TEXT DEFAULT 'active',         -- active|suspended|archived
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dev_apps_account ON dev_apps(account_id);
CREATE INDEX IF NOT EXISTS idx_dev_apps_environment ON dev_apps(environment);

-- =============================================================================
-- 3. API Keys and OAuth Clients
-- =============================================================================
CREATE TABLE IF NOT EXISTS dev_app_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES dev_apps(id) ON DELETE CASCADE,
  key_type TEXT NOT NULL,               -- 'api_key'|'oauth_client'
  key_id TEXT NOT NULL UNIQUE,          -- Public identifier (e.g., ak_live_XXXX)
  kid INT NOT NULL,                     -- Key ID version (for rotation)
  status TEXT NOT NULL DEFAULT 'active', -- active|retiring|revoked
  name TEXT,                            -- Optional friendly name
  last_used_at TIMESTAMPTZ,
  usage_count BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID,
  revoke_reason TEXT,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_dev_app_keys_app ON dev_app_keys(app_id);
CREATE INDEX IF NOT EXISTS idx_dev_app_keys_key_id ON dev_app_keys(key_id);
CREATE INDEX IF NOT EXISTS idx_dev_app_keys_status ON dev_app_keys(status);

-- =============================================================================
-- 4. API Usage Events (Raw time-series data)
-- =============================================================================
CREATE TABLE IF NOT EXISTS api_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id TEXT NOT NULL,
  app_id UUID,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INT,
  bytes_in INT,
  bytes_out INT,
  latency_ms INT,
  country TEXT,
  ip_address INET,
  user_agent TEXT,
  error_code TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partitioning by month recommended for production (pg_partman)
CREATE INDEX IF NOT EXISTS idx_api_usage_events_key_id ON api_usage_events(key_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_events_app_id ON api_usage_events(app_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_events_occurred ON api_usage_events(occurred_at DESC);

-- =============================================================================
-- 5. API Usage Rollups (Daily aggregates)
-- =============================================================================
CREATE TABLE IF NOT EXISTS api_usage_rollups_day (
  key_id TEXT NOT NULL,
  day DATE NOT NULL,
  calls BIGINT NOT NULL DEFAULT 0,
  errors BIGINT NOT NULL DEFAULT 0,
  bytes_in BIGINT NOT NULL DEFAULT 0,
  bytes_out BIGINT NOT NULL DEFAULT 0,
  avg_latency_ms NUMERIC(10,2) DEFAULT 0,
  p95_latency_ms INT,
  p99_latency_ms INT,
  unique_ips INT DEFAULT 0,
  PRIMARY KEY (key_id, day)
);

CREATE INDEX IF NOT EXISTS idx_api_usage_rollups_day_day ON api_usage_rollups_day(day DESC);

-- =============================================================================
-- 6. Rate Limits & Quotas Configuration
-- =============================================================================
CREATE TABLE IF NOT EXISTS api_key_quotas (
  key_id TEXT PRIMARY KEY,
  burst_limit INT NOT NULL DEFAULT 600,        -- Max requests in burst window
  sustained_limit INT NOT NULL DEFAULT 100,    -- Requests per minute sustained
  daily_quota BIGINT DEFAULT 1000000,          -- Max requests per day
  monthly_quota BIGINT,                        -- Max requests per month
  overage_action TEXT DEFAULT 'block',         -- block|warn|charge
  overage_count BIGINT DEFAULT 0,
  circuit_breaker_threshold NUMERIC(5,2) DEFAULT 50.0, -- Error rate % to trip
  circuit_breaker_tripped BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 7. Webhooks Configuration (per app)
-- =============================================================================
CREATE TABLE IF NOT EXISTS dev_app_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES dev_apps(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events TEXT[],                        -- List of event types to subscribe
  secret TEXT NOT NULL,                 -- HMAC signing secret
  status TEXT DEFAULT 'active',         -- active|paused|failed
  retry_config JSONB DEFAULT '{"max_attempts":3,"backoff":"exponential"}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dev_app_webhooks_app ON dev_app_webhooks(app_id);

-- =============================================================================
-- 8. Webhook Deliveries Log
-- =============================================================================
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES dev_app_webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL,                 -- pending|sent|failed|retrying
  attempts INT DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  response_status INT,
  response_body TEXT,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status, next_retry_at);

-- =============================================================================
-- 9. Developer Portal Audit Log (Immutable)
-- =============================================================================
CREATE TABLE IF NOT EXISTS dev_portal_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor UUID,                           -- User who performed action
  action TEXT NOT NULL,                 -- app.create|key.create|key.rotate|key.revoke|secret.view
  target JSONB NOT NULL,                -- {app_id, key_id, etc.}
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dev_portal_audit_actor ON dev_portal_audit(actor, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dev_portal_audit_action ON dev_portal_audit(action);
CREATE INDEX IF NOT EXISTS idx_dev_portal_audit_created ON dev_portal_audit(created_at DESC);

-- =============================================================================
-- 10. Sandbox Test Data (for Playground)
-- =============================================================================
CREATE TABLE IF NOT EXISTS sandbox_test_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_number TEXT NOT NULL,
  brand TEXT NOT NULL,                  -- visa|mastercard|etc
  behavior TEXT NOT NULL,               -- success|decline|fraud|3ds
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed sandbox test cards
INSERT INTO sandbox_test_cards (card_number, brand, behavior, description) VALUES
  ('4242424242424242', 'visa', 'success', 'Always succeeds'),
  ('4000000000000002', 'visa', 'decline', 'Always declined'),
  ('4000000000009995', 'visa', 'fraud', 'Triggers fraud detection'),
  ('4000002500003155', 'visa', '3ds', 'Requires 3DS authentication')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 11. Billing Integration (Usage → Charges)
-- =============================================================================
CREATE TABLE IF NOT EXISTS billing_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES dev_accounts(id),
  app_id UUID REFERENCES dev_apps(id),
  charge_type TEXT NOT NULL,            -- usage|overage|subscription
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  usage_data JSONB,
  status TEXT DEFAULT 'pending',        -- pending|paid|failed
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_charges_account ON billing_charges(account_id);
CREATE INDEX IF NOT EXISTS idx_billing_charges_period ON billing_charges(period_start, period_end);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_dev_accounts_updated_at BEFORE UPDATE ON dev_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dev_apps_updated_at BEFORE UPDATE ON dev_apps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Track key last used
CREATE OR REPLACE FUNCTION update_key_last_used()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE dev_app_keys
  SET last_used_at = NEW.occurred_at,
      usage_count = usage_count + 1
  WHERE key_id = NEW.key_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER track_key_usage AFTER INSERT ON api_usage_events
  FOR EACH ROW EXECUTE FUNCTION update_key_last_used();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE dev_accounts IS 'Developer accounts linked to Molam ID users';
COMMENT ON TABLE dev_apps IS 'Applications registered by developers';
COMMENT ON TABLE dev_app_keys IS 'API keys and OAuth clients (secrets stored in Vault)';
COMMENT ON TABLE api_usage_events IS 'Raw API usage events for real-time tracking';
COMMENT ON TABLE api_usage_rollups_day IS 'Daily aggregated usage statistics';
COMMENT ON TABLE api_key_quotas IS 'Rate limits and quota configuration per key';
COMMENT ON TABLE dev_app_webhooks IS 'Webhook endpoints configuration';
COMMENT ON TABLE webhook_deliveries IS 'Webhook delivery attempts and status';
COMMENT ON TABLE dev_portal_audit IS 'Immutable audit log for all portal operations';
COMMENT ON TABLE sandbox_test_cards IS 'Test card numbers for sandbox environment';
COMMENT ON TABLE billing_charges IS 'Usage-based billing charges';

-- =============================================================================
-- VIEWS FOR ANALYTICS
-- =============================================================================

-- Real-time key usage summary
CREATE OR REPLACE VIEW v_key_usage_summary AS
SELECT
  k.key_id,
  k.app_id,
  k.status,
  k.last_used_at,
  k.usage_count,
  COALESCE(today.calls, 0) as calls_today,
  COALESCE(today.errors, 0) as errors_today,
  COALESCE(today.avg_latency_ms, 0) as avg_latency_today
FROM dev_app_keys k
LEFT JOIN api_usage_rollups_day today
  ON today.key_id = k.key_id
  AND today.day = CURRENT_DATE;

-- App health dashboard
CREATE OR REPLACE VIEW v_app_health AS
SELECT
  a.id as app_id,
  a.name,
  a.environment,
  COUNT(DISTINCT k.key_id) as key_count,
  SUM(r.calls) as total_calls_30d,
  SUM(r.errors) as total_errors_30d,
  CASE
    WHEN SUM(r.calls) > 0
    THEN ROUND((SUM(r.errors)::NUMERIC / SUM(r.calls)) * 100, 2)
    ELSE 0
  END as error_rate_30d
FROM dev_apps a
LEFT JOIN dev_app_keys k ON k.app_id = a.id
LEFT JOIN api_usage_rollups_day r
  ON r.key_id = k.key_id
  AND r.day >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY a.id, a.name, a.environment;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
