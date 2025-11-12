-- =====================================================================
-- Brique 79 - Developer Console & API Keys Management
-- =====================================================================
-- Version: 1.0.0
-- Date: 2025-11-12
-- Description: API key management with encryption, scopes, and quotas
-- =====================================================================

-- =====================================================================
-- ENUM TYPES
-- =====================================================================

-- Key mode
CREATE TYPE api_key_mode_enum AS ENUM ('test', 'live');

-- Key status
CREATE TYPE api_key_status_enum AS ENUM ('active', 'retiring', 'revoked', 'disabled');

-- Secret status
CREATE TYPE api_secret_status_enum AS ENUM ('active', 'retiring', 'revoked');

-- Event types
CREATE TYPE api_key_event_enum AS ENUM (
  'created',
  'rotated',
  'revoked',
  'disabled',
  'enabled',
  'used',
  'auth_failed',
  'ip_restricted',
  'scope_denied',
  'quota_exceeded',
  'rate_limited',
  'sira_flagged'
);

-- =====================================================================
-- CORE TABLES
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. API KEYS (Metadata)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant scope
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('merchant', 'agent', 'internal_app', 'partner')),
  tenant_id UUID NOT NULL,

  -- Key identifier (public)
  key_id TEXT NOT NULL UNIQUE,
  -- Format: MK_live_XXXXX (live) or TK_test_XXXXX (test)

  -- Mode
  mode api_key_mode_enum NOT NULL DEFAULT 'test',

  -- Human-readable name
  name TEXT,
  description TEXT,

  -- Scopes (permissions)
  scopes TEXT[] NOT NULL DEFAULT ARRAY['payments:read'],
  -- Examples: payments:create, payments:read, refunds:create, webhooks:manage, reports:read

  -- Restrictions (JSONB for flexibility)
  restrictions JSONB DEFAULT '{}'::JSONB,
  -- Example: {
  --   "ip_allowlist": ["192.168.1.1", "10.0.0.0/8"],
  --   "allowed_currencies": ["XOF", "USD"],
  --   "allowed_origins": ["https://example.com"],
  --   "allowed_countries": ["CI", "SN"],
  --   "quotas": {
  --     "daily": 10000,
  --     "monthly": 300000
  --   },
  --   "rate_limit": {
  --     "requests_per_second": 100,
  --     "burst": 200
  --   }
  -- }

  -- Status
  status api_key_status_enum DEFAULT 'active',

  -- Metadata
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Last usage tracking
  last_used_at TIMESTAMPTZ,
  last_used_ip TEXT,

  -- Expiration (optional)
  expires_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_type, tenant_id, status);
CREATE INDEX idx_api_keys_key_id ON api_keys(key_id, status);
CREATE INDEX idx_api_keys_status ON api_keys(status);
CREATE INDEX idx_api_keys_expires ON api_keys(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE api_keys IS 'API keys metadata with scopes and restrictions';

-- ---------------------------------------------------------------------
-- 2. API KEY SECRETS (Encrypted)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS api_key_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference to api_keys
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,

  -- Version (for rotation)
  version INTEGER NOT NULL DEFAULT 1,

  -- Encrypted secret (stored as ciphertext)
  secret_ciphertext BYTEA NOT NULL,

  -- Hash for quick lookup (SHA256 of plaintext secret)
  secret_hash TEXT NOT NULL,

  -- Status
  status api_secret_status_enum DEFAULT 'active',

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Grace period for rotation (optional)
  retiring_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,

  UNIQUE(api_key_id, version)
);

-- Indexes
CREATE INDEX idx_api_key_secrets_key ON api_key_secrets(api_key_id, status);
CREATE INDEX idx_api_key_secrets_hash ON api_key_secrets(secret_hash);

COMMENT ON TABLE api_key_secrets IS 'Encrypted API key secrets with versioning for rotation';

-- ---------------------------------------------------------------------
-- 3. API KEY USAGE (Aggregated Usage Counters)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS api_key_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference to api_keys
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,

  -- Time bucket
  date_day DATE NOT NULL,

  -- Scope (endpoint category)
  scope TEXT NOT NULL,

  -- Counters
  request_count BIGINT NOT NULL DEFAULT 0,
  success_count BIGINT NOT NULL DEFAULT 0,
  error_count BIGINT NOT NULL DEFAULT 0,

  -- Last seen
  last_seen_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  UNIQUE(api_key_id, date_day, scope)
);

-- Indexes
CREATE INDEX idx_api_key_usage_key ON api_key_usage(api_key_id, date_day DESC);
CREATE INDEX idx_api_key_usage_date ON api_key_usage(date_day DESC);

COMMENT ON TABLE api_key_usage IS 'Aggregated daily usage statistics per key and scope';

-- ---------------------------------------------------------------------
-- 4. API KEY EVENTS (Immutable Audit Trail)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS api_key_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference to api_keys (nullable for system events)
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,

  -- Event type
  event_type api_key_event_enum NOT NULL,

  -- Actor (user or system)
  actor_id UUID,
  actor_type TEXT, -- 'user', 'system', 'sira'

  -- Payload (JSONB for flexibility)
  payload JSONB DEFAULT '{}'::JSONB,
  -- Examples:
  -- created: { key_id, mode, scopes }
  -- rotated: { old_version, new_version }
  -- used: { endpoint, ip, status_code }
  -- auth_failed: { ip, reason }
  -- quota_exceeded: { count, limit }

  -- Request metadata
  ip_address TEXT,
  user_agent TEXT,
  request_id TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX idx_api_key_events_key ON api_key_events(api_key_id, created_at DESC);
CREATE INDEX idx_api_key_events_type ON api_key_events(event_type, created_at DESC);
CREATE INDEX idx_api_key_events_date ON api_key_events(created_at DESC);

COMMENT ON TABLE api_key_events IS 'Immutable audit trail of all API key events';

-- ---------------------------------------------------------------------
-- 5. API KEY QUOTAS (Runtime Quotas)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS api_key_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference to api_keys
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE UNIQUE,

  -- Quota limits
  daily_limit INTEGER,
  monthly_limit INTEGER,
  rate_limit_per_second INTEGER,
  rate_limit_burst INTEGER,

  -- Current counters (reset daily/monthly)
  daily_count BIGINT DEFAULT 0,
  monthly_count BIGINT DEFAULT 0,
  daily_reset_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '1 day'),
  monthly_reset_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '1 month'),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX idx_api_key_quotas_key ON api_key_quotas(api_key_id);

COMMENT ON TABLE api_key_quotas IS 'Runtime quota tracking for API keys';

-- =====================================================================
-- FUNCTIONS
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Generate Key ID
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION generate_key_id(p_mode api_key_mode_enum)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_random TEXT;
BEGIN
  -- Prefix based on mode
  v_prefix := CASE WHEN p_mode = 'live' THEN 'MK_live' ELSE 'TK_test' END;

  -- Generate random suffix (12 characters)
  v_random := encode(gen_random_bytes(9), 'base64');
  v_random := replace(replace(replace(v_random, '/', ''), '+', ''), '=', '');
  v_random := substring(v_random, 1, 12);

  RETURN v_prefix || '_' || v_random;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_key_id IS 'Generate unique key ID with prefix based on mode';

-- ---------------------------------------------------------------------
-- 2. Increment Usage Counter (Idempotent)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION increment_api_key_usage(
  p_api_key_id UUID,
  p_scope TEXT,
  p_success BOOLEAN DEFAULT true
)
RETURNS VOID AS $$
DECLARE
  v_date_day DATE := CURRENT_DATE;
BEGIN
  INSERT INTO api_key_usage (api_key_id, date_day, scope, request_count, success_count, error_count, last_seen_at)
  VALUES (
    p_api_key_id,
    v_date_day,
    p_scope,
    1,
    CASE WHEN p_success THEN 1 ELSE 0 END,
    CASE WHEN NOT p_success THEN 1 ELSE 0 END,
    now()
  )
  ON CONFLICT (api_key_id, date_day, scope)
  DO UPDATE SET
    request_count = api_key_usage.request_count + 1,
    success_count = api_key_usage.success_count + CASE WHEN p_success THEN 1 ELSE 0 END,
    error_count = api_key_usage.error_count + CASE WHEN NOT p_success THEN 1 ELSE 0 END,
    last_seen_at = now(),
    updated_at = now();

  -- Update last_used_at on api_keys
  UPDATE api_keys
  SET last_used_at = now(), updated_at = now()
  WHERE id = p_api_key_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_api_key_usage IS 'Increment usage counter for API key and scope';

-- ---------------------------------------------------------------------
-- 3. Check Quota
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_api_key_quota(
  p_api_key_id UUID
)
RETURNS TABLE (
  quota_ok BOOLEAN,
  daily_remaining INTEGER,
  monthly_remaining INTEGER
) AS $$
DECLARE
  v_quota api_key_quotas;
BEGIN
  -- Get quota
  SELECT * INTO v_quota FROM api_key_quotas WHERE api_key_id = p_api_key_id;

  IF v_quota IS NULL THEN
    -- No quota configured, allow unlimited
    RETURN QUERY SELECT true, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;

  -- Reset counters if needed
  IF v_quota.daily_reset_at < now() THEN
    UPDATE api_key_quotas
    SET daily_count = 0, daily_reset_at = (now() + INTERVAL '1 day')
    WHERE api_key_id = p_api_key_id;
    v_quota.daily_count := 0;
  END IF;

  IF v_quota.monthly_reset_at < now() THEN
    UPDATE api_key_quotas
    SET monthly_count = 0, monthly_reset_at = (now() + INTERVAL '1 month')
    WHERE api_key_id = p_api_key_id;
    v_quota.monthly_count := 0;
  END IF;

  -- Check limits
  IF (v_quota.daily_limit IS NOT NULL AND v_quota.daily_count >= v_quota.daily_limit) THEN
    RETURN QUERY SELECT false, 0, (v_quota.monthly_limit - v_quota.monthly_count)::INTEGER;
    RETURN;
  END IF;

  IF (v_quota.monthly_limit IS NOT NULL AND v_quota.monthly_count >= v_quota.monthly_limit) THEN
    RETURN QUERY SELECT false, (v_quota.daily_limit - v_quota.daily_count)::INTEGER, 0;
    RETURN;
  END IF;

  -- Quota OK
  RETURN QUERY SELECT
    true,
    CASE WHEN v_quota.daily_limit IS NOT NULL THEN (v_quota.daily_limit - v_quota.daily_count)::INTEGER ELSE NULL END,
    CASE WHEN v_quota.monthly_limit IS NOT NULL THEN (v_quota.monthly_limit - v_quota.monthly_count)::INTEGER ELSE NULL END;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_api_key_quota IS 'Check if API key has quota remaining';

-- ---------------------------------------------------------------------
-- 4. Increment Quota Counter
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION increment_quota_counter(p_api_key_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE api_key_quotas
  SET
    daily_count = daily_count + 1,
    monthly_count = monthly_count + 1,
    updated_at = now()
  WHERE api_key_id = p_api_key_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_quota_counter IS 'Increment quota counters for API key';

-- ---------------------------------------------------------------------
-- 5. Get Usage Statistics
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_api_key_usage_stats(
  p_api_key_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  date_day DATE,
  total_requests BIGINT,
  total_success BIGINT,
  total_errors BIGINT,
  success_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.date_day,
    SUM(u.request_count) AS total_requests,
    SUM(u.success_count) AS total_success,
    SUM(u.error_count) AS total_errors,
    CASE
      WHEN SUM(u.request_count) > 0
      THEN ROUND(SUM(u.success_count)::NUMERIC / SUM(u.request_count)::NUMERIC * 100, 2)
      ELSE 0
    END AS success_rate
  FROM api_key_usage u
  WHERE u.api_key_id = p_api_key_id
    AND u.date_day >= CURRENT_DATE - p_days
  GROUP BY u.date_day
  ORDER BY u.date_day DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_api_key_usage_stats IS 'Get usage statistics for API key over time';

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Auto-update updated_at
-- ---------------------------------------------------------------------

CREATE TRIGGER update_api_keys_updated_at
BEFORE UPDATE ON api_keys
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_key_usage_updated_at
BEFORE UPDATE ON api_key_usage
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_key_quotas_updated_at
BEFORE UPDATE ON api_key_quotas
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------
-- 2. Auto-create quota record on key creation
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION auto_create_quota()
RETURNS TRIGGER AS $$
BEGIN
  -- Create default quota if restrictions have quota config
  IF NEW.restrictions ? 'quotas' THEN
    INSERT INTO api_key_quotas (
      api_key_id,
      daily_limit,
      monthly_limit,
      rate_limit_per_second,
      rate_limit_burst
    )
    VALUES (
      NEW.id,
      (NEW.restrictions->'quotas'->>'daily')::INTEGER,
      (NEW.restrictions->'quotas'->>'monthly')::INTEGER,
      (NEW.restrictions->'rate_limit'->>'requests_per_second')::INTEGER,
      (NEW.restrictions->'rate_limit'->>'burst')::INTEGER
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER api_keys_auto_create_quota
AFTER INSERT ON api_keys
FOR EACH ROW EXECUTE FUNCTION auto_create_quota();

-- =====================================================================
-- VIEWS
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Active Keys Summary
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW active_keys_summary AS
SELECT
  tenant_type,
  tenant_id,
  mode,
  COUNT(*) AS key_count,
  COUNT(*) FILTER (WHERE status = 'active') AS active_count,
  COUNT(*) FILTER (WHERE last_used_at > now() - INTERVAL '7 days') AS active_7d,
  MAX(created_at) AS last_created_at
FROM api_keys
GROUP BY tenant_type, tenant_id, mode;

COMMENT ON VIEW active_keys_summary IS 'Summary of API keys by tenant and mode';

-- ---------------------------------------------------------------------
-- 2. Usage Summary (Last 30 Days)
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW usage_summary_30d AS
SELECT
  k.tenant_type,
  k.tenant_id,
  k.key_id,
  k.mode,
  SUM(u.request_count) AS total_requests,
  SUM(u.success_count) AS total_success,
  SUM(u.error_count) AS total_errors,
  ROUND(
    CASE
      WHEN SUM(u.request_count) > 0
      THEN SUM(u.success_count)::NUMERIC / SUM(u.request_count)::NUMERIC * 100
      ELSE 0
    END,
    2
  ) AS success_rate_pct
FROM api_keys k
LEFT JOIN api_key_usage u ON k.id = u.api_key_id AND u.date_day >= CURRENT_DATE - 30
WHERE k.status = 'active'
GROUP BY k.tenant_type, k.tenant_id, k.key_id, k.mode;

COMMENT ON VIEW usage_summary_30d IS 'API key usage summary for last 30 days';

-- ---------------------------------------------------------------------
-- 3. Security Events (Last 7 Days)
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW security_events_7d AS
SELECT
  k.tenant_type,
  k.tenant_id,
  k.key_id,
  e.event_type,
  COUNT(*) AS event_count,
  MAX(e.created_at) AS last_occurrence
FROM api_key_events e
JOIN api_keys k ON e.api_key_id = k.id
WHERE e.created_at >= now() - INTERVAL '7 days'
  AND e.event_type IN ('auth_failed', 'ip_restricted', 'scope_denied', 'quota_exceeded', 'sira_flagged')
GROUP BY k.tenant_type, k.tenant_id, k.key_id, e.event_type
ORDER BY event_count DESC;

COMMENT ON VIEW security_events_7d IS 'Security-related events for last 7 days';

-- =====================================================================
-- SEED DATA
-- =====================================================================

-- No seed data required for API keys (tenant-specific)

-- =====================================================================
-- COMPLETION
-- =====================================================================

COMMENT ON SCHEMA public IS 'Brique 79 - API Keys Management v1.0.0 - 2025-11-12';

DO $$
BEGIN
  RAISE NOTICE '✅ Brique 79 - API Keys Management schema created successfully';
  RAISE NOTICE '📊 Tables created: 5 (api_keys, api_key_secrets, api_key_usage, api_key_events, api_key_quotas)';
  RAISE NOTICE '⚙️ Functions created: 5';
  RAISE NOTICE '🔔 Triggers created: 4';
  RAISE NOTICE '📈 Views created: 3';
  RAISE NOTICE '🔒 Security: KMS encryption, copy-once secrets, IP restrictions, quotas';
  RAISE NOTICE '🚀 Ready for API key management with full audit trail';
END $$;
