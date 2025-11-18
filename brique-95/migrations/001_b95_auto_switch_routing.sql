-- =====================================================
-- Brique 95 - Auto-switch Routing
-- Intelligent payment rail selection system
-- =====================================================

-- 1) routing_rules: Operator-editable rules for routing decisions
-- Scoped by country, currency, merchant; prioritized execution
CREATE TABLE IF NOT EXISTS routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope definition (JSON for flexibility)
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example: {"country": "SN", "currency": "XOF", "merchant_id": "uuid"}

  -- Priority (lower number = higher priority)
  priority INTEGER NOT NULL,

  -- Rule type
  rule_type TEXT NOT NULL,
  -- Types: 'prefer_wallet', 'prefer_connect', 'cost_threshold', 'force_connect',
  --        'force_wallet', 'hybrid_threshold', 'time_based', 'amount_based'

  -- Rule parameters (JSON for flexibility)
  params JSONB DEFAULT '{}'::jsonb,
  -- Examples:
  --   cost_threshold: {"threshold_pct": 0.02, "max_amount": 50000}
  --   amount_based: {"min_amount": 100, "max_amount": 500000, "preferred_route": "wallet"}
  --   time_based: {"start_hour": 8, "end_hour": 20, "preferred_route": "connect"}

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Audit fields
  created_by UUID,
  created_by_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Description for operators
  description TEXT,

  CONSTRAINT routing_rules_priority_check CHECK (priority >= 0),
  CONSTRAINT routing_rules_rule_type_check CHECK (
    rule_type IN (
      'prefer_wallet', 'prefer_connect', 'cost_threshold',
      'force_connect', 'force_wallet', 'hybrid_threshold',
      'time_based', 'amount_based', 'merchant_override'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_routing_rules_active_priority
  ON routing_rules(is_active, priority)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_routing_rules_scope
  ON routing_rules USING gin(scope);

COMMENT ON TABLE routing_rules IS 'Operator-editable rules for routing decisions, prioritized and scoped';
COMMENT ON COLUMN routing_rules.scope IS 'JSON scope filter: country, currency, merchant_id, etc.';
COMMENT ON COLUMN routing_rules.priority IS 'Lower number = higher priority in rule evaluation';

-- 2) routing_decisions: Immutable audit trail of all routing decisions
CREATE TABLE IF NOT EXISTS routing_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Idempotency
  idempotency_key TEXT,

  -- Payment context
  payment_id TEXT,
  merchant_id UUID,
  user_id UUID,

  -- Transaction details
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  country TEXT NOT NULL,

  -- Decision output
  decision JSONB NOT NULL,
  -- Structure:
  -- {
  --   "route": "wallet|connect|hybrid",
  --   "reason": "rule_prefer_wallet|sira_hint|cost_based|...",
  --   "costs": {
  --     "wallet": {"molam_fee": 1.25, "partner_fee": 0, "total": 1.25},
  --     "connect": {"molam_fee": 2.50, "partner_fee": 0.25, "total": 2.75}
  --   },
  --   "selected_rule_id": "uuid",
  --   "fallback_routes": ["connect", "hybrid"],
  --   "reserve_ref": "hold_123",
  --   "expires_at": "2025-06-01T12:34:56Z"
  -- }

  -- SIRA snapshot
  sira_snapshot JSONB,
  -- {
  --   "score": 0.12,
  --   "routing_hint": "prefer_wallet",
  --   "reasons": ["low_fraud_risk", "low_cost", "high_success_rate"],
  --   "confidence": 0.87,
  --   "model_version": "v2.3"
  -- }

  -- Execution tracking
  executed BOOLEAN DEFAULT false,
  execution_status TEXT, -- 'pending', 'success', 'failed', 'fallback_used'
  executed_at TIMESTAMPTZ,

  -- Latency tracking
  decision_latency_ms INTEGER,
  sira_latency_ms INTEGER,

  -- Metadata
  payment_method_hint TEXT, -- 'card', 'wallet', 'bank', 'any'
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT routing_decisions_amount_check CHECK (amount > 0),
  CONSTRAINT routing_decisions_execution_status_check CHECK (
    execution_status IS NULL OR
    execution_status IN ('pending', 'success', 'failed', 'fallback_used')
  )
);

CREATE INDEX IF NOT EXISTS idx_routing_decisions_payment
  ON routing_decisions(payment_id);

CREATE INDEX IF NOT EXISTS idx_routing_decisions_idempotency
  ON routing_decisions(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_routing_decisions_merchant_created
  ON routing_decisions(merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_routing_decisions_user_created
  ON routing_decisions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_routing_decisions_route
  ON routing_decisions((decision->>'route'));

COMMENT ON TABLE routing_decisions IS 'Immutable audit trail of all routing decisions with full context';
COMMENT ON COLUMN routing_decisions.decision IS 'Complete decision output with route, costs, and reasoning';
COMMENT ON COLUMN routing_decisions.sira_snapshot IS 'SIRA AI model output snapshot for this decision';

-- 3) routing_metrics: Daily aggregated metrics by route
CREATE TABLE IF NOT EXISTS routing_metrics (
  day DATE NOT NULL,
  route TEXT NOT NULL,
  country TEXT,
  currency TEXT,

  -- Volume metrics
  count BIGINT NOT NULL DEFAULT 0,
  total_amount NUMERIC(20,2) NOT NULL DEFAULT 0,

  -- Success metrics
  success_count BIGINT DEFAULT 0,
  failed_count BIGINT DEFAULT 0,
  fallback_count BIGINT DEFAULT 0,

  -- Cost metrics
  total_molam_fees NUMERIC(20,2) DEFAULT 0,
  total_partner_fees NUMERIC(20,2) DEFAULT 0,

  -- Performance metrics
  avg_latency_ms NUMERIC(10,2) DEFAULT 0,
  p95_latency_ms INTEGER DEFAULT 0,

  -- Last updated
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (day, route, COALESCE(country, ''), COALESCE(currency, '')),

  CONSTRAINT routing_metrics_route_check CHECK (
    route IN ('wallet', 'connect', 'hybrid')
  )
);

CREATE INDEX IF NOT EXISTS idx_routing_metrics_day
  ON routing_metrics(day DESC);

COMMENT ON TABLE routing_metrics IS 'Daily aggregated routing metrics for analytics and monitoring';

-- 4) routing_failures: Track failures for ops and auto-recovery
CREATE TABLE IF NOT EXISTS routing_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference to decision
  decision_id UUID REFERENCES routing_decisions(id),

  -- Failure details
  route_attempted TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  error_details JSONB,

  -- Retry tracking
  attempts INTEGER DEFAULT 1,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'pending',
  -- 'pending', 'retrying', 'failed_permanent', 'recovered'

  -- Resolution
  resolved_at TIMESTAMPTZ,
  resolution_method TEXT, -- 'auto_fallback', 'manual_override', 'retry_success'

  -- Timestamps
  first_attempted_at TIMESTAMPTZ DEFAULT NOW(),
  last_attempted_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT routing_failures_route_check CHECK (
    route_attempted IN ('wallet', 'connect', 'hybrid')
  ),
  CONSTRAINT routing_failures_status_check CHECK (
    status IN ('pending', 'retrying', 'failed_permanent', 'recovered')
  )
);

CREATE INDEX IF NOT EXISTS idx_routing_failures_decision
  ON routing_failures(decision_id);

CREATE INDEX IF NOT EXISTS idx_routing_failures_status
  ON routing_failures(status)
  WHERE status IN ('pending', 'retrying');

CREATE INDEX IF NOT EXISTS idx_routing_failures_next_retry
  ON routing_failures(next_retry_at)
  WHERE next_retry_at IS NOT NULL;

COMMENT ON TABLE routing_failures IS 'Tracks routing failures for monitoring, retry, and auto-recovery';

-- 5) routing_overrides: Manual operator overrides (emergency use)
CREATE TABLE IF NOT EXISTS routing_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Override scope
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example: {"merchant_id": "uuid"} or {"country": "SN"} or {"user_id": "uuid"}

  -- Override directive
  forced_route TEXT NOT NULL,
  reason TEXT NOT NULL,

  -- Time-bound
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Audit
  created_by UUID NOT NULL,
  created_by_email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_by UUID,
  approved_at TIMESTAMPTZ,

  CONSTRAINT routing_overrides_forced_route_check CHECK (
    forced_route IN ('wallet', 'connect', 'hybrid', 'disabled')
  )
);

CREATE INDEX IF NOT EXISTS idx_routing_overrides_active
  ON routing_overrides(is_active, valid_from, valid_until)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_routing_overrides_scope
  ON routing_overrides USING gin(scope);

COMMENT ON TABLE routing_overrides IS 'Emergency manual overrides by operators, time-bound and audited';

-- 6) routing_sira_cache: Cache SIRA responses to reduce latency
CREATE TABLE IF NOT EXISTS routing_sira_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cache key components
  merchant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  currency TEXT NOT NULL,
  amount_bucket INTEGER NOT NULL, -- floor(amount/100) for grouping

  -- Cached response
  sira_response JSONB NOT NULL,

  -- Cache metadata
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER DEFAULT 0,

  -- Composite unique key for upsert
  UNIQUE(merchant_id, user_id, currency, amount_bucket)
);

CREATE INDEX IF NOT EXISTS idx_routing_sira_cache_expires
  ON routing_sira_cache(expires_at)
  WHERE expires_at > NOW();

COMMENT ON TABLE routing_sira_cache IS 'Short-lived cache of SIRA responses to reduce latency';

-- =====================================================
-- Helper Functions
-- =====================================================

-- Function: Get active routing rules for a given context
CREATE OR REPLACE FUNCTION get_active_routing_rules(
  p_country TEXT,
  p_currency TEXT,
  p_merchant_id UUID
) RETURNS TABLE (
  id UUID,
  rule_type TEXT,
  params JSONB,
  priority INTEGER,
  description TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rr.id,
    rr.rule_type,
    rr.params,
    rr.priority,
    rr.description
  FROM routing_rules rr
  WHERE rr.is_active = true
    AND (
      rr.scope = '{}'::jsonb OR
      (rr.scope->>'country' IS NULL OR rr.scope->>'country' = p_country) AND
      (rr.scope->>'currency' IS NULL OR rr.scope->>'currency' = p_currency) AND
      (rr.scope->>'merchant_id' IS NULL OR rr.scope->>'merchant_id' = p_merchant_id::text)
    )
  ORDER BY rr.priority ASC;
END;
$$ LANGUAGE plpgsql;

-- Function: Update routing metrics (called after decision execution)
CREATE OR REPLACE FUNCTION update_routing_metrics(
  p_day DATE,
  p_route TEXT,
  p_country TEXT,
  p_currency TEXT,
  p_amount NUMERIC,
  p_success BOOLEAN,
  p_fallback BOOLEAN,
  p_molam_fee NUMERIC,
  p_partner_fee NUMERIC,
  p_latency_ms INTEGER
) RETURNS VOID AS $$
BEGIN
  INSERT INTO routing_metrics (
    day, route, country, currency,
    count, total_amount,
    success_count, failed_count, fallback_count,
    total_molam_fees, total_partner_fees,
    avg_latency_ms, p95_latency_ms
  ) VALUES (
    p_day, p_route, p_country, p_currency,
    1, p_amount,
    CASE WHEN p_success THEN 1 ELSE 0 END,
    CASE WHEN NOT p_success THEN 1 ELSE 0 END,
    CASE WHEN p_fallback THEN 1 ELSE 0 END,
    p_molam_fee, p_partner_fee,
    p_latency_ms, p_latency_ms
  )
  ON CONFLICT (day, route, country, currency)
  DO UPDATE SET
    count = routing_metrics.count + 1,
    total_amount = routing_metrics.total_amount + p_amount,
    success_count = routing_metrics.success_count + (CASE WHEN p_success THEN 1 ELSE 0 END),
    failed_count = routing_metrics.failed_count + (CASE WHEN NOT p_success THEN 1 ELSE 0 END),
    fallback_count = routing_metrics.fallback_count + (CASE WHEN p_fallback THEN 1 ELSE 0 END),
    total_molam_fees = routing_metrics.total_molam_fees + p_molam_fee,
    total_partner_fees = routing_metrics.total_partner_fees + p_partner_fee,
    avg_latency_ms = (routing_metrics.avg_latency_ms * routing_metrics.count + p_latency_ms) / (routing_metrics.count + 1),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Triggers
-- =====================================================

-- Trigger: Update routing_rules.updated_at on modification
CREATE OR REPLACE FUNCTION trigger_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER routing_rules_update_timestamp
  BEFORE UPDATE ON routing_rules
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_timestamp();

-- =====================================================
-- Seed Data: Default Routing Rules
-- =====================================================

-- Default rule: Prefer wallet for amounts < 50,000 XOF in Senegal
INSERT INTO routing_rules (scope, priority, rule_type, params, description, created_by_email)
VALUES (
  '{"country": "SN", "currency": "XOF"}'::jsonb,
  10,
  'amount_based',
  '{"min_amount": 100, "max_amount": 50000, "preferred_route": "wallet"}'::jsonb,
  'Prefer wallet for small amounts in Senegal',
  'system@molam.com'
) ON CONFLICT DO NOTHING;

-- Default rule: Cost threshold - prefer wallet if 2% cheaper
INSERT INTO routing_rules (scope, priority, rule_type, params, description, created_by_email)
VALUES (
  '{}'::jsonb,
  20,
  'cost_threshold',
  '{"threshold_pct": 0.02}'::jsonb,
  'Global cost optimization: prefer wallet if 2% cheaper',
  'system@molam.com'
) ON CONFLICT DO NOTHING;

-- Default rule: Force connect for high-value transactions
INSERT INTO routing_rules (scope, priority, rule_type, params, description, created_by_email)
VALUES (
  '{}'::jsonb,
  30,
  'amount_based',
  '{"min_amount": 1000000, "preferred_route": "connect"}'::jsonb,
  'Force connect for transactions > 1M',
  'system@molam.com'
) ON CONFLICT DO NOTHING;

-- =====================================================
-- Views for Analytics
-- =====================================================

-- View: Recent routing decisions summary
CREATE OR REPLACE VIEW v_routing_decisions_summary AS
SELECT
  DATE(rd.created_at) as decision_date,
  rd.decision->>'route' as route,
  rd.country,
  rd.currency,
  COUNT(*) as decision_count,
  SUM(rd.amount) as total_amount,
  AVG(rd.decision_latency_ms) as avg_latency_ms,
  COUNT(*) FILTER (WHERE rd.execution_status = 'success') as success_count,
  COUNT(*) FILTER (WHERE rd.execution_status = 'failed') as failed_count,
  COUNT(*) FILTER (WHERE rd.execution_status = 'fallback_used') as fallback_count
FROM routing_decisions rd
WHERE rd.created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(rd.created_at), rd.decision->>'route', rd.country, rd.currency
ORDER BY decision_date DESC, decision_count DESC;

-- View: Active routing rules summary
CREATE OR REPLACE VIEW v_routing_rules_active AS
SELECT
  id,
  priority,
  rule_type,
  scope,
  params,
  description,
  created_at,
  updated_at
FROM routing_rules
WHERE is_active = true
ORDER BY priority ASC;

COMMENT ON VIEW v_routing_decisions_summary IS 'Summary of routing decisions for analytics dashboard';
COMMENT ON VIEW v_routing_rules_active IS 'Active routing rules sorted by priority';

-- =====================================================
-- Grants (adjust based on your role structure)
-- =====================================================

-- Grant read access to analytics role
-- GRANT SELECT ON routing_decisions, routing_metrics, routing_failures TO analytics_role;

-- Grant full access to service role
-- GRANT ALL ON routing_rules, routing_decisions, routing_metrics, routing_failures, routing_overrides, routing_sira_cache TO routing_service_role;

-- =====================================================
-- End of Migration
-- =====================================================
