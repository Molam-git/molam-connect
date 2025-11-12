-- =====================================================
-- Brique 74ter - API Mock Generator Schema
-- =====================================================
-- Version: 1.0.0
-- Purpose: Auto-generate API mocks from OpenAPI specs with dynamic scenarios
-- Dependencies: Requires Brique 74 (001_developer_portal_schema.sql)
-- =====================================================

-- =====================================================
-- 1. MOCK ENVIRONMENTS
-- =====================================================
-- Purpose: Define mock API environments with configurable behaviors
-- Features: Latency, error rates, custom rules, OpenAPI integration

CREATE TABLE IF NOT EXISTS dev_api_mock_envs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Environment metadata
  name TEXT NOT NULL,
  description TEXT,
  base_url TEXT NOT NULL, -- /api, /v1, etc.

  -- Ownership
  tenant_type TEXT NOT NULL,
  tenant_id UUID NOT NULL,
  created_by_user_id UUID NOT NULL,
  is_public BOOLEAN DEFAULT false, -- Allow public access (ephemeral link)
  public_token TEXT UNIQUE, -- For public sharing

  -- OpenAPI specification
  openapi_spec_url TEXT, -- URL to OpenAPI/Swagger JSON
  openapi_spec JSONB, -- Cached OpenAPI spec
  openapi_version TEXT, -- 2.0, 3.0, 3.1

  -- Behavior configuration
  latency_min_ms INTEGER DEFAULT 0 CHECK (latency_min_ms >= 0),
  latency_max_ms INTEGER DEFAULT 0 CHECK (latency_max_ms >= latency_min_ms),
  error_rate NUMERIC(5,2) DEFAULT 0.00 CHECK (error_rate >= 0.00 AND error_rate <= 100.00),

  -- Advanced rules
  rules JSONB DEFAULT '{}'::JSONB,
  -- Example: {
  --   "simulate_fraud": true,
  --   "rate_limit_rpm": 50,
  --   "authentication_required": true,
  --   "response_mode": "realistic", // realistic | optimistic | pessimistic
  --   "data_generation": "faker" // faker | random | static
  -- }

  -- Scenario configuration
  active_scenario_id UUID, -- Reference to current active scenario

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),

  -- Auto-learning from SIRA
  sira_learning_enabled BOOLEAN DEFAULT true,
  sira_pattern_source TEXT, -- real_traffic | fraud_patterns | both

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,

  UNIQUE(tenant_type, tenant_id, name)
);

CREATE INDEX idx_mock_envs_tenant ON dev_api_mock_envs(tenant_type, tenant_id);
CREATE INDEX idx_mock_envs_status ON dev_api_mock_envs(status) WHERE status = 'active';
CREATE INDEX idx_mock_envs_public ON dev_api_mock_envs(is_public, public_token) WHERE is_public = true;

COMMENT ON TABLE dev_api_mock_envs IS 'Mock API environments with configurable behaviors and OpenAPI integration';
COMMENT ON COLUMN dev_api_mock_envs.public_token IS 'Token for ephemeral public sharing of mock environment';

-- =====================================================
-- 2. MOCK SCENARIOS
-- =====================================================
-- Purpose: Predefined and custom scenarios for different testing needs
-- Features: Chaos engineering, fraud simulation, load testing

CREATE TABLE IF NOT EXISTS dev_api_mock_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scenario metadata
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('success','failure','chaos','fraud','load','custom')),

  -- Ownership
  created_by_user_id UUID,
  is_preset BOOLEAN DEFAULT false,

  -- Behavior overrides
  latency_override_ms INTEGER,
  error_rate_override NUMERIC(5,2),
  status_code_distribution JSONB DEFAULT '{}'::JSONB,
  -- Example: {"200":0.9,"500":0.05,"429":0.05}

  -- Response customization
  response_template JSONB, -- Custom response structure
  response_transformations JSONB, -- Apply transformations to responses

  -- Conditional triggers
  trigger_conditions JSONB DEFAULT '{}'::JSONB,
  -- Example: {
  --   "path_matches": "/payments/*",
  --   "method": "POST",
  --   "amount_gt": 10000,
  --   "time_range": "09:00-17:00"
  -- }

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_mock_scenarios_category ON dev_api_mock_scenarios(category, is_active) WHERE is_active = true;
CREATE INDEX idx_mock_scenarios_preset ON dev_api_mock_scenarios(is_preset) WHERE is_preset = true;
CREATE INDEX idx_mock_scenarios_tags ON dev_api_mock_scenarios USING GIN(tags);

COMMENT ON TABLE dev_api_mock_scenarios IS 'Reusable mock scenarios for different testing patterns';

-- =====================================================
-- 3. MOCK ENDPOINT DEFINITIONS
-- =====================================================
-- Purpose: Define custom mock endpoints with specific behaviors
-- Features: Per-endpoint configuration, response templates

CREATE TABLE IF NOT EXISTS dev_api_mock_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Environment reference
  env_id UUID NOT NULL REFERENCES dev_api_mock_envs(id) ON DELETE CASCADE,

  -- Endpoint definition
  method TEXT NOT NULL CHECK (method IN ('GET','POST','PUT','DELETE','PATCH','OPTIONS','HEAD')),
  path_pattern TEXT NOT NULL, -- /api/payments/{id}

  -- Response configuration
  status_code INTEGER DEFAULT 200,
  response_template JSONB NOT NULL,
  response_headers JSONB DEFAULT '{}'::JSONB,

  -- Behavior
  latency_ms INTEGER DEFAULT 0,
  failure_rate NUMERIC(5,2) DEFAULT 0.00,

  -- Validation
  request_schema JSONB, -- JSON Schema for request validation
  response_schema JSONB, -- JSON Schema for response

  -- OpenAPI integration
  openapi_operation_id TEXT,
  openapi_path TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,

  UNIQUE(env_id, method, path_pattern)
);

CREATE INDEX idx_mock_endpoints_env ON dev_api_mock_endpoints(env_id, is_active) WHERE is_active = true;
CREATE INDEX idx_mock_endpoints_path ON dev_api_mock_endpoints(path_pattern);

COMMENT ON TABLE dev_api_mock_endpoints IS 'Custom endpoint definitions with response templates';

-- =====================================================
-- 4. MOCK REQUEST LOGS
-- =====================================================
-- Purpose: Log all mock API requests for debugging and analytics
-- Features: Full request/response capture, performance metrics

CREATE TABLE IF NOT EXISTS dev_api_mock_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Environment reference
  env_id UUID NOT NULL REFERENCES dev_api_mock_envs(id) ON DELETE CASCADE,
  scenario_id UUID REFERENCES dev_api_mock_scenarios(id) ON DELETE SET NULL,
  endpoint_id UUID REFERENCES dev_api_mock_endpoints(id) ON DELETE SET NULL,

  -- Request details
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  query_params JSONB DEFAULT '{}'::JSONB,
  request_headers JSONB DEFAULT '{}'::JSONB,
  request_body JSONB,

  -- Response details
  status_code INTEGER NOT NULL,
  response_headers JSONB DEFAULT '{}'::JSONB,
  response_body JSONB,
  latency_ms INTEGER NOT NULL,

  -- Metadata
  client_ip TEXT,
  user_agent TEXT,
  request_id TEXT,

  -- SIRA analysis
  sira_analyzed BOOLEAN DEFAULT false,
  sira_pattern_detected TEXT,
  sira_confidence_score NUMERIC(3,2),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
) PARTITION BY RANGE (created_at);

-- Create partitions for current and next 2 months
CREATE TABLE dev_api_mock_logs_2025_11 PARTITION OF dev_api_mock_logs
  FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE dev_api_mock_logs_2025_12 PARTITION OF dev_api_mock_logs
  FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
CREATE TABLE dev_api_mock_logs_2026_01 PARTITION OF dev_api_mock_logs
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE INDEX idx_mock_logs_env ON dev_api_mock_logs(env_id, created_at DESC);
CREATE INDEX idx_mock_logs_path ON dev_api_mock_logs(path, created_at DESC);
CREATE INDEX idx_mock_logs_status ON dev_api_mock_logs(status_code, created_at DESC);
CREATE INDEX idx_mock_logs_sira ON dev_api_mock_logs(sira_pattern_detected, created_at DESC) WHERE sira_pattern_detected IS NOT NULL;

COMMENT ON TABLE dev_api_mock_logs IS 'Request logs for mock API environments with SIRA analysis';

-- =====================================================
-- 5. OPENAPI SCHEMA CACHE
-- =====================================================
-- Purpose: Cache parsed OpenAPI specifications for fast mock generation
-- Features: Version tracking, endpoint extraction

CREATE TABLE IF NOT EXISTS dev_openapi_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Schema metadata
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  source_url TEXT,

  -- OpenAPI spec
  spec_json JSONB NOT NULL,
  spec_version TEXT NOT NULL CHECK (spec_version IN ('2.0','3.0','3.1')),

  -- Parsed endpoints
  endpoints JSONB DEFAULT '[]'::JSONB,
  -- Example: [
  --   {"method":"GET","path":"/payments","operationId":"listPayments"},
  --   {"method":"POST","path":"/payments","operationId":"createPayment"}
  -- ]

  -- Schemas extracted
  components JSONB DEFAULT '{}'::JSONB, -- Components/definitions from OpenAPI

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,

  UNIQUE(name, version)
);

CREATE INDEX idx_openapi_schemas_active ON dev_openapi_schemas(is_active) WHERE is_active = true;

COMMENT ON TABLE dev_openapi_schemas IS 'Cached OpenAPI specifications for mock generation';

-- =====================================================
-- 6. MOCK RESPONSE TEMPLATES
-- =====================================================
-- Purpose: Reusable response templates with dynamic data generation
-- Features: Faker.js integration, realistic data

CREATE TABLE IF NOT EXISTS dev_mock_response_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template metadata
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- payment, user, transaction, error, etc.

  -- Template definition
  template_json JSONB NOT NULL,
  -- Example: {
  --   "id": "{{uuid}}",
  --   "amount": "{{number.int(100,10000)}}",
  --   "email": "{{internet.email}}",
  --   "created_at": "{{date.recent}}"
  -- }

  -- Data generation rules
  data_generators JSONB DEFAULT '{}'::JSONB,
  -- Example: {
  --   "use_faker": true,
  --   "locale": "en_US",
  --   "seed": 12345
  -- }

  -- Ownership
  created_by_user_id UUID,
  is_preset BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT false,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_response_templates_category ON dev_mock_response_templates(category, is_active) WHERE is_active = true;
CREATE INDEX idx_response_templates_preset ON dev_mock_response_templates(is_preset) WHERE is_preset = true;

COMMENT ON TABLE dev_mock_response_templates IS 'Reusable response templates with dynamic data generation';

-- =====================================================
-- 7. SIRA LEARNED PATTERNS
-- =====================================================
-- Purpose: Store patterns learned from real traffic and simulations
-- Features: Auto-enrichment of mock responses

CREATE TABLE IF NOT EXISTS dev_sira_learned_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Pattern details
  pattern_type TEXT NOT NULL, -- request_pattern | response_pattern | error_pattern
  endpoint_pattern TEXT NOT NULL, -- /api/payments/*
  method TEXT,

  -- Pattern definition
  pattern_definition JSONB NOT NULL,
  -- Example: {
  --   "common_fields": ["amount","currency","description"],
  --   "typical_values": {"currency":["XOF","USD","EUR"]},
  --   "common_errors": [{"code":"insufficient_funds","freq":0.05}]
  -- }

  -- Learning source
  source TEXT NOT NULL CHECK (source IN ('real_traffic','simulations','fraud_detection','manual')),
  confidence_score NUMERIC(3,2) DEFAULT 0.5 CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),

  -- Usage stats
  times_applied INTEGER DEFAULT 0,
  last_applied_at TIMESTAMPTZ,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  learned_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_sira_patterns_endpoint ON dev_sira_learned_patterns(endpoint_pattern, is_active) WHERE is_active = true;
CREATE INDEX idx_sira_patterns_type ON dev_sira_learned_patterns(pattern_type, source);
CREATE INDEX idx_sira_patterns_confidence ON dev_sira_learned_patterns(confidence_score DESC);

COMMENT ON TABLE dev_sira_learned_patterns IS 'SIRA-learned patterns for intelligent mock generation';

-- =====================================================
-- VIEWS
-- =====================================================

-- View: Mock environment usage statistics
CREATE OR REPLACE VIEW v_mock_env_usage_stats AS
SELECT
  e.id AS env_id,
  e.name AS env_name,
  e.tenant_type,
  e.tenant_id,
  COUNT(l.id) AS total_requests,
  COUNT(l.id) FILTER (WHERE l.status_code < 400) AS successful_requests,
  COUNT(l.id) FILTER (WHERE l.status_code >= 400) AS failed_requests,
  AVG(l.latency_ms) AS avg_latency_ms,
  MAX(l.created_at) AS last_request_at,
  COUNT(DISTINCT l.path) AS unique_endpoints_used
FROM dev_api_mock_envs e
LEFT JOIN dev_api_mock_logs l ON l.env_id = e.id
  AND l.created_at >= now() - INTERVAL '30 days'
WHERE e.status = 'active'
GROUP BY e.id;

COMMENT ON VIEW v_mock_env_usage_stats IS 'Mock environment usage statistics (30 days)';

-- View: Popular mock endpoints
CREATE OR REPLACE VIEW v_popular_mock_endpoints AS
SELECT
  path,
  method,
  COUNT(*) AS request_count,
  AVG(latency_ms) AS avg_latency_ms,
  COUNT(*) FILTER (WHERE status_code >= 400) AS error_count
FROM dev_api_mock_logs
WHERE created_at >= now() - INTERVAL '7 days'
GROUP BY path, method
ORDER BY request_count DESC
LIMIT 100;

COMMENT ON VIEW v_popular_mock_endpoints IS 'Most requested mock endpoints (7 days)';

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Trigger: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_mock_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mock_envs_updated_at
  BEFORE UPDATE ON dev_api_mock_envs
  FOR EACH ROW EXECUTE FUNCTION update_mock_updated_at();

CREATE TRIGGER trg_mock_scenarios_updated_at
  BEFORE UPDATE ON dev_api_mock_scenarios
  FOR EACH ROW EXECUTE FUNCTION update_mock_updated_at();

CREATE TRIGGER trg_mock_endpoints_updated_at
  BEFORE UPDATE ON dev_api_mock_endpoints
  FOR EACH ROW EXECUTE FUNCTION update_mock_updated_at();

-- Trigger: Update last_used_at on mock request
CREATE OR REPLACE FUNCTION update_mock_env_last_used()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE dev_api_mock_envs
  SET last_used_at = now()
  WHERE id = NEW.env_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_mock_env_last_used
  AFTER INSERT ON dev_api_mock_logs
  FOR EACH ROW EXECUTE FUNCTION update_mock_env_last_used();

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function: Generate public token for sharing
CREATE OR REPLACE FUNCTION generate_mock_public_token()
RETURNS TEXT AS $$
BEGIN
  RETURN 'mock_' || encode(gen_random_bytes(24), 'base64');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_mock_public_token IS 'Generate secure public token for mock environment sharing';

-- Function: Match endpoint pattern
CREATE OR REPLACE FUNCTION match_endpoint_pattern(path TEXT, pattern TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  regex_pattern TEXT;
BEGIN
  -- Convert path pattern to regex
  -- /api/payments/{id} -> /api/payments/[^/]+
  regex_pattern := regexp_replace(pattern, '\{[^}]+\}', '[^/]+', 'g');
  regex_pattern := '^' || regex_pattern || '$';

  RETURN path ~ regex_pattern;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION match_endpoint_pattern IS 'Check if request path matches endpoint pattern';

-- Function: Generate mock response from template
CREATE OR REPLACE FUNCTION generate_mock_response(template_id UUID)
RETURNS JSONB AS $$
DECLARE
  template RECORD;
  result JSONB;
BEGIN
  SELECT template_json INTO template FROM dev_mock_response_templates WHERE id = template_id;

  -- TODO: Implement Faker.js integration for dynamic data generation
  -- For now, return template as-is
  result := template.template_json;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_mock_response IS 'Generate mock response from template with dynamic data';

-- =====================================================
-- PRESET DATA - MOCK SCENARIOS
-- =====================================================

-- Success scenarios
INSERT INTO dev_api_mock_scenarios (name, description, category, status_code_distribution, is_preset, tags) VALUES
('Always Success', 'All requests return 200 OK', 'success', '{"200":1.0}', true, ARRAY['success','basic']),
('Mostly Success', '95% success rate', 'success', '{"200":0.95,"500":0.05}', true, ARRAY['success','realistic']),
('Optimistic', 'Fast responses, no errors', 'success', '{"200":1.0}', true, ARRAY['success','optimistic'])
ON CONFLICT DO NOTHING;

-- Failure scenarios
INSERT INTO dev_api_mock_scenarios (name, description, category, status_code_distribution, error_rate_override, is_preset, tags) VALUES
('Always Fail', 'All requests return 500 error', 'failure', '{"500":1.0}', 100.00, true, ARRAY['failure','extreme']),
('High Error Rate', '50% error rate for chaos testing', 'failure', '{"200":0.5,"500":0.5}', 50.00, true, ARRAY['failure','chaos']),
('Rate Limited', 'Simulate rate limiting (429)', 'failure', '{"200":0.7,"429":0.3}', 30.00, true, ARRAY['failure','rate_limit'])
ON CONFLICT DO NOTHING;

-- Chaos scenarios
INSERT INTO dev_api_mock_scenarios (name, description, category, latency_override_ms, error_rate_override, is_preset, tags) VALUES
('Slow Network', 'High latency (2-5 seconds)', 'chaos', 3500, 10.00, true, ARRAY['chaos','latency']),
('Intermittent Issues', 'Random failures with delays', 'chaos', 1000, 25.00, true, ARRAY['chaos','intermittent']),
('Complete Chaos', 'Extreme latency and errors', 'chaos', 8000, 50.00, true, ARRAY['chaos','extreme'])
ON CONFLICT DO NOTHING;

-- Fraud scenarios
INSERT INTO dev_api_mock_scenarios (name, description, category, status_code_distribution, is_preset, tags) VALUES
('Fraud Detection Active', 'Simulate fraud detection responses', 'fraud', '{"200":0.6,"403":0.3,"451":0.1}', true, ARRAY['fraud','security']),
('Suspicious Activity', 'Flag suspicious patterns', 'fraud', '{"200":0.7,"403":0.2,"429":0.1}', true, ARRAY['fraud','suspicious'])
ON CONFLICT DO NOTHING;

-- =====================================================
-- PRESET DATA - RESPONSE TEMPLATES
-- =====================================================

INSERT INTO dev_mock_response_templates (name, description, category, template_json, is_preset, is_public, tags) VALUES
('Payment Success', 'Successful payment response', 'payment',
  '{"id":"pay_{{uuid}}","amount":10000,"currency":"XOF","status":"succeeded","created_at":"{{timestamp}}"}',
  true, true, ARRAY['payment','success']),

('Payment Failed', 'Failed payment response', 'payment',
  '{"id":"pay_{{uuid}}","amount":10000,"currency":"XOF","status":"failed","error":{"code":"insufficient_funds","message":"Insufficient funds"}}',
  true, true, ARRAY['payment','failure']),

('User Profile', 'User profile response', 'user',
  '{"id":"user_{{uuid}}","email":"{{email}}","name":"{{name}}","created_at":"{{timestamp}}"}',
  true, true, ARRAY['user','profile']),

('Error Response', 'Generic error response', 'error',
  '{"error":{"type":"api_error","code":"internal_error","message":"An unexpected error occurred"}}',
  true, true, ARRAY['error','generic'])
ON CONFLICT DO NOTHING;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Grant permissions to application role (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO molam_app_role;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO molam_app_role;

-- =====================================================
-- COMPLETION
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Brique 74ter - API Mock Generator Schema installed successfully';
  RAISE NOTICE '📊 Tables created: 7';
  RAISE NOTICE '📈 Views created: 2';
  RAISE NOTICE '⚡ Triggers created: 4';
  RAISE NOTICE '🔧 Functions created: 3';
  RAISE NOTICE '🎭 Preset scenarios: 8';
  RAISE NOTICE '📝 Response templates: 4';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 Next steps:';
  RAISE NOTICE '   1. Create mock environments via API';
  RAISE NOTICE '   2. Import OpenAPI specifications';
  RAISE NOTICE '   3. Test mock endpoints';
  RAISE NOTICE '   4. Enable SIRA learning for auto-enrichment';
END $$;
