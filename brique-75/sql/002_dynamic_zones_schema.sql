/**
 * Sous-Brique 75bis - Dynamic Sales Zones & Smart Restrictions
 *
 * Extension to merchant_sales_zones with:
 * - City-level restrictions
 * - Auto-recommendations from Sira AI
 * - Fraud-based zone suspension
 * - Conversion-based zone expansion
 * - Real-time performance tracking per zone
 *
 * This schema extends Brique 75 with AI-powered zone optimization.
 */

-- ============================================================================
-- EXTEND EXISTING TABLES
-- ============================================================================

-- Extend merchant_sales_zones with new fields
-- (Table already created in 001_merchant_settings_schema.sql)
ALTER TABLE merchant_sales_zones
  ADD COLUMN IF NOT EXISTS allowed_cities TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS excluded_cities TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS auto_recommend BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_sira_analysis TIMESTAMPTZ;

-- Add unique constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merchant_sales_zones_merchant_id_key'
  ) THEN
    ALTER TABLE merchant_sales_zones ADD CONSTRAINT merchant_sales_zones_merchant_id_key UNIQUE (merchant_id);
  END IF;
END $$;

-- ============================================================================
-- SIRA ZONE RECOMMENDATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS sira_zone_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES connect_accounts(id),

  -- Recommendation details
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN ('suspend','expand','restrict','monitor')),
  zone_type TEXT NOT NULL CHECK (zone_type IN ('country','region','city')),
  zone_identifier TEXT NOT NULL, -- ISO code or region name

  -- Reasoning
  reason TEXT NOT NULL,
  confidence_score NUMERIC(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),

  -- Supporting metrics
  fraud_rate NUMERIC(5,4), -- e.g., 0.1523 = 15.23%
  chargeback_rate NUMERIC(5,4),
  conversion_rate NUMERIC(5,4),
  approval_rate NUMERIC(5,4),
  avg_transaction_amount NUMERIC(12,2),
  transaction_volume_30d INTEGER,

  -- Growth potential
  estimated_revenue_impact NUMERIC(12,2), -- Positive for expand, negative for suspend
  market_growth_rate NUMERIC(5,4),

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','applied','ignored','expired')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),

  -- Action tracking
  applied_at TIMESTAMPTZ,
  applied_by UUID,
  ignored_at TIMESTAMPTZ,
  ignored_by UUID,
  ignore_reason TEXT,
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days'),

  -- Full recommendation payload
  full_analysis JSONB DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for recommendations
CREATE INDEX IF NOT EXISTS idx_sira_zone_recs_merchant ON sira_zone_recommendations(merchant_id);
CREATE INDEX IF NOT EXISTS idx_sira_zone_recs_status ON sira_zone_recommendations(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_sira_zone_recs_created ON sira_zone_recommendations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sira_zone_recs_priority ON sira_zone_recommendations(priority) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_sira_zone_recs_zone ON sira_zone_recommendations(zone_identifier);

-- ============================================================================
-- ZONE PERFORMANCE TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchant_zone_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES connect_accounts(id),

  -- Zone identification
  zone_type TEXT NOT NULL CHECK (zone_type IN ('country','region','city')),
  zone_identifier TEXT NOT NULL, -- e.g., "SN", "WAEMU", "Dakar"

  -- Time period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Transaction metrics
  total_transactions INTEGER DEFAULT 0,
  successful_transactions INTEGER DEFAULT 0,
  failed_transactions INTEGER DEFAULT 0,
  fraud_transactions INTEGER DEFAULT 0,
  chargeback_transactions INTEGER DEFAULT 0,

  -- Volume metrics
  total_volume NUMERIC(12,2) DEFAULT 0,
  successful_volume NUMERIC(12,2) DEFAULT 0,

  -- Calculated rates
  success_rate NUMERIC(5,4), -- successful / total
  fraud_rate NUMERIC(5,4), -- fraud / total
  chargeback_rate NUMERIC(5,4), -- chargeback / successful

  -- Customer metrics
  unique_customers INTEGER DEFAULT 0,
  repeat_customers INTEGER DEFAULT 0,

  -- Temporal data
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(merchant_id, zone_type, zone_identifier, period_start)
);

-- Indexes for performance tracking
CREATE INDEX IF NOT EXISTS idx_zone_perf_merchant ON merchant_zone_performance(merchant_id);
CREATE INDEX IF NOT EXISTS idx_zone_perf_zone ON merchant_zone_performance(zone_identifier);
CREATE INDEX IF NOT EXISTS idx_zone_perf_period ON merchant_zone_performance(period_start DESC);

-- Partitioning by period_start (monthly) for scalability
-- CREATE TABLE merchant_zone_performance_2025_11 PARTITION OF merchant_zone_performance
--   FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

-- ============================================================================
-- ZONE RESTRICTION LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchant_zone_restriction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES connect_accounts(id),

  -- Action details
  action TEXT NOT NULL CHECK (action IN ('suspend','activate','restrict','unrestrict')),
  zone_type TEXT NOT NULL CHECK (zone_type IN ('country','region','city')),
  zone_identifier TEXT NOT NULL,

  -- Trigger
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('manual','sira_auto','fraud_threshold','admin')),
  recommendation_id UUID REFERENCES sira_zone_recommendations(id),

  -- Reasoning
  reason TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::JSONB,

  -- Actor
  actor_id UUID,
  actor_type TEXT CHECK (actor_type IN ('merchant_user','ops_admin','system')),

  -- Previous/new state
  previous_state JSONB,
  new_state JSONB,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for restriction logs
CREATE INDEX IF NOT EXISTS idx_zone_restrict_logs_merchant ON merchant_zone_restriction_logs(merchant_id);
CREATE INDEX IF NOT EXISTS idx_zone_restrict_logs_created ON merchant_zone_restriction_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zone_restrict_logs_zone ON merchant_zone_restriction_logs(zone_identifier);

-- ============================================================================
-- SIRA ANALYSIS TRIGGERS
-- ============================================================================

/**
 * Function to calculate zone performance metrics
 */
CREATE OR REPLACE FUNCTION calculate_zone_metrics()
RETURNS TRIGGER AS $$
BEGIN
  NEW.success_rate := CASE
    WHEN NEW.total_transactions > 0 THEN NEW.successful_transactions::NUMERIC / NEW.total_transactions
    ELSE 0
  END;

  NEW.fraud_rate := CASE
    WHEN NEW.total_transactions > 0 THEN NEW.fraud_transactions::NUMERIC / NEW.total_transactions
    ELSE 0
  END;

  NEW.chargeback_rate := CASE
    WHEN NEW.successful_transactions > 0 THEN NEW.chargeback_transactions::NUMERIC / NEW.successful_transactions
    ELSE 0
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculate_zone_metrics
  BEFORE INSERT OR UPDATE ON merchant_zone_performance
  FOR EACH ROW EXECUTE FUNCTION calculate_zone_metrics();

/**
 * Function to log zone restriction changes
 */
CREATE OR REPLACE FUNCTION log_zone_restriction()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if relevant fields changed
  IF (OLD.allowed_countries IS DISTINCT FROM NEW.allowed_countries) OR
     (OLD.excluded_countries IS DISTINCT FROM NEW.excluded_countries) OR
     (OLD.allowed_regions IS DISTINCT FROM NEW.allowed_regions) OR
     (OLD.excluded_regions IS DISTINCT FROM NEW.excluded_regions) OR
     (OLD.allowed_cities IS DISTINCT FROM NEW.allowed_cities) OR
     (OLD.excluded_cities IS DISTINCT FROM NEW.excluded_cities) THEN

    INSERT INTO merchant_zone_restriction_logs (
      merchant_id,
      action,
      zone_type,
      zone_identifier,
      triggered_by,
      reason,
      previous_state,
      new_state,
      actor_type
    ) VALUES (
      NEW.merchant_id,
      'restrict',
      'country',
      'multiple',
      'manual',
      'Zone configuration updated',
      row_to_json(OLD),
      row_to_json(NEW),
      'merchant_user'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_zone_restriction
  AFTER UPDATE ON merchant_sales_zones
  FOR EACH ROW EXECUTE FUNCTION log_zone_restriction();

-- ============================================================================
-- SIRA RECOMMENDATION FUNCTIONS
-- ============================================================================

/**
 * Get zone performance summary for Sira analysis
 */
CREATE OR REPLACE FUNCTION get_zone_performance_summary(
  p_merchant_id UUID,
  p_zone_identifier TEXT,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  zone_identifier TEXT,
  total_transactions BIGINT,
  fraud_rate NUMERIC,
  chargeback_rate NUMERIC,
  success_rate NUMERIC,
  avg_amount NUMERIC,
  unique_customers BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.zone_identifier,
    SUM(p.total_transactions)::BIGINT,
    AVG(p.fraud_rate),
    AVG(p.chargeback_rate),
    AVG(p.success_rate),
    AVG(p.total_volume / NULLIF(p.total_transactions, 0)),
    SUM(p.unique_customers)::BIGINT
  FROM merchant_zone_performance p
  WHERE p.merchant_id = p_merchant_id
    AND p.zone_identifier = p_zone_identifier
    AND p.period_start >= (now() - (p_days || ' days')::INTERVAL)
  GROUP BY p.zone_identifier;
END;
$$ LANGUAGE plpgsql;

/**
 * Check if zone should be auto-suspended based on fraud threshold
 */
CREATE OR REPLACE FUNCTION check_auto_suspend_zone(
  p_merchant_id UUID,
  p_zone_identifier TEXT,
  p_fraud_threshold NUMERIC DEFAULT 0.10 -- 10%
)
RETURNS BOOLEAN AS $$
DECLARE
  v_fraud_rate NUMERIC;
BEGIN
  SELECT fraud_rate INTO v_fraud_rate
  FROM get_zone_performance_summary(p_merchant_id, p_zone_identifier, 7);

  RETURN v_fraud_rate > p_fraud_threshold;
END;
$$ LANGUAGE plpgsql;

/**
 * Generate Sira recommendation for high-fraud zone
 */
CREATE OR REPLACE FUNCTION generate_fraud_suspension_recommendation(
  p_merchant_id UUID,
  p_zone_identifier TEXT,
  p_fraud_rate NUMERIC,
  p_transaction_count INTEGER
)
RETURNS UUID AS $$
DECLARE
  v_rec_id UUID;
BEGIN
  INSERT INTO sira_zone_recommendations (
    merchant_id,
    recommendation_type,
    zone_type,
    zone_identifier,
    reason,
    confidence_score,
    fraud_rate,
    transaction_volume_30d,
    estimated_revenue_impact,
    priority,
    full_analysis
  ) VALUES (
    p_merchant_id,
    'suspend',
    'country',
    p_zone_identifier,
    format('High fraud rate detected: %.2f%% across %s transactions', p_fraud_rate * 100, p_transaction_count),
    CASE
      WHEN p_fraud_rate > 0.25 THEN 0.95 -- Very high confidence
      WHEN p_fraud_rate > 0.15 THEN 0.85
      ELSE 0.70
    END,
    p_fraud_rate,
    p_transaction_count,
    -1 * (p_transaction_count * 1000), -- Estimated loss prevention
    CASE
      WHEN p_fraud_rate > 0.25 THEN 'critical'
      WHEN p_fraud_rate > 0.15 THEN 'high'
      ELSE 'medium'
    END,
    jsonb_build_object(
      'metric', 'fraud_rate',
      'threshold_exceeded', p_fraud_rate > 0.10,
      'recommended_action', 'immediate_suspension',
      'review_period_days', 30
    )
  ) RETURNING id INTO v_rec_id;

  RETURN v_rec_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Generate Sira recommendation for high-conversion zone
 */
CREATE OR REPLACE FUNCTION generate_expansion_recommendation(
  p_merchant_id UUID,
  p_zone_identifier TEXT,
  p_conversion_rate NUMERIC,
  p_growth_rate NUMERIC,
  p_transaction_count INTEGER
)
RETURNS UUID AS $$
DECLARE
  v_rec_id UUID;
BEGIN
  INSERT INTO sira_zone_recommendations (
    merchant_id,
    recommendation_type,
    zone_type,
    zone_identifier,
    reason,
    confidence_score,
    conversion_rate,
    market_growth_rate,
    transaction_volume_30d,
    estimated_revenue_impact,
    priority,
    full_analysis
  ) VALUES (
    p_merchant_id,
    'expand',
    'country',
    p_zone_identifier,
    format('High growth potential: %.2f%% conversion, %.2f%% market growth', p_conversion_rate * 100, p_growth_rate * 100),
    CASE
      WHEN p_conversion_rate > 0.15 AND p_growth_rate > 0.10 THEN 0.90
      WHEN p_conversion_rate > 0.10 THEN 0.75
      ELSE 0.60
    END,
    p_conversion_rate,
    p_growth_rate,
    p_transaction_count * 1500, -- Estimated revenue increase
    CASE
      WHEN p_conversion_rate > 0.15 THEN 'high'
      ELSE 'medium'
    END,
    jsonb_build_object(
      'metric', 'conversion_rate',
      'growth_opportunity', true,
      'recommended_action', 'increase_marketing',
      'estimated_roi', 3.5
    )
  ) RETURNING id INTO v_rec_id;

  RETURN v_rec_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS FOR ANALYTICS
-- ============================================================================

/**
 * View: Active Sira recommendations per merchant
 */
CREATE OR REPLACE VIEW v_active_sira_recommendations AS
SELECT
  r.merchant_id,
  r.recommendation_type,
  r.zone_identifier,
  r.reason,
  r.confidence_score,
  r.priority,
  r.fraud_rate,
  r.conversion_rate,
  r.estimated_revenue_impact,
  r.created_at,
  r.expires_at,
  EXTRACT(EPOCH FROM (r.expires_at - now()))/86400 as days_until_expiry
FROM sira_zone_recommendations r
WHERE r.status = 'pending'
  AND r.expires_at > now()
ORDER BY
  CASE r.priority
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    ELSE 4
  END,
  r.created_at DESC;

/**
 * View: Zone performance dashboard
 */
CREATE OR REPLACE VIEW v_zone_performance_dashboard AS
SELECT
  p.merchant_id,
  p.zone_identifier,
  SUM(p.total_transactions) as total_txns,
  AVG(p.fraud_rate) as avg_fraud_rate,
  AVG(p.chargeback_rate) as avg_chargeback_rate,
  AVG(p.success_rate) as avg_success_rate,
  SUM(p.total_volume) as total_volume,
  COUNT(DISTINCT p.unique_customers) as total_customers,
  MAX(p.period_end) as last_updated
FROM merchant_zone_performance p
WHERE p.period_start >= (now() - INTERVAL '90 days')
GROUP BY p.merchant_id, p.zone_identifier
ORDER BY total_volume DESC;

-- ============================================================================
-- SAMPLE DATA & INITIAL SETUP
-- ============================================================================

-- Function to initialize zone performance tracking for a merchant
CREATE OR REPLACE FUNCTION initialize_merchant_zone_tracking(p_merchant_id UUID)
RETURNS VOID AS $$
DECLARE
  v_country TEXT;
BEGIN
  -- Get merchant's allowed countries and create initial performance records
  FOR v_country IN
    SELECT UNNEST(allowed_countries)
    FROM merchant_sales_zones
    WHERE merchant_id = p_merchant_id
  LOOP
    INSERT INTO merchant_zone_performance (
      merchant_id,
      zone_type,
      zone_identifier,
      period_start,
      period_end
    ) VALUES (
      p_merchant_id,
      'country',
      v_country,
      date_trunc('day', now()),
      date_trunc('day', now()) + INTERVAL '1 day'
    ) ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE sira_zone_recommendations IS 'AI-generated recommendations for zone management based on fraud, conversion, and growth metrics';
COMMENT ON TABLE merchant_zone_performance IS 'Historical performance tracking per zone for Sira analysis';
COMMENT ON TABLE merchant_zone_restriction_logs IS 'Audit log of all zone restriction changes';

COMMENT ON COLUMN sira_zone_recommendations.confidence_score IS 'Sira confidence in recommendation (0-1, where 1 is highest confidence)';
COMMENT ON COLUMN sira_zone_recommendations.estimated_revenue_impact IS 'Projected revenue impact in merchant currency (positive for expansion, negative for suspension)';

-- ============================================================================
-- GRANTS (adjust based on your role structure)
-- ============================================================================

-- GRANT SELECT, INSERT, UPDATE ON sira_zone_recommendations TO merchant_app;
-- GRANT SELECT ON v_active_sira_recommendations TO merchant_app;
-- GRANT EXECUTE ON FUNCTION get_zone_performance_summary TO merchant_app;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================

-- Summary statistics
DO $$
DECLARE
  table_count INTEGER;
  function_count INTEGER;
  view_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO table_count FROM pg_tables
  WHERE schemaname = 'public'
  AND tablename LIKE '%zone%' OR tablename LIKE '%sira%';

  SELECT COUNT(*) INTO function_count FROM pg_proc
  WHERE proname LIKE '%zone%' OR proname LIKE '%sira%';

  SELECT COUNT(*) INTO view_count FROM pg_views
  WHERE schemaname = 'public'
  AND viewname LIKE '%zone%' OR viewname LIKE '%sira%';

  RAISE NOTICE '=== Brique 75bis Schema Installation Complete ===';
  RAISE NOTICE 'Tables created/extended: %', table_count;
  RAISE NOTICE 'Functions created: %', function_count;
  RAISE NOTICE 'Views created: %', view_count;
  RAISE NOTICE '==============================================';
END $$;
