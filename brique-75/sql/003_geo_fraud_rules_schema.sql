/**
 * Sous-Brique 75bis-1 - Geo-Fraud Rules, Dynamic Pricing & Safe Rollouts
 *
 * Industrial-grade schema for:
 * - Geo-specific policy rules (block, throttle, suspend, require_kyc)
 * - Dynamic pricing by zone and payment method
 * - A/B experiments for safe rollouts
 * - Ops approval workflow
 * - Real-time metrics tracking
 * - Automatic rollback on KPI breach
 *
 * This extends Brique 75bis with advanced policy engine and experimentation.
 */

-- ============================================================================
-- GEO POLICY RULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS geo_policy_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope (merchant-specific or global)
  scope TEXT NOT NULL CHECK (scope IN ('merchant', 'global')),
  scope_id UUID, -- merchant_id when scope='merchant', NULL for global

  -- Rule configuration
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'block',              -- Completely block transactions
    'throttle',           -- Limit transaction rate
    'suspend_payout',     -- Allow payment but suspend payout
    'require_kyc',        -- Require additional KYC
    'dynamic_fee',        -- Apply dynamic fee adjustment
    'alert_only',         -- Monitor and alert, no action
    'require_3ds'         -- Force 3D Secure authentication
  )),

  -- Target zones (countries, regions, cities)
  target_zone JSONB NOT NULL,
  -- Example: {"countries": ["CI", "NG"], "regions": ["WAEMU"], "cities": ["Lagos"]}

  -- Rule parameters (type-specific)
  params JSONB DEFAULT '{}'::JSONB,
  -- Examples:
  -- throttle: {"rate_limit": 10, "period_seconds": 60}
  -- dynamic_fee: {"fee_modifier": 1.5, "min_amount": 1000}
  -- require_kyc: {"verification_level": "enhanced"}

  -- Status & workflow
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'archived', 'rejected')),

  -- Priority (higher number = higher priority)
  priority INTEGER DEFAULT 100 CHECK (priority >= 0 AND priority <= 1000),

  -- Approval workflow
  created_by UUID NOT NULL,
  approved_by UUID,
  rejected_by UUID,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Validity period
  effective_from TIMESTAMPTZ DEFAULT now(),
  effective_until TIMESTAMPTZ,

  -- Source (manual, sira_auto, experiment)
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'sira_auto', 'experiment', 'emergency')),
  source_id UUID, -- experiment_id or recommendation_id

  -- Metadata
  description TEXT,
  tags TEXT[] DEFAULT '{}',

  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_geo_policy_scope ON geo_policy_rules(scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_geo_policy_status ON geo_policy_rules(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_geo_policy_type ON geo_policy_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_geo_policy_effective ON geo_policy_rules(effective_from, effective_until);
CREATE INDEX IF NOT EXISTS idx_geo_policy_priority ON geo_policy_rules(priority DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_geo_policy_zone ON geo_policy_rules USING gin(target_zone);

-- ============================================================================
-- ZONE PRICING OVERRIDES
-- ============================================================================

CREATE TABLE IF NOT EXISTS zone_pricing_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES connect_accounts(id),

  -- Target zone
  zone JSONB NOT NULL,
  -- Example: {"countries": ["SN"], "regions": [], "cities": []}

  -- Payment method
  method TEXT NOT NULL CHECK (method IN ('wallet', 'card', 'mobile_money', 'bank_transfer', 'ussd', 'qr_code')),
  provider TEXT, -- e.g., 'mtn_momo', 'orange_money'

  -- Pricing configuration
  fee_percent NUMERIC(6,3) DEFAULT 0 CHECK (fee_percent >= 0),
  fee_fixed NUMERIC(18,2) DEFAULT 0 CHECK (fee_fixed >= 0),
  fee_cap NUMERIC(18,2), -- Maximum fee

  -- Discount/Markup
  is_discount BOOLEAN DEFAULT false,
  discount_reason TEXT,

  -- Status
  active BOOLEAN DEFAULT true,

  -- Validity period
  effective_from TIMESTAMPTZ DEFAULT now(),
  effective_until TIMESTAMPTZ,

  -- Approval workflow
  created_by UUID NOT NULL,
  approved_by UUID,
  approved_at TIMESTAMPTZ,

  -- Source (manual, experiment, promotion)
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'experiment', 'promotion', 'sira_recommendation')),
  source_id UUID,

  -- Metadata
  description TEXT,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_zone_pricing_merchant ON zone_pricing_overrides(merchant_id);
CREATE INDEX IF NOT EXISTS idx_zone_pricing_active ON zone_pricing_overrides(merchant_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_zone_pricing_effective ON zone_pricing_overrides(effective_from, effective_until);
CREATE INDEX IF NOT EXISTS idx_zone_pricing_zone ON zone_pricing_overrides USING gin(zone);

-- ============================================================================
-- A/B EXPERIMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS zone_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES connect_accounts(id),

  -- Experiment details
  name TEXT NOT NULL,
  description TEXT,
  hypothesis TEXT,

  -- Variants
  variant_a JSONB NOT NULL,  -- Baseline (current policy/pricing)
  variant_b JSONB NOT NULL,  -- Proposed change

  -- Traffic split
  percent_b INTEGER NOT NULL CHECK (percent_b >= 0 AND percent_b <= 100),

  -- Target zones
  target_zones JSONB DEFAULT '[]'::JSONB,
  -- Example: [{"countries": ["SN", "CI"]}, {"cities": ["Lagos"]}]

  -- Success metrics & thresholds
  metrics_targets JSONB DEFAULT '{}'::JSONB,
  -- Example: {
  --   "fraud_rate_max": 0.05,
  --   "conversion_min": 0.98,
  --   "revenue_min": 1000000,
  --   "evaluation_window_hours": 72
  -- }

  -- Auto-rollback configuration
  auto_rollback_enabled BOOLEAN DEFAULT true,
  rollback_conditions JSONB DEFAULT '{}'::JSONB,
  -- Example: {
  --   "fraud_rate_breach": 0.10,
  --   "conversion_drop_pct": 0.05,
  --   "min_transactions": 100
  -- }

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft',       -- Being configured
    'pending',     -- Awaiting approval
    'approved',    -- Approved, not started
    'running',     -- Currently running
    'paused',      -- Temporarily paused
    'stopped',     -- Manually stopped
    'completed',   -- Finished successfully
    'rolled_back', -- Auto-rolled back due to KPI breach
    'rejected'     -- Rejected by approver
  )),

  -- Approval workflow
  created_by UUID NOT NULL,
  approved_by UUID,
  rejected_by UUID,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Execution tracking
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ,
  rollback_reason TEXT,

  -- Results
  winner_variant TEXT CHECK (winner_variant IN ('A', 'B', 'inconclusive')),
  results_summary JSONB,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_zone_exp_merchant ON zone_experiments(merchant_id);
CREATE INDEX IF NOT EXISTS idx_zone_exp_status ON zone_experiments(status);
CREATE INDEX IF NOT EXISTS idx_zone_exp_running ON zone_experiments(merchant_id) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_zone_exp_dates ON zone_experiments(started_at, stopped_at);

-- ============================================================================
-- EXPERIMENT METRICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS zone_experiment_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES zone_experiments(id) ON DELETE CASCADE,

  -- Time period
  day DATE NOT NULL,
  hour INTEGER CHECK (hour >= 0 AND hour <= 23),

  -- Zone
  zone JSONB NOT NULL,

  -- Variant
  variant TEXT NOT NULL CHECK (variant IN ('A', 'B')),

  -- Transaction metrics
  tx_count BIGINT DEFAULT 0,
  tx_amount NUMERIC(18,2) DEFAULT 0,
  tx_successful BIGINT DEFAULT 0,
  tx_failed BIGINT DEFAULT 0,

  -- Fraud metrics
  fraud_count BIGINT DEFAULT 0,
  fraud_amount NUMERIC(18,2) DEFAULT 0,

  -- Conversion metrics
  conversion_attempts BIGINT DEFAULT 0,
  conversions BIGINT DEFAULT 0,

  -- Chargeback metrics
  chargeback_count BIGINT DEFAULT 0,
  chargeback_amount NUMERIC(18,2) DEFAULT 0,

  -- Revenue metrics
  revenue NUMERIC(18,2) DEFAULT 0,
  fees_collected NUMERIC(18,2) DEFAULT 0,

  -- Customer metrics
  unique_customers BIGINT DEFAULT 0,

  -- Calculated rates
  fraud_rate NUMERIC(5,4),
  conversion_rate NUMERIC(5,4),
  chargeback_rate NUMERIC(5,4),

  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(experiment_id, day, hour, zone, variant)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_zone_exp_metrics_exp ON zone_experiment_metrics(experiment_id);
CREATE INDEX IF NOT EXISTS idx_zone_exp_metrics_day ON zone_experiment_metrics(experiment_id, day DESC);
CREATE INDEX IF NOT EXISTS idx_zone_exp_metrics_variant ON zone_experiment_metrics(experiment_id, variant);

-- ============================================================================
-- POLICY RULE APPLICATIONS (Audit Log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS geo_policy_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES geo_policy_rules(id),
  merchant_id UUID NOT NULL REFERENCES connect_accounts(id),

  -- Transaction context
  transaction_id UUID,
  customer_country TEXT,
  customer_city TEXT,

  -- Action taken
  action_taken TEXT NOT NULL CHECK (action_taken IN (
    'blocked',
    'throttled',
    'payout_suspended',
    'kyc_required',
    'fee_adjusted',
    'alerted',
    '3ds_required',
    'allowed'
  )),

  -- Details
  original_fee NUMERIC(18,2),
  adjusted_fee NUMERIC(18,2),
  metadata JSONB DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_geo_app_rule ON geo_policy_applications(rule_id);
CREATE INDEX IF NOT EXISTS idx_geo_app_merchant ON geo_policy_applications(merchant_id);
CREATE INDEX IF NOT EXISTS idx_geo_app_created ON geo_policy_applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_geo_app_tx ON geo_policy_applications(transaction_id);

-- ============================================================================
-- TRIGGERS & FUNCTIONS
-- ============================================================================

/**
 * Function to calculate experiment metrics rates
 */
CREATE OR REPLACE FUNCTION calculate_experiment_rates()
RETURNS TRIGGER AS $$
BEGIN
  NEW.fraud_rate := CASE
    WHEN NEW.tx_count > 0 THEN NEW.fraud_count::NUMERIC / NEW.tx_count
    ELSE 0
  END;

  NEW.conversion_rate := CASE
    WHEN NEW.conversion_attempts > 0 THEN NEW.conversions::NUMERIC / NEW.conversion_attempts
    ELSE 0
  END;

  NEW.chargeback_rate := CASE
    WHEN NEW.tx_successful > 0 THEN NEW.chargeback_count::NUMERIC / NEW.tx_successful
    ELSE 0
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculate_experiment_rates
  BEFORE INSERT OR UPDATE ON zone_experiment_metrics
  FOR EACH ROW EXECUTE FUNCTION calculate_experiment_rates();

/**
 * Function to auto-update experiment status on completion
 */
CREATE OR REPLACE FUNCTION check_experiment_completion()
RETURNS TRIGGER AS $$
DECLARE
  target_hours INTEGER;
  elapsed_hours NUMERIC;
BEGIN
  IF NEW.status = 'running' AND NEW.started_at IS NOT NULL THEN
    -- Get evaluation window from metrics_targets
    target_hours := COALESCE((NEW.metrics_targets->>'evaluation_window_hours')::INTEGER, 72);
    elapsed_hours := EXTRACT(EPOCH FROM (now() - NEW.started_at)) / 3600;

    IF elapsed_hours >= target_hours THEN
      NEW.status := 'completed';
      NEW.stopped_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_experiment_completion
  BEFORE UPDATE ON zone_experiments
  FOR EACH ROW EXECUTE FUNCTION check_experiment_completion();

/**
 * Function to check for experiment auto-rollback conditions
 */
CREATE OR REPLACE FUNCTION check_experiment_rollback(
  p_experiment_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_exp RECORD;
  v_metrics_b RECORD;
  v_metrics_a RECORD;
  v_fraud_rate_b NUMERIC;
  v_fraud_rate_a NUMERIC;
  v_conv_rate_b NUMERIC;
  v_conv_rate_a NUMERIC;
  v_should_rollback BOOLEAN := false;
BEGIN
  -- Get experiment
  SELECT * INTO v_exp FROM zone_experiments WHERE id = p_experiment_id;

  IF NOT v_exp.auto_rollback_enabled THEN
    RETURN false;
  END IF;

  -- Get recent metrics for variant B
  SELECT
    AVG(fraud_rate) as avg_fraud_rate,
    AVG(conversion_rate) as avg_conversion_rate,
    SUM(tx_count) as total_txs
  INTO v_metrics_b
  FROM zone_experiment_metrics
  WHERE experiment_id = p_experiment_id
    AND variant = 'B'
    AND day >= CURRENT_DATE - INTERVAL '1 day';

  -- Get recent metrics for variant A
  SELECT
    AVG(fraud_rate) as avg_fraud_rate,
    AVG(conversion_rate) as avg_conversion_rate
  INTO v_metrics_a
  FROM zone_experiment_metrics
  WHERE experiment_id = p_experiment_id
    AND variant = 'A'
    AND day >= CURRENT_DATE - INTERVAL '1 day';

  -- Check minimum transactions threshold
  IF v_metrics_b.total_txs < COALESCE((v_exp.rollback_conditions->>'min_transactions')::INTEGER, 100) THEN
    RETURN false; -- Not enough data yet
  END IF;

  -- Check fraud rate breach
  IF v_metrics_b.avg_fraud_rate > COALESCE((v_exp.rollback_conditions->>'fraud_rate_breach')::NUMERIC, 0.10) THEN
    v_should_rollback := true;
  END IF;

  -- Check conversion drop
  IF v_metrics_a.avg_conversion_rate > 0 THEN
    IF (v_metrics_a.avg_conversion_rate - v_metrics_b.avg_conversion_rate) / v_metrics_a.avg_conversion_rate >
       COALESCE((v_exp.rollback_conditions->>'conversion_drop_pct')::NUMERIC, 0.05) THEN
      v_should_rollback := true;
    END IF;
  END IF;

  -- If should rollback, update experiment status
  IF v_should_rollback THEN
    UPDATE zone_experiments
    SET
      status = 'rolled_back',
      stopped_at = now(),
      rolled_back_at = now(),
      rollback_reason = format('Auto-rollback: Fraud rate %.2f%%, Conversion rate %.2f%%',
        v_metrics_b.avg_fraud_rate * 100, v_metrics_b.avg_conversion_rate * 100)
    WHERE id = p_experiment_id;
  END IF;

  RETURN v_should_rollback;
END;
$$ LANGUAGE plpgsql;

/**
 * Function to get applicable pricing for a zone/method
 */
CREATE OR REPLACE FUNCTION get_zone_pricing(
  p_merchant_id UUID,
  p_country TEXT,
  p_city TEXT,
  p_method TEXT,
  p_provider TEXT DEFAULT NULL
)
RETURNS TABLE (
  fee_percent NUMERIC,
  fee_fixed NUMERIC,
  fee_cap NUMERIC,
  override_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    zp.fee_percent,
    zp.fee_fixed,
    zp.fee_cap,
    zp.id
  FROM zone_pricing_overrides zp
  WHERE zp.merchant_id = p_merchant_id
    AND zp.method = p_method
    AND (p_provider IS NULL OR zp.provider = p_provider OR zp.provider IS NULL)
    AND zp.active = true
    AND zp.effective_from <= now()
    AND (zp.effective_until IS NULL OR zp.effective_until >= now())
    AND (
      zp.zone->>'countries' @> format('["%s"]', p_country)::jsonb
      OR zp.zone->>'cities' @> format('["%s"]', p_city)::jsonb
    )
  ORDER BY
    -- Prioritize city-specific over country-specific
    CASE WHEN zp.zone->>'cities' @> format('["%s"]', p_city)::jsonb THEN 1 ELSE 2 END,
    zp.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

/**
 * Function to get applicable policy rules for a zone
 */
CREATE OR REPLACE FUNCTION get_applicable_rules(
  p_merchant_id UUID,
  p_country TEXT,
  p_city TEXT DEFAULT NULL
)
RETURNS TABLE (
  rule_id UUID,
  rule_type TEXT,
  params JSONB,
  priority INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.rule_type,
    r.params,
    r.priority
  FROM geo_policy_rules r
  WHERE r.status = 'active'
    AND r.effective_from <= now()
    AND (r.effective_until IS NULL OR r.effective_until >= now())
    AND (
      (r.scope = 'global')
      OR (r.scope = 'merchant' AND r.scope_id = p_merchant_id)
    )
    AND (
      r.target_zone->>'countries' @> format('["%s"]', p_country)::jsonb
      OR (p_city IS NOT NULL AND r.target_zone->>'cities' @> format('["%s"]', p_city)::jsonb)
    )
  ORDER BY r.priority DESC, r.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS FOR ANALYTICS
-- ============================================================================

/**
 * View: Active experiments dashboard
 */
CREATE OR REPLACE VIEW v_active_experiments AS
SELECT
  e.id,
  e.merchant_id,
  e.name,
  e.status,
  e.percent_b,
  e.started_at,
  EXTRACT(EPOCH FROM (now() - e.started_at)) / 3600 as hours_running,
  (e.metrics_targets->>'evaluation_window_hours')::INTEGER as target_hours,
  -- Aggregate metrics from last 24h
  (SELECT COUNT(*) FROM zone_experiment_metrics m
   WHERE m.experiment_id = e.id AND m.day >= CURRENT_DATE - 1) as metrics_count_24h
FROM zone_experiments e
WHERE e.status IN ('running', 'approved', 'paused')
ORDER BY e.started_at DESC;

/**
 * View: Experiment performance comparison
 */
CREATE OR REPLACE VIEW v_experiment_performance AS
SELECT
  m.experiment_id,
  m.variant,
  COUNT(DISTINCT m.day) as days_tracked,
  SUM(m.tx_count) as total_txs,
  SUM(m.tx_amount) as total_amount,
  AVG(m.fraud_rate) as avg_fraud_rate,
  AVG(m.conversion_rate) as avg_conversion_rate,
  SUM(m.revenue) as total_revenue,
  SUM(m.fees_collected) as total_fees
FROM zone_experiment_metrics m
GROUP BY m.experiment_id, m.variant;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE geo_policy_rules IS 'Geo-specific policy rules for fraud prevention and compliance';
COMMENT ON TABLE zone_pricing_overrides IS 'Dynamic pricing by zone and payment method';
COMMENT ON TABLE zone_experiments IS 'A/B experiments for safe rollouts with auto-rollback';
COMMENT ON TABLE zone_experiment_metrics IS 'Real-time metrics tracking for experiments';
COMMENT ON TABLE geo_policy_applications IS 'Audit log of policy rule applications';

COMMENT ON FUNCTION check_experiment_rollback IS 'Checks if experiment should be auto-rolled back based on KPI thresholds';
COMMENT ON FUNCTION get_zone_pricing IS 'Returns applicable pricing for a specific zone and payment method';
COMMENT ON FUNCTION get_applicable_rules IS 'Returns all active policy rules for a specific zone';

-- ============================================================================
-- SAMPLE DATA & INITIAL SETUP
-- ============================================================================

-- Sample global rule: Require 3DS for high-risk countries
INSERT INTO geo_policy_rules (
  scope, rule_type, target_zone, params, status, created_by, description, source, priority
) VALUES (
  'global',
  'require_3ds',
  '{"countries": ["NG", "GH"]}'::jsonb,
  '{"minimum_amount": 50000}'::jsonb,
  'active',
  '00000000-0000-0000-0000-000000000000',
  'Require 3D Secure for transactions over 50k XOF in high-risk countries',
  'manual',
  500
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- GRANTS (adjust based on your role structure)
-- ============================================================================

-- GRANT SELECT, INSERT, UPDATE ON geo_policy_rules TO merchant_app;
-- GRANT SELECT ON zone_pricing_overrides TO merchant_app;
-- GRANT EXECUTE ON FUNCTION get_zone_pricing TO merchant_app;
-- GRANT EXECUTE ON FUNCTION get_applicable_rules TO merchant_app;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================

-- Summary
DO $$
BEGIN
  RAISE NOTICE '=== Sous-Brique 75bis-1 Schema Installation Complete ===';
  RAISE NOTICE 'Tables: geo_policy_rules, zone_pricing_overrides, zone_experiments, zone_experiment_metrics, geo_policy_applications';
  RAISE NOTICE 'Functions: 6 (calculate rates, check rollback, get pricing, get rules, etc.)';
  RAISE NOTICE 'Triggers: 2 (auto-calculate rates, check completion)';
  RAISE NOTICE 'Views: 2 (active experiments, performance comparison)';
  RAISE NOTICE '=========================================================';
END $$;
