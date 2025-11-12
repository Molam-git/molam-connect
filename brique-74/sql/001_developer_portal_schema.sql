-- =====================================================
-- Brique 74 - Developer Portal Schema
-- =====================================================
-- Version: 1.0.0
-- Purpose: Developer-facing documentation, playground, SDK generation, and key management
-- Dependencies: Requires Brique 73 (webhook infrastructure)
-- =====================================================

-- =====================================================
-- 1. DEVELOPER API KEYS
-- =====================================================
-- Purpose: Self-service API key management for developers
-- Features: Scoped permissions, rate limits, expiration, environment separation

CREATE TABLE IF NOT EXISTS developer_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('merchant','agent','internal_app')),
  tenant_id UUID NOT NULL,
  created_by_user_id UUID NOT NULL, -- Molam ID user

  -- Key details
  name TEXT NOT NULL, -- Human-readable name: "Production API Key", "Test Key"
  key_prefix TEXT NOT NULL UNIQUE, -- "pk_live_" or "pk_test_" visible part
  key_hash TEXT NOT NULL UNIQUE, -- SHA256 hash of full key
  environment TEXT NOT NULL CHECK (environment IN ('test','production')),

  -- Status & lifecycle
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','expired')),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ, -- NULL = never expires
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id UUID,
  revoked_reason TEXT,
  last_used_at TIMESTAMPTZ,

  -- Permissions & scoping
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read'], -- read, write, admin, webhooks, payments, etc.
  allowed_ips INET[], -- IP whitelist (NULL = any IP)
  allowed_origins TEXT[], -- CORS origins for browser keys

  -- Rate limiting
  rate_limit_per_second INTEGER DEFAULT 10,
  rate_limit_per_hour INTEGER DEFAULT 1000,
  rate_limit_per_day INTEGER DEFAULT 10000,

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,

  -- Indexing
  UNIQUE(tenant_type, tenant_id, name, environment)
);

CREATE INDEX idx_dev_api_keys_tenant ON developer_api_keys(tenant_type, tenant_id);
CREATE INDEX idx_dev_api_keys_prefix ON developer_api_keys(key_prefix);
CREATE INDEX idx_dev_api_keys_status ON developer_api_keys(status) WHERE status = 'active';
CREATE INDEX idx_dev_api_keys_expires ON developer_api_keys(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE developer_api_keys IS 'Developer self-service API keys with scoped permissions and rate limits';
COMMENT ON COLUMN developer_api_keys.key_prefix IS 'Visible prefix: pk_live_abc123... (first 16 chars)';
COMMENT ON COLUMN developer_api_keys.key_hash IS 'SHA256 hash of full secret key for verification';
COMMENT ON COLUMN developer_api_keys.scopes IS 'Permissions: read, write, webhooks:write, payments:refund, etc.';

-- =====================================================
-- 2. DEVELOPER API LOGS
-- =====================================================
-- Purpose: Centralized logging for API requests (observability for developers)
-- Features: Request/response capture, error tracking, performance metrics

CREATE TABLE IF NOT EXISTS developer_api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Request identification
  api_key_id UUID REFERENCES developer_api_keys(id) ON DELETE SET NULL,
  request_id TEXT NOT NULL UNIQUE, -- req-xxx for tracing
  idempotency_key TEXT, -- For idempotent operations

  -- Tenant context
  tenant_type TEXT NOT NULL,
  tenant_id UUID NOT NULL,

  -- Request details
  method TEXT NOT NULL, -- GET, POST, PUT, DELETE
  path TEXT NOT NULL, -- /v1/payments/charge
  api_version TEXT DEFAULT '2025-01',
  query_params JSONB,
  request_headers JSONB, -- Sanitized (no auth headers)
  request_body JSONB, -- Sanitized (no sensitive fields)

  -- Response details
  status_code INTEGER NOT NULL,
  response_headers JSONB,
  response_body JSONB, -- Truncated if >100KB
  response_time_ms INTEGER NOT NULL,

  -- Network details
  ip_address INET NOT NULL,
  user_agent TEXT,
  origin TEXT, -- For CORS requests

  -- Error tracking
  error_code TEXT, -- molam_error_invalid_request, etc.
  error_message TEXT,
  error_type TEXT, -- validation_error, authentication_error, etc.

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
) PARTITION BY RANGE (created_at);

-- Create partitions for current and next 3 months
CREATE TABLE developer_api_logs_2025_11 PARTITION OF developer_api_logs
  FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE developer_api_logs_2025_12 PARTITION OF developer_api_logs
  FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
CREATE TABLE developer_api_logs_2026_01 PARTITION OF developer_api_logs
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE INDEX idx_dev_logs_key ON developer_api_logs(api_key_id, created_at DESC);
CREATE INDEX idx_dev_logs_tenant ON developer_api_logs(tenant_type, tenant_id, created_at DESC);
CREATE INDEX idx_dev_logs_request_id ON developer_api_logs(request_id);
CREATE INDEX idx_dev_logs_status ON developer_api_logs(status_code, created_at DESC);
CREATE INDEX idx_dev_logs_errors ON developer_api_logs(error_code, created_at DESC) WHERE error_code IS NOT NULL;

COMMENT ON TABLE developer_api_logs IS 'Centralized API request logs for developer observability';
COMMENT ON COLUMN developer_api_logs.request_id IS 'Unique request ID for distributed tracing (req-xxx)';
COMMENT ON COLUMN developer_api_logs.response_time_ms IS 'Total request duration in milliseconds';

-- =====================================================
-- 3. PLAYGROUND SESSIONS
-- =====================================================
-- Purpose: Sandbox environment for testing API calls without affecting production
-- Features: Isolated sessions, mock data, request history

CREATE TABLE IF NOT EXISTS dev_playground_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  user_id UUID NOT NULL, -- Molam ID user
  tenant_type TEXT NOT NULL,
  tenant_id UUID NOT NULL,

  -- Session details
  name TEXT NOT NULL DEFAULT 'Untitled Session',
  description TEXT,
  environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','test')),

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_activity_at TIMESTAMPTZ DEFAULT now(),

  -- Configuration
  api_version TEXT DEFAULT '2025-01',
  mock_data_enabled BOOLEAN DEFAULT true,
  auto_save BOOLEAN DEFAULT true,

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_playground_sessions_user ON dev_playground_sessions(user_id, created_at DESC);
CREATE INDEX idx_playground_sessions_tenant ON dev_playground_sessions(tenant_type, tenant_id);
CREATE INDEX idx_playground_sessions_active ON dev_playground_sessions(status, last_activity_at DESC) WHERE status = 'active';

COMMENT ON TABLE dev_playground_sessions IS 'Sandbox sessions for testing API calls in isolated environment';

-- =====================================================
-- 4. PLAYGROUND REQUESTS
-- =====================================================
-- Purpose: Store playground API request history for replay and learning

CREATE TABLE IF NOT EXISTS dev_playground_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Session reference
  session_id UUID NOT NULL REFERENCES dev_playground_sessions(id) ON DELETE CASCADE,

  -- Request details
  method TEXT NOT NULL,
  endpoint TEXT NOT NULL, -- /v1/payments/charge
  headers JSONB DEFAULT '{}'::JSONB,
  body JSONB,
  query_params JSONB,

  -- Response
  status_code INTEGER,
  response_body JSONB,
  response_time_ms INTEGER,

  -- Execution
  executed_at TIMESTAMPTZ DEFAULT now(),
  is_favorite BOOLEAN DEFAULT false,
  notes TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_playground_requests_session ON dev_playground_requests(session_id, executed_at DESC);
CREATE INDEX idx_playground_requests_favorites ON dev_playground_requests(session_id, is_favorite) WHERE is_favorite = true;

COMMENT ON TABLE dev_playground_requests IS 'History of API requests executed in playground sessions';

-- =====================================================
-- 5. DOCUMENTATION PAGES
-- =====================================================
-- Purpose: Interactive documentation with code examples and live testing
-- Features: Versioned docs, multi-language examples, embedded playground

CREATE TABLE IF NOT EXISTS dev_documentation_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content
  slug TEXT NOT NULL UNIQUE, -- webhooks-getting-started
  title TEXT NOT NULL,
  description TEXT,
  content_markdown TEXT NOT NULL,

  -- Organization
  category TEXT NOT NULL, -- api-reference, guides, webhooks, compliance
  subcategory TEXT,
  sort_order INTEGER DEFAULT 0,

  -- Versioning
  api_version TEXT DEFAULT '2025-01',
  is_deprecated BOOLEAN DEFAULT false,
  deprecation_notice TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at TIMESTAMPTZ,

  -- Code examples
  code_examples JSONB DEFAULT '[]'::JSONB, -- [{lang: 'node', code: '...'}]

  -- Interactivity
  has_live_demo BOOLEAN DEFAULT false,
  demo_config JSONB, -- Playground configuration

  -- SEO & metadata
  meta_title TEXT,
  meta_description TEXT,
  tags TEXT[],

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by_user_id UUID,
  updated_by_user_id UUID,

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_docs_pages_slug ON dev_documentation_pages(slug);
CREATE INDEX idx_docs_pages_category ON dev_documentation_pages(category, subcategory, sort_order);
CREATE INDEX idx_docs_pages_version ON dev_documentation_pages(api_version, status);
CREATE INDEX idx_docs_pages_status ON dev_documentation_pages(status) WHERE status = 'published';
CREATE INDEX idx_docs_pages_tags ON dev_documentation_pages USING GIN(tags);

COMMENT ON TABLE dev_documentation_pages IS 'Interactive documentation pages with code examples and live demos';
COMMENT ON COLUMN dev_documentation_pages.code_examples IS 'Array of code examples: [{language, code, description}]';

-- =====================================================
-- 6. SDK GENERATION METADATA
-- =====================================================
-- Purpose: Track SDK versions, downloads, and generation requests
-- Features: Multi-language support, versioning, download analytics

CREATE TABLE IF NOT EXISTS dev_sdk_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- SDK details
  language TEXT NOT NULL CHECK (language IN ('node','python','php','ruby','go','java','dotnet')),
  version TEXT NOT NULL, -- 1.2.3
  api_version TEXT NOT NULL, -- 2025-01

  -- Status
  status TEXT NOT NULL DEFAULT 'beta' CHECK (status IN ('alpha','beta','stable','deprecated')),
  released_at TIMESTAMPTZ DEFAULT now(),
  deprecated_at TIMESTAMPTZ,

  -- Artifacts
  package_name TEXT NOT NULL, -- @molam/sdk-node
  download_url TEXT NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,

  -- Documentation
  changelog TEXT,
  documentation_url TEXT,
  repository_url TEXT,

  -- Stats
  download_count INTEGER DEFAULT 0,

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,

  UNIQUE(language, version)
);

CREATE INDEX idx_sdk_versions_language ON dev_sdk_versions(language, status, released_at DESC);
CREATE INDEX idx_sdk_versions_api_version ON dev_sdk_versions(api_version);

COMMENT ON TABLE dev_sdk_versions IS 'SDK versions with download URLs and release metadata';

-- =====================================================
-- 7. SDK DOWNLOADS TRACKING
-- =====================================================
-- Purpose: Analytics for SDK usage and adoption

CREATE TABLE IF NOT EXISTS dev_sdk_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- SDK reference
  sdk_version_id UUID NOT NULL REFERENCES dev_sdk_versions(id) ON DELETE CASCADE,

  -- Download context
  tenant_type TEXT,
  tenant_id UUID,
  user_id UUID, -- Molam ID user (if authenticated)

  -- Request details
  ip_address INET NOT NULL,
  user_agent TEXT,
  referrer TEXT,

  -- Timestamp
  downloaded_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
) PARTITION BY RANGE (downloaded_at);

-- Create partitions for current and next 3 months
CREATE TABLE dev_sdk_downloads_2025_11 PARTITION OF dev_sdk_downloads
  FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE dev_sdk_downloads_2025_12 PARTITION OF dev_sdk_downloads
  FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
CREATE TABLE dev_sdk_downloads_2026_01 PARTITION OF dev_sdk_downloads
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE INDEX idx_sdk_downloads_version ON dev_sdk_downloads(sdk_version_id, downloaded_at DESC);
CREATE INDEX idx_sdk_downloads_tenant ON dev_sdk_downloads(tenant_type, tenant_id, downloaded_at DESC);

COMMENT ON TABLE dev_sdk_downloads IS 'Analytics tracking for SDK downloads';

-- =====================================================
-- 8. LIVE LOGS SUBSCRIPTIONS
-- =====================================================
-- Purpose: WebSocket subscriptions for real-time log streaming
-- Features: Filter by key, status, endpoint; support for multiple concurrent sessions

CREATE TABLE IF NOT EXISTS dev_live_log_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  user_id UUID NOT NULL,
  tenant_type TEXT NOT NULL,
  tenant_id UUID NOT NULL,

  -- Connection
  websocket_id TEXT NOT NULL UNIQUE,
  connected_at TIMESTAMPTZ DEFAULT now(),
  last_ping_at TIMESTAMPTZ DEFAULT now(),

  -- Filters
  filter_api_key_ids UUID[], -- NULL = all keys
  filter_status_codes INTEGER[], -- NULL = all statuses
  filter_methods TEXT[], -- NULL = all methods
  filter_paths TEXT[], -- NULL = all paths

  -- Status
  is_active BOOLEAN DEFAULT true,
  disconnected_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_live_logs_user ON dev_live_log_sessions(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_live_logs_websocket ON dev_live_log_sessions(websocket_id);
CREATE INDEX idx_live_logs_active ON dev_live_log_sessions(is_active, last_ping_at DESC) WHERE is_active = true;

COMMENT ON TABLE dev_live_log_sessions IS 'WebSocket sessions for real-time API log streaming';

-- =====================================================
-- 9. DEVELOPER FEEDBACK & ISSUES
-- =====================================================
-- Purpose: Collect developer feedback on docs, APIs, and SDK
-- Features: Voting, categorization, status tracking

CREATE TABLE IF NOT EXISTS dev_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Submitter
  user_id UUID, -- NULL = anonymous
  tenant_type TEXT,
  tenant_id UUID,
  email TEXT, -- For anonymous follow-up

  -- Feedback details
  type TEXT NOT NULL CHECK (type IN ('bug','feature_request','documentation','sdk','api_design','other')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('low','medium','high','critical')),

  -- Context
  page_url TEXT, -- Documentation page where submitted
  api_endpoint TEXT, -- Related API endpoint
  sdk_language TEXT, -- Related SDK
  api_version TEXT,

  -- Status & resolution
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewing','planned','in_progress','completed','wont_fix')),
  priority INTEGER DEFAULT 3, -- 1=highest, 5=lowest
  assigned_to_user_id UUID,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,

  -- Voting
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_dev_feedback_user ON dev_feedback(user_id, created_at DESC);
CREATE INDEX idx_dev_feedback_type ON dev_feedback(type, status, created_at DESC);
CREATE INDEX idx_dev_feedback_status ON dev_feedback(status, priority);
CREATE INDEX idx_dev_feedback_votes ON dev_feedback(upvotes DESC, created_at DESC);

COMMENT ON TABLE dev_feedback IS 'Developer feedback, bug reports, and feature requests';

-- =====================================================
-- 10. COMPLIANCE GUIDES & TEMPLATES
-- =====================================================
-- Purpose: Compliance documentation and downloadable templates
-- Features: Regional guides (BCEAO, PCI-DSS), audit templates

CREATE TABLE IF NOT EXISTS dev_compliance_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Guide details
  slug TEXT NOT NULL UNIQUE, -- bceao-payment-processing
  title TEXT NOT NULL,
  description TEXT,

  -- Content
  content_markdown TEXT NOT NULL,

  -- Categorization
  regulation_type TEXT NOT NULL, -- bceao, pci_dss, gdpr, sec, kyc
  region TEXT, -- WAEMU, EU, US
  industry TEXT[], -- fintech, payment_processing, banking

  -- Templates & downloads
  has_template BOOLEAN DEFAULT false,
  template_files JSONB DEFAULT '[]'::JSONB, -- [{name, url, format}]

  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at TIMESTAMPTZ,
  last_reviewed_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,

  -- Ownership
  created_by_user_id UUID,
  updated_by_user_id UUID,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_compliance_guides_slug ON dev_compliance_guides(slug);
CREATE INDEX idx_compliance_guides_regulation ON dev_compliance_guides(regulation_type, region);
CREATE INDEX idx_compliance_guides_status ON dev_compliance_guides(status) WHERE status = 'published';

COMMENT ON TABLE dev_compliance_guides IS 'Compliance guides and audit templates for regulatory requirements';

-- =====================================================
-- VIEWS & MATERIALIZED VIEWS
-- =====================================================

-- View: Active API keys with usage stats
CREATE OR REPLACE VIEW v_active_api_keys_with_stats AS
SELECT
  k.id,
  k.tenant_type,
  k.tenant_id,
  k.name,
  k.key_prefix,
  k.environment,
  k.scopes,
  k.created_at,
  k.last_used_at,
  k.rate_limit_per_second,
  COUNT(l.id) AS total_requests_24h,
  COUNT(l.id) FILTER (WHERE l.status_code >= 400) AS error_requests_24h,
  AVG(l.response_time_ms) AS avg_response_time_ms_24h,
  MAX(l.created_at) AS last_request_at
FROM developer_api_keys k
LEFT JOIN developer_api_logs l ON l.api_key_id = k.id AND l.created_at >= now() - INTERVAL '24 hours'
WHERE k.status = 'active'
GROUP BY k.id;

COMMENT ON VIEW v_active_api_keys_with_stats IS 'Active API keys with 24h usage statistics';

-- View: Popular documentation pages
CREATE OR REPLACE VIEW v_popular_documentation AS
SELECT
  d.id,
  d.slug,
  d.title,
  d.category,
  d.api_version,
  d.tags,
  COUNT(l.id) AS page_views_30d
FROM dev_documentation_pages d
LEFT JOIN developer_api_logs l ON l.metadata->>'doc_page_id' = d.id::TEXT
  AND l.created_at >= now() - INTERVAL '30 days'
WHERE d.status = 'published'
GROUP BY d.id
ORDER BY page_views_30d DESC;

COMMENT ON VIEW v_popular_documentation IS 'Most popular documentation pages by views (30 days)';

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Trigger: Update updated_at on row modification
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_dev_playground_sessions_updated_at
  BEFORE UPDATE ON dev_playground_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_dev_documentation_pages_updated_at
  BEFORE UPDATE ON dev_documentation_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_dev_feedback_updated_at
  BEFORE UPDATE ON dev_feedback
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_dev_compliance_guides_updated_at
  BEFORE UPDATE ON dev_compliance_guides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Increment SDK download count
CREATE OR REPLACE FUNCTION increment_sdk_download_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE dev_sdk_versions
  SET download_count = download_count + 1
  WHERE id = NEW.sdk_version_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_increment_sdk_downloads
  AFTER INSERT ON dev_sdk_downloads
  FOR EACH ROW EXECUTE FUNCTION increment_sdk_download_count();

-- Trigger: Auto-revoke expired keys
CREATE OR REPLACE FUNCTION auto_revoke_expired_keys()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NOT NULL AND NEW.expires_at <= now() AND NEW.status = 'active' THEN
    NEW.status = 'expired';
    NEW.revoked_at = now();
    NEW.revoked_reason = 'Automatically expired';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_revoke_expired_keys
  BEFORE UPDATE ON developer_api_keys
  FOR EACH ROW EXECUTE FUNCTION auto_revoke_expired_keys();

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function: Generate API key with prefix
CREATE OR REPLACE FUNCTION generate_api_key(env TEXT)
RETURNS TEXT AS $$
DECLARE
  prefix TEXT;
  random_part TEXT;
  full_key TEXT;
BEGIN
  -- Determine prefix based on environment
  IF env = 'production' THEN
    prefix := 'pk_live_';
  ELSIF env = 'test' THEN
    prefix := 'pk_test_';
  ELSE
    RAISE EXCEPTION 'Invalid environment: %', env;
  END IF;

  -- Generate random 32-character alphanumeric string
  random_part := encode(gen_random_bytes(24), 'base64');
  random_part := regexp_replace(random_part, '[^a-zA-Z0-9]', '', 'g');
  random_part := substring(random_part from 1 for 32);

  full_key := prefix || random_part;
  RETURN full_key;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_api_key IS 'Generate secure API key with environment-specific prefix';

-- Function: Cleanup old playground sessions
CREATE OR REPLACE FUNCTION cleanup_old_playground_sessions(days_old INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM dev_playground_sessions
  WHERE status = 'archived'
    AND updated_at < now() - (days_old || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_playground_sessions IS 'Delete archived playground sessions older than specified days';

-- Function: Get API key usage statistics
CREATE OR REPLACE FUNCTION get_api_key_stats(
  key_id UUID,
  start_date TIMESTAMPTZ DEFAULT now() - INTERVAL '30 days',
  end_date TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  total_requests BIGINT,
  successful_requests BIGINT,
  failed_requests BIGINT,
  avg_response_time_ms NUMERIC,
  p95_response_time_ms NUMERIC,
  unique_ips BIGINT,
  endpoints_used TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_requests,
    COUNT(*) FILTER (WHERE status_code < 400)::BIGINT AS successful_requests,
    COUNT(*) FILTER (WHERE status_code >= 400)::BIGINT AS failed_requests,
    ROUND(AVG(response_time_ms), 2) AS avg_response_time_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) AS p95_response_time_ms,
    COUNT(DISTINCT ip_address)::BIGINT AS unique_ips,
    ARRAY_AGG(DISTINCT path) AS endpoints_used
  FROM developer_api_logs
  WHERE api_key_id = key_id
    AND created_at >= start_date
    AND created_at <= end_date;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_api_key_stats IS 'Get comprehensive usage statistics for an API key';

-- =====================================================
-- SAMPLE DATA (for development)
-- =====================================================

-- Insert sample documentation pages
INSERT INTO dev_documentation_pages (slug, title, category, content_markdown, status, published_at, code_examples) VALUES
('getting-started', 'Getting Started with Molam API', 'guides', '# Getting Started\n\nWelcome to the Molam API...', 'published', now(), '[
  {"language": "node", "code": "const molam = require(''@molam/sdk'');\\nconst client = new molam.Client(''pk_test_xxx'');"},
  {"language": "python", "code": "import molam\\nclient = molam.Client(''pk_test_xxx'')"}
]'::JSONB),
('webhooks-overview', 'Webhooks Overview', 'webhooks', '# Webhooks\n\nLearn how to receive real-time events...', 'published', now(), '[]'::JSONB),
('api-authentication', 'Authentication', 'api-reference', '# Authentication\n\nAll API requests require authentication...', 'published', now(), '[]'::JSONB)
ON CONFLICT (slug) DO NOTHING;

-- Insert sample SDK versions
INSERT INTO dev_sdk_versions (language, version, api_version, status, package_name, download_url, checksum_sha256, size_bytes, released_at) VALUES
('node', '1.0.0', '2025-01', 'stable', '@molam/sdk-node', 'https://cdn.molam.com/sdk/node/1.0.0.tar.gz', 'abc123...', 524288, now()),
('python', '1.0.0', '2025-01', 'stable', 'molam-python', 'https://cdn.molam.com/sdk/python/1.0.0.tar.gz', 'def456...', 458752, now()),
('php', '1.0.0', '2025-01', 'beta', 'molam/sdk', 'https://cdn.molam.com/sdk/php/1.0.0.tar.gz', 'ghi789...', 393216, now())
ON CONFLICT (language, version) DO NOTHING;

-- Insert sample compliance guides
INSERT INTO dev_compliance_guides (slug, title, regulation_type, region, content_markdown, status, published_at) VALUES
('bceao-compliance', 'BCEAO Payment Processing Compliance', 'bceao', 'WAEMU', '# BCEAO Compliance Guide\n\n## Overview\nThis guide covers requirements for payment processors...', 'published', now()),
('pci-dss-webhooks', 'PCI-DSS Compliance for Webhooks', 'pci_dss', NULL, '# PCI-DSS Webhook Security\n\n## Requirements\nWebhooks handling payment data must...', 'published', now())
ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Grant permissions to application role (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO molam_app_role;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO molam_app_role;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO molam_app_role;

-- =====================================================
-- COMPLETION
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Brique 74 - Developer Portal Schema installed successfully';
  RAISE NOTICE '📊 Tables created: 10';
  RAISE NOTICE '📈 Views created: 2';
  RAISE NOTICE '⚡ Triggers created: 5';
  RAISE NOTICE '🔧 Functions created: 4';
  RAISE NOTICE '📚 Sample data inserted: Documentation pages, SDK versions, compliance guides';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 Next steps:';
  RAISE NOTICE '   1. Review and adjust permissions';
  RAISE NOTICE '   2. Configure partition maintenance for logs';
  RAISE NOTICE '   3. Set up monitoring for API key usage';
  RAISE NOTICE '   4. Implement WebSocket server for live logs';
END $$;
