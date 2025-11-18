-- =====================================================================
-- Brique 80: API Rate Limits & Quotas Engine
-- =====================================================================
-- Industrial-grade throttling and quota enforcement for Molam Connect
-- Features:
--   - Token bucket + sliding window rate limiting
--   - Daily/monthly quotas per API key, tenant, region
--   - Configurable tiers (Free/Starter/Business/Enterprise)
--   - Dynamic overrides by Ops
--   - SIRA integration for fraud detection
--   - Complete audit trail
-- Date: 2025-11-12
-- =====================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- 1. Rate Limit Plans (Tiers)
-- =====================================================================

CREATE TABLE IF NOT EXISTS rl_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,           -- 'free', 'starter', 'business', 'enterprise'
  display_name TEXT NOT NULL,
  description TEXT,

  -- Rate limits configuration (JSONB for flexibility)
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
    Example config structure:
    {
      "rate_per_second": 10,
      "rate_per_minute": 600,
      "rate_per_hour": 36000,
      "burst_capacity": 100,
      "daily_quota": 100000,
      "monthly_quota": 3000000,
      "concurrent_requests": 50,
      "endpoints": {
        "/payments/create": { "rate_per_second": 5 },
        "/refunds/*": { "rate_per_minute": 100 }
      },
      "features": {
        "webhooks": true,
        "priority_support": false,
        "sla": "99.5"
      }
    }
  */

  -- Pricing (optional, for billing integration)
  price_monthly DECIMAL(10,2),
  price_currency TEXT DEFAULT 'USD',

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT true,       -- Can merchants self-select this plan?
  sort_order INTEGER DEFAULT 0,

  -- Metadata
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT rl_plans_config_check CHECK (jsonb_typeof(config) = 'object')
);

CREATE INDEX idx_rl_plans_active ON rl_plans(is_active) WHERE is_active = true;
CREATE INDEX idx_rl_plans_public ON rl_plans(is_public) WHERE is_public = true;

-- Trigger for updated_at
CREATE TRIGGER rl_plans_updated_at
  BEFORE UPDATE ON rl_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE rl_plans IS 'Rate limiting plans/tiers (Free, Starter, Business, Enterprise)';
COMMENT ON COLUMN rl_plans.config IS 'JSONB configuration for rate limits, quotas, and features';

-- =====================================================================
-- 2. Rate Limit Overrides
-- =====================================================================

CREATE TYPE rl_target_type_enum AS ENUM (
  'api_key',      -- Override for specific API key
  'tenant',       -- Override for entire tenant (all keys)
  'region',       -- Override for geographic region
  'ip',           -- Override for specific IP address
  'endpoint'      -- Override for specific endpoint pattern
);

CREATE TABLE IF NOT EXISTS rl_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target
  target_type rl_target_type_enum NOT NULL,
  target_id TEXT NOT NULL,             -- api_key.key_id, tenant_id, region code, IP, endpoint pattern

  -- Override configuration
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
    Can override any aspect of the plan:
    {
      "rate_per_second": 100,
      "burst_capacity": 500,
      "daily_quota": 1000000,
      "reason": "High-value merchant",
      "temporary": true
    }
  */

  -- Temporal
  starts_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,              -- NULL = permanent

  -- Audit
  reason TEXT NOT NULL,
  created_by UUID NOT NULL,
  approved_by UUID,
  approved_at TIMESTAMPTZ,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT rl_overrides_config_check CHECK (jsonb_typeof(config) = 'object'),
  CONSTRAINT rl_overrides_expires_check CHECK (expires_at IS NULL OR expires_at > starts_at)
);

CREATE INDEX idx_rl_overrides_target ON rl_overrides(target_type, target_id) WHERE is_active = true;
CREATE INDEX idx_rl_overrides_active ON rl_overrides(is_active, expires_at) WHERE is_active = true;
CREATE INDEX idx_rl_overrides_expires ON rl_overrides(expires_at) WHERE expires_at IS NOT NULL;

-- Trigger for updated_at
CREATE TRIGGER rl_overrides_updated_at
  BEFORE UPDATE ON rl_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE rl_overrides IS 'Rate limit overrides for specific keys, tenants, regions, IPs, or endpoints';
COMMENT ON COLUMN rl_overrides.config IS 'Override configuration (partial or complete)';

-- =====================================================================
-- 3. Rate Limit Blocks (Dynamic Blocking)
-- =====================================================================

CREATE TYPE rl_block_reason_enum AS ENUM (
  'ops_manual',        -- Manual block by Ops
  'sira_fraud',        -- SIRA detected fraud
  'sira_abuse',        -- SIRA detected abuse
  'quota_exceeded',    -- Quota exceeded and auto-blocked
  'security',          -- Security incident
  'payment_failed',    -- Payment method failed
  'tos_violation',     -- Terms of Service violation
  'other'
);

CREATE TABLE IF NOT EXISTS rl_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target
  target_type rl_target_type_enum NOT NULL,
  target_id TEXT NOT NULL,

  -- Block details
  reason rl_block_reason_enum NOT NULL DEFAULT 'ops_manual',
  reason_detail TEXT,                  -- Additional context

  -- Temporal
  starts_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,              -- NULL = requires manual removal

  -- Auto-removal
  auto_remove BOOLEAN DEFAULT false,   -- Auto-remove when expires_at reached?

  -- Audit
  created_by UUID,                     -- NULL if system-generated (SIRA)
  removed_by UUID,
  removed_at TIMESTAMPTZ,
  removal_reason TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,  -- Additional context (SIRA score, incident ID, etc.)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT rl_blocks_expires_check CHECK (expires_at IS NULL OR expires_at > starts_at)
);

CREATE INDEX idx_rl_blocks_target ON rl_blocks(target_type, target_id) WHERE is_active = true;
CREATE INDEX idx_rl_blocks_active ON rl_blocks(is_active) WHERE is_active = true;
CREATE INDEX idx_rl_blocks_expires ON rl_blocks(expires_at) WHERE expires_at IS NOT NULL AND is_active = true;
CREATE INDEX idx_rl_blocks_reason ON rl_blocks(reason) WHERE is_active = true;

-- Trigger for updated_at
CREATE TRIGGER rl_blocks_updated_at
  BEFORE UPDATE ON rl_blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE rl_blocks IS 'Dynamic blocks for API keys, tenants, IPs (from SIRA or Ops)';
COMMENT ON COLUMN rl_blocks.auto_remove IS 'Automatically remove block when expires_at is reached';

-- =====================================================================
-- 4. Rate Limit Audit Logs
-- =====================================================================

CREATE TYPE rl_event_type_enum AS ENUM (
  'throttle',              -- Request throttled (429)
  'quota_exceeded',        -- Daily/monthly quota exceeded
  'quota_warning',         -- Approaching quota limit (80%, 90%)
  'override_set',          -- Override created
  'override_removed',      -- Override removed
  'block_set',             -- Block created
  'block_removed',         -- Block removed
  'plan_changed',          -- Tenant plan upgraded/downgraded
  'config_updated',        -- Plan configuration updated
  'burst_triggered',       -- Burst capacity used
  'sira_flag'              -- SIRA flagged suspicious activity
);

CREATE TABLE IF NOT EXISTS rl_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event
  event_type rl_event_type_enum NOT NULL,

  -- Actor
  actor_type TEXT,                     -- 'user', 'system', 'sira', 'ops'
  actor_id UUID,                       -- User ID or NULL for system

  -- Target
  target_type TEXT,                    -- 'api_key', 'tenant', 'ip', 'endpoint'
  target_id TEXT,                      -- Key ID, tenant ID, IP, endpoint

  -- Request context
  request_id TEXT,                     -- Correlation ID
  endpoint TEXT,                       -- API endpoint
  method TEXT,                         -- HTTP method
  ip_address INET,
  user_agent TEXT,
  region TEXT,                         -- Geographic region

  -- Rate limit context
  limit_type TEXT,                     -- 'per_second', 'per_minute', 'daily_quota', 'burst'
  limit_value INTEGER,                 -- Configured limit
  current_value INTEGER,               -- Current usage

  -- Additional data
  payload JSONB DEFAULT '{}'::jsonb,   -- Event-specific data

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Partitioning hint
  created_date DATE GENERATED ALWAYS AS (created_at::date) STORED
);

CREATE INDEX idx_rl_audit_logs_event_type ON rl_audit_logs(event_type, created_at DESC);
CREATE INDEX idx_rl_audit_logs_target ON rl_audit_logs(target_type, target_id, created_at DESC);
CREATE INDEX idx_rl_audit_logs_created_at ON rl_audit_logs(created_at DESC);
CREATE INDEX idx_rl_audit_logs_created_date ON rl_audit_logs(created_date DESC);
CREATE INDEX idx_rl_audit_logs_ip ON rl_audit_logs(ip_address) WHERE ip_address IS NOT NULL;

COMMENT ON TABLE rl_audit_logs IS 'Audit trail for all rate limiting events';
COMMENT ON COLUMN rl_audit_logs.payload IS 'Event-specific data (retry_after, remaining_quota, etc.)';

-- =====================================================================
-- 5. Rate Limit Metrics (Aggregated)
-- =====================================================================

CREATE TABLE IF NOT EXISTS rl_metrics_hourly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Time bucket
  bucket_ts TIMESTAMPTZ NOT NULL,      -- Hourly bucket

  -- Dimensions
  tenant_id UUID,
  api_key_id TEXT,
  endpoint TEXT,
  region TEXT,

  -- Metrics
  requests_total INTEGER DEFAULT 0,
  requests_throttled INTEGER DEFAULT 0,
  requests_blocked INTEGER DEFAULT 0,
  quota_exceeded_count INTEGER DEFAULT 0,

  -- Rate limit stats
  avg_tokens_remaining NUMERIC(10,2),
  min_tokens_remaining INTEGER,
  max_requests_per_second INTEGER,

  -- Aggregated at
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Unique constraint
  CONSTRAINT rl_metrics_hourly_unique UNIQUE (bucket_ts, tenant_id, api_key_id, endpoint, region)
);

CREATE INDEX idx_rl_metrics_hourly_bucket ON rl_metrics_hourly(bucket_ts DESC);
CREATE INDEX idx_rl_metrics_hourly_tenant ON rl_metrics_hourly(tenant_id, bucket_ts DESC) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_rl_metrics_hourly_key ON rl_metrics_hourly(api_key_id, bucket_ts DESC) WHERE api_key_id IS NOT NULL;

COMMENT ON TABLE rl_metrics_hourly IS 'Hourly aggregated rate limiting metrics for analytics and billing';

-- =====================================================================
-- 6. Functions
-- =====================================================================

-- Function: Get effective rate limit config for an API key
CREATE OR REPLACE FUNCTION get_effective_rate_limit_config(
  p_api_key_id TEXT,
  p_tenant_id UUID,
  p_endpoint TEXT DEFAULT NULL,
  p_ip_address INET DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_config JSONB;
  v_plan_config JSONB;
  v_override RECORD;
BEGIN
  -- Get plan config
  SELECT p.config INTO v_plan_config
  FROM rl_plans p
  JOIN tenants t ON t.rate_limit_plan_id = p.id
  WHERE t.id = p_tenant_id AND p.is_active = true
  LIMIT 1;

  IF v_plan_config IS NULL THEN
    -- Default fallback config
    v_plan_config := jsonb_build_object(
      'rate_per_second', 10,
      'burst_capacity', 50,
      'daily_quota', 10000
    );
  END IF;

  v_config := v_plan_config;

  -- Apply overrides in precedence order:
  -- 1. IP-specific override
  IF p_ip_address IS NOT NULL THEN
    SELECT config INTO v_override
    FROM rl_overrides
    WHERE target_type = 'ip'
      AND target_id = p_ip_address::text
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
      AND (starts_at IS NULL OR starts_at <= now())
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      v_config := v_config || v_override.config;
    END IF;
  END IF;

  -- 2. Endpoint-specific override
  IF p_endpoint IS NOT NULL THEN
    SELECT config INTO v_override
    FROM rl_overrides
    WHERE target_type = 'endpoint'
      AND (target_id = p_endpoint OR p_endpoint LIKE target_id)
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
      AND (starts_at IS NULL OR starts_at <= now())
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      v_config := v_config || v_override.config;
    END IF;
  END IF;

  -- 3. Tenant-specific override
  SELECT config INTO v_override
  FROM rl_overrides
  WHERE target_type = 'tenant'
    AND target_id = p_tenant_id::text
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (starts_at IS NULL OR starts_at <= now())
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_config := v_config || v_override.config;
  END IF;

  -- 4. API key-specific override (highest precedence)
  SELECT config INTO v_override
  FROM rl_overrides
  WHERE target_type = 'api_key'
    AND target_id = p_api_key_id
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (starts_at IS NULL OR starts_at <= now())
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_config := v_config || v_override.config;
  END IF;

  RETURN v_config;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_effective_rate_limit_config IS 'Calculate effective rate limit config applying all overrides in precedence order';

-- Function: Check if target is blocked
CREATE OR REPLACE FUNCTION is_rate_limit_blocked(
  p_target_type rl_target_type_enum,
  p_target_id TEXT
) RETURNS TABLE (
  is_blocked BOOLEAN,
  block_reason rl_block_reason_enum,
  block_detail TEXT,
  expires_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    true AS is_blocked,
    b.reason AS block_reason,
    b.reason_detail AS block_detail,
    b.expires_at
  FROM rl_blocks b
  WHERE b.target_type = p_target_type
    AND b.target_id = p_target_id
    AND b.is_active = true
    AND (b.expires_at IS NULL OR b.expires_at > now())
    AND (b.starts_at IS NULL OR b.starts_at <= now())
  ORDER BY b.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::rl_block_reason_enum, NULL::TEXT, NULL::TIMESTAMPTZ;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION is_rate_limit_blocked IS 'Check if a target (API key, tenant, IP) is currently blocked';

-- Function: Log rate limit event
CREATE OR REPLACE FUNCTION log_rate_limit_event(
  p_event_type rl_event_type_enum,
  p_actor_type TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_target_type TEXT DEFAULT NULL,
  p_target_id TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL,
  p_endpoint TEXT DEFAULT NULL,
  p_method TEXT DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO rl_audit_logs (
    event_type, actor_type, actor_id, target_type, target_id,
    request_id, endpoint, method, ip_address, payload
  ) VALUES (
    p_event_type, p_actor_type, p_actor_id, p_target_type, p_target_id,
    p_request_id, p_endpoint, p_method, p_ip_address, p_payload
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_rate_limit_event IS 'Log a rate limiting event to audit trail';

-- Function: Upsert hourly metrics
CREATE OR REPLACE FUNCTION upsert_rate_limit_metrics(
  p_bucket_ts TIMESTAMPTZ,
  p_tenant_id UUID DEFAULT NULL,
  p_api_key_id TEXT DEFAULT NULL,
  p_endpoint TEXT DEFAULT NULL,
  p_region TEXT DEFAULT NULL,
  p_metrics JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_metric_id UUID;
BEGIN
  INSERT INTO rl_metrics_hourly (
    bucket_ts, tenant_id, api_key_id, endpoint, region,
    requests_total, requests_throttled, requests_blocked,
    quota_exceeded_count, avg_tokens_remaining,
    min_tokens_remaining, max_requests_per_second
  ) VALUES (
    date_trunc('hour', p_bucket_ts),
    p_tenant_id,
    p_api_key_id,
    p_endpoint,
    p_region,
    COALESCE((p_metrics->>'requests_total')::INTEGER, 1),
    COALESCE((p_metrics->>'requests_throttled')::INTEGER, 0),
    COALESCE((p_metrics->>'requests_blocked')::INTEGER, 0),
    COALESCE((p_metrics->>'quota_exceeded_count')::INTEGER, 0),
    COALESCE((p_metrics->>'avg_tokens_remaining')::NUMERIC, 0),
    COALESCE((p_metrics->>'min_tokens_remaining')::INTEGER, 0),
    COALESCE((p_metrics->>'max_requests_per_second')::INTEGER, 0)
  )
  ON CONFLICT (bucket_ts, tenant_id, api_key_id, endpoint, region)
  DO UPDATE SET
    requests_total = rl_metrics_hourly.requests_total + EXCLUDED.requests_total,
    requests_throttled = rl_metrics_hourly.requests_throttled + EXCLUDED.requests_throttled,
    requests_blocked = rl_metrics_hourly.requests_blocked + EXCLUDED.requests_blocked,
    quota_exceeded_count = rl_metrics_hourly.quota_exceeded_count + EXCLUDED.quota_exceeded_count,
    avg_tokens_remaining = (rl_metrics_hourly.avg_tokens_remaining + EXCLUDED.avg_tokens_remaining) / 2,
    min_tokens_remaining = LEAST(rl_metrics_hourly.min_tokens_remaining, EXCLUDED.min_tokens_remaining),
    max_requests_per_second = GREATEST(rl_metrics_hourly.max_requests_per_second, EXCLUDED.max_requests_per_second),
    updated_at = now()
  RETURNING id INTO v_metric_id;

  RETURN v_metric_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION upsert_rate_limit_metrics IS 'Upsert hourly rate limit metrics for analytics';

-- Function: Auto-expire blocks
CREATE OR REPLACE FUNCTION auto_expire_rate_limit_blocks() RETURNS INTEGER AS $$
DECLARE
  v_expired_count INTEGER;
BEGIN
  UPDATE rl_blocks
  SET
    is_active = false,
    removed_at = now(),
    removed_by = NULL,
    removal_reason = 'Auto-expired',
    updated_at = now()
  WHERE is_active = true
    AND auto_remove = true
    AND expires_at IS NOT NULL
    AND expires_at <= now();

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;

  RETURN v_expired_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_expire_rate_limit_blocks IS 'Automatically expire and remove blocks that have reached their expiry time';

-- =====================================================================
-- 7. Triggers
-- =====================================================================

-- Trigger: Log override changes
CREATE OR REPLACE FUNCTION rl_overrides_audit_trigger() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_rate_limit_event(
      'override_set',
      'ops',
      NEW.created_by,
      NEW.target_type::text,
      NEW.target_id,
      NULL,
      NULL,
      NULL,
      NULL,
      jsonb_build_object('override_id', NEW.id, 'config', NEW.config, 'reason', NEW.reason)
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = false THEN
    PERFORM log_rate_limit_event(
      'override_removed',
      'ops',
      NEW.created_by,
      NEW.target_type::text,
      NEW.target_id,
      NULL,
      NULL,
      NULL,
      NULL,
      jsonb_build_object('override_id', NEW.id, 'reason', 'Deactivated')
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rl_overrides_audit
  AFTER INSERT OR UPDATE ON rl_overrides
  FOR EACH ROW
  EXECUTE FUNCTION rl_overrides_audit_trigger();

-- Trigger: Log block changes
CREATE OR REPLACE FUNCTION rl_blocks_audit_trigger() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_rate_limit_event(
      'block_set',
      CASE WHEN NEW.created_by IS NULL THEN 'system' ELSE 'ops' END,
      NEW.created_by,
      NEW.target_type::text,
      NEW.target_id,
      NULL,
      NULL,
      NULL,
      NULL,
      jsonb_build_object('block_id', NEW.id, 'reason', NEW.reason, 'expires_at', NEW.expires_at)
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = false THEN
    PERFORM log_rate_limit_event(
      'block_removed',
      CASE WHEN NEW.removed_by IS NULL THEN 'system' ELSE 'ops' END,
      NEW.removed_by,
      NEW.target_type::text,
      NEW.target_id,
      NULL,
      NULL,
      NULL,
      NULL,
      jsonb_build_object('block_id', NEW.id, 'removal_reason', NEW.removal_reason)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rl_blocks_audit
  AFTER INSERT OR UPDATE ON rl_blocks
  FOR EACH ROW
  EXECUTE FUNCTION rl_blocks_audit_trigger();

-- =====================================================================
-- 8. Views
-- =====================================================================

-- View: Active rate limit plans
CREATE OR REPLACE VIEW v_rl_plans_active AS
SELECT
  p.id,
  p.name,
  p.display_name,
  p.description,
  p.config,
  p.price_monthly,
  p.price_currency,
  p.is_public,
  p.sort_order,
  COUNT(t.id) AS tenant_count,
  p.created_at,
  p.updated_at
FROM rl_plans p
LEFT JOIN tenants t ON t.rate_limit_plan_id = p.id
WHERE p.is_active = true
GROUP BY p.id
ORDER BY p.sort_order, p.name;

COMMENT ON VIEW v_rl_plans_active IS 'Active rate limit plans with tenant counts';

-- View: Active blocks
CREATE OR REPLACE VIEW v_rl_blocks_active AS
SELECT
  b.id,
  b.target_type,
  b.target_id,
  b.reason,
  b.reason_detail,
  b.starts_at,
  b.expires_at,
  CASE
    WHEN b.expires_at IS NULL THEN 'permanent'
    WHEN b.expires_at > now() THEN 'active'
    ELSE 'expired'
  END AS status,
  EXTRACT(EPOCH FROM (b.expires_at - now())) / 3600 AS hours_remaining,
  b.created_by,
  b.created_at,
  b.metadata
FROM rl_blocks b
WHERE b.is_active = true
  AND (b.expires_at IS NULL OR b.expires_at > now())
  AND (b.starts_at IS NULL OR b.starts_at <= now())
ORDER BY b.created_at DESC;

COMMENT ON VIEW v_rl_blocks_active IS 'Currently active rate limit blocks';

-- View: Recent throttling events
CREATE OR REPLACE VIEW v_rl_recent_throttles AS
SELECT
  a.id,
  a.event_type,
  a.target_type,
  a.target_id,
  a.endpoint,
  a.method,
  a.ip_address,
  a.region,
  a.limit_type,
  a.limit_value,
  a.current_value,
  (a.payload->>'retry_after')::INTEGER AS retry_after_seconds,
  a.created_at
FROM rl_audit_logs a
WHERE a.event_type IN ('throttle', 'quota_exceeded', 'burst_triggered')
  AND a.created_at > now() - INTERVAL '24 hours'
ORDER BY a.created_at DESC
LIMIT 1000;

COMMENT ON VIEW v_rl_recent_throttles IS 'Recent throttling events (last 24 hours)';

-- =====================================================================
-- 9. Seed Data (Default Plans)
-- =====================================================================

-- Free plan
INSERT INTO rl_plans (name, display_name, description, config, price_monthly, is_public, sort_order)
VALUES (
  'free',
  'Free',
  'Basic rate limits for testing and development',
  '{
    "rate_per_second": 5,
    "rate_per_minute": 300,
    "rate_per_hour": 18000,
    "burst_capacity": 10,
    "daily_quota": 10000,
    "monthly_quota": 300000,
    "concurrent_requests": 10,
    "features": {
      "webhooks": false,
      "priority_support": false,
      "sla": "99.0"
    }
  }'::jsonb,
  0.00,
  true,
  1
) ON CONFLICT (name) DO NOTHING;

-- Starter plan
INSERT INTO rl_plans (name, display_name, description, config, price_monthly, is_public, sort_order)
VALUES (
  'starter',
  'Starter',
  'Increased limits for growing businesses',
  '{
    "rate_per_second": 20,
    "rate_per_minute": 1200,
    "rate_per_hour": 72000,
    "burst_capacity": 50,
    "daily_quota": 100000,
    "monthly_quota": 3000000,
    "concurrent_requests": 50,
    "features": {
      "webhooks": true,
      "priority_support": false,
      "sla": "99.5"
    }
  }'::jsonb,
  49.00,
  true,
  2
) ON CONFLICT (name) DO NOTHING;

-- Business plan
INSERT INTO rl_plans (name, display_name, description, config, price_monthly, is_public, sort_order)
VALUES (
  'business',
  'Business',
  'High limits for established businesses',
  '{
    "rate_per_second": 100,
    "rate_per_minute": 6000,
    "rate_per_hour": 360000,
    "burst_capacity": 200,
    "daily_quota": 1000000,
    "monthly_quota": 30000000,
    "concurrent_requests": 200,
    "features": {
      "webhooks": true,
      "priority_support": true,
      "sla": "99.9"
    }
  }'::jsonb,
  249.00,
  true,
  3
) ON CONFLICT (name) DO NOTHING;

-- Enterprise plan
INSERT INTO rl_plans (name, display_name, description, config, price_monthly, is_public, sort_order)
VALUES (
  'enterprise',
  'Enterprise',
  'Custom limits and dedicated support',
  '{
    "rate_per_second": 500,
    "rate_per_minute": 30000,
    "rate_per_hour": 1800000,
    "burst_capacity": 1000,
    "daily_quota": 10000000,
    "monthly_quota": 300000000,
    "concurrent_requests": 1000,
    "features": {
      "webhooks": true,
      "priority_support": true,
      "dedicated_support": true,
      "sla": "99.99"
    }
  }'::jsonb,
  999.00,
  false,
  4
) ON CONFLICT (name) DO NOTHING;

-- =====================================================================
-- 10. Permissions
-- =====================================================================

-- Grant permissions (adjust based on your RBAC setup)
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_role;
-- GRANT SELECT, INSERT, UPDATE ON rl_audit_logs TO api_service_role;
-- GRANT ALL ON rl_plans, rl_overrides, rl_blocks TO ops_role;

-- =====================================================================
-- Indexes for Performance
-- =====================================================================

-- Additional composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_rl_audit_logs_composite ON rl_audit_logs(target_type, target_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rl_overrides_composite ON rl_overrides(target_type, target_id, is_active, expires_at) WHERE is_active = true;

-- =====================================================================
-- END OF SCHEMA
-- =====================================================================

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Brique 80 - Rate Limits & Quotas Engine schema created successfully';
  RAISE NOTICE '   Tables: rl_plans, rl_overrides, rl_blocks, rl_audit_logs, rl_metrics_hourly';
  RAISE NOTICE '   Functions: get_effective_rate_limit_config, is_rate_limit_blocked, log_rate_limit_event';
  RAISE NOTICE '   Views: v_rl_plans_active, v_rl_blocks_active, v_rl_recent_throttles';
  RAISE NOTICE '   Seed data: 4 default plans (free, starter, business, enterprise)';
END $$;
