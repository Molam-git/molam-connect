-- Brique 69 - Analytics Dashboard
-- Migration 001: Core analytics tables and infrastructure

-- ============================================================================
-- 1. FX Rates Table (for multi-currency consolidation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS fx_rates (
  as_of_date DATE NOT NULL,
  base_currency TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  rate NUMERIC(18,8) NOT NULL,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (as_of_date, base_currency, quote_currency)
);

CREATE INDEX IF NOT EXISTS idx_fx_rates_date ON fx_rates(as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_fx_rates_currency ON fx_rates(base_currency, quote_currency);

COMMENT ON TABLE fx_rates IS 'Daily foreign exchange rates for multi-currency analytics';

-- ============================================================================
-- 2. Country-Region Mapping Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS country_regions (
  country_code TEXT PRIMARY KEY,
  country_name TEXT NOT NULL,
  region TEXT NOT NULL,
  sub_region TEXT,
  currency_code TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_country_regions_region ON country_regions(region);

COMMENT ON TABLE country_regions IS 'Mapping of countries to regions (CEDEAO, EU, ASEAN, etc.)';

-- Seed some common regions
INSERT INTO country_regions (country_code, country_name, region, sub_region, currency_code) VALUES
  ('SN', 'Senegal', 'CEDEAO', 'West Africa', 'XOF'),
  ('CI', 'Ivory Coast', 'CEDEAO', 'West Africa', 'XOF'),
  ('FR', 'France', 'EU', 'Western Europe', 'EUR'),
  ('US', 'United States', 'AMERICAS', 'North America', 'USD'),
  ('GB', 'United Kingdom', 'EU', 'Northern Europe', 'GBP'),
  ('NG', 'Nigeria', 'CEDEAO', 'West Africa', 'NGN')
ON CONFLICT (country_code) DO NOTHING;

-- ============================================================================
-- 3. Helper Function: Get Region from Country
-- ============================================================================
CREATE OR REPLACE FUNCTION get_region_from_country(p_country TEXT)
RETURNS TEXT AS $$
DECLARE
  v_region TEXT;
BEGIN
  SELECT region INTO v_region
  FROM country_regions
  WHERE country_code = p_country
  LIMIT 1;

  RETURN COALESCE(v_region, 'GLOBAL');
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_region_from_country IS 'Maps country code to region, returns GLOBAL if not found';

-- ============================================================================
-- 4. Hourly Transaction Aggregates Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS txn_hourly_agg (
  hour TIMESTAMPTZ NOT NULL,
  hour_date DATE NOT NULL,
  region TEXT NOT NULL,
  country TEXT NOT NULL,
  merchant_id UUID,
  agent_id UUID,
  product_id TEXT,
  payment_method TEXT,
  currency TEXT NOT NULL,

  -- Volume metrics
  gross_volume_local NUMERIC(20,6) DEFAULT 0,
  gross_volume_usd NUMERIC(20,6) DEFAULT 0,
  net_revenue_local NUMERIC(20,6) DEFAULT 0,
  net_revenue_usd NUMERIC(20,6) DEFAULT 0,

  -- Fee metrics
  fees_molam_local NUMERIC(20,6) DEFAULT 0,
  fees_molam_usd NUMERIC(20,6) DEFAULT 0,
  fees_partner_local NUMERIC(20,6) DEFAULT 0,
  fees_partner_usd NUMERIC(20,6) DEFAULT 0,

  -- Refund/chargeback metrics
  refunds_local NUMERIC(20,6) DEFAULT 0,
  refunds_usd NUMERIC(20,6) DEFAULT 0,
  chargebacks_local NUMERIC(20,6) DEFAULT 0,
  chargebacks_usd NUMERIC(20,6) DEFAULT 0,

  -- Transaction counts
  tx_count BIGINT DEFAULT 0,
  success_count BIGINT DEFAULT 0,
  failed_count BIGINT DEFAULT 0,
  pending_count BIGINT DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  PRIMARY KEY (hour, region, country, merchant_id, product_id, payment_method)
);

-- Indices for common query patterns
CREATE INDEX IF NOT EXISTS idx_txn_hourly_agg_hour ON txn_hourly_agg(hour DESC);
CREATE INDEX IF NOT EXISTS idx_txn_hourly_agg_date ON txn_hourly_agg(hour_date DESC);
CREATE INDEX IF NOT EXISTS idx_txn_hourly_agg_merchant ON txn_hourly_agg(merchant_id, hour DESC);
CREATE INDEX IF NOT EXISTS idx_txn_hourly_agg_region ON txn_hourly_agg(region, hour DESC);
CREATE INDEX IF NOT EXISTS idx_txn_hourly_agg_country ON txn_hourly_agg(country, hour DESC);
CREATE INDEX IF NOT EXISTS idx_txn_hourly_agg_product ON txn_hourly_agg(product_id, hour DESC) WHERE product_id IS NOT NULL;

COMMENT ON TABLE txn_hourly_agg IS 'Hourly aggregated transaction metrics for analytics';

-- ============================================================================
-- 5. Upsert Function for Hourly Aggregates
-- ============================================================================
CREATE OR REPLACE FUNCTION upsert_hourly_agg(
  p_hour TIMESTAMPTZ,
  p_region TEXT,
  p_country TEXT,
  p_merchant_id UUID,
  p_agent_id UUID,
  p_product_id TEXT,
  p_payment_method TEXT,
  p_currency TEXT,
  p_gross_local NUMERIC,
  p_gross_usd NUMERIC,
  p_net_local NUMERIC,
  p_net_usd NUMERIC,
  p_fee_molam_local NUMERIC,
  p_fee_molam_usd NUMERIC,
  p_fee_partner_local NUMERIC,
  p_fee_partner_usd NUMERIC,
  p_refund_local NUMERIC,
  p_refund_usd NUMERIC,
  p_chargeback_local NUMERIC,
  p_chargeback_usd NUMERIC,
  p_tx_count BIGINT,
  p_success_count BIGINT,
  p_failed_count BIGINT,
  p_pending_count BIGINT
) RETURNS VOID AS $$
DECLARE
  v_hour TIMESTAMPTZ;
  v_hour_date DATE;
BEGIN
  v_hour := date_trunc('hour', p_hour);
  v_hour_date := (v_hour AT TIME ZONE 'UTC')::date;

  INSERT INTO txn_hourly_agg (
    hour, hour_date, region, country, merchant_id, agent_id, product_id, payment_method, currency,
    gross_volume_local, gross_volume_usd, net_revenue_local, net_revenue_usd,
    fees_molam_local, fees_molam_usd, fees_partner_local, fees_partner_usd,
    refunds_local, refunds_usd, chargebacks_local, chargebacks_usd,
    tx_count, success_count, failed_count, pending_count,
    created_at, updated_at
  ) VALUES (
    v_hour, v_hour_date, p_region, p_country, p_merchant_id, p_agent_id, p_product_id, p_payment_method, p_currency,
    p_gross_local, p_gross_usd, p_net_local, p_net_usd,
    p_fee_molam_local, p_fee_molam_usd, p_fee_partner_local, p_fee_partner_usd,
    p_refund_local, p_refund_usd, p_chargeback_local, p_chargeback_usd,
    p_tx_count, p_success_count, p_failed_count, p_pending_count,
    now(), now()
  )
  ON CONFLICT (hour, region, country, merchant_id, product_id, payment_method)
  DO UPDATE SET
    gross_volume_local = txn_hourly_agg.gross_volume_local + EXCLUDED.gross_volume_local,
    gross_volume_usd = txn_hourly_agg.gross_volume_usd + EXCLUDED.gross_volume_usd,
    net_revenue_local = txn_hourly_agg.net_revenue_local + EXCLUDED.net_revenue_local,
    net_revenue_usd = txn_hourly_agg.net_revenue_usd + EXCLUDED.net_revenue_usd,
    fees_molam_local = txn_hourly_agg.fees_molam_local + EXCLUDED.fees_molam_local,
    fees_molam_usd = txn_hourly_agg.fees_molam_usd + EXCLUDED.fees_molam_usd,
    fees_partner_local = txn_hourly_agg.fees_partner_local + EXCLUDED.fees_partner_local,
    fees_partner_usd = txn_hourly_agg.fees_partner_usd + EXCLUDED.fees_partner_usd,
    refunds_local = txn_hourly_agg.refunds_local + EXCLUDED.refunds_local,
    refunds_usd = txn_hourly_agg.refunds_usd + EXCLUDED.refunds_usd,
    chargebacks_local = txn_hourly_agg.chargebacks_local + EXCLUDED.chargebacks_local,
    chargebacks_usd = txn_hourly_agg.chargebacks_usd + EXCLUDED.chargebacks_usd,
    tx_count = txn_hourly_agg.tx_count + EXCLUDED.tx_count,
    success_count = txn_hourly_agg.success_count + EXCLUDED.success_count,
    failed_count = txn_hourly_agg.failed_count + EXCLUDED.failed_count,
    pending_count = txn_hourly_agg.pending_count + EXCLUDED.pending_count,
    updated_at = now();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION upsert_hourly_agg IS 'Upserts hourly transaction aggregates (incremental updates)';

-- ============================================================================
-- 6. Daily Aggregates Materialized View
-- ============================================================================
-- Note: This assumes wallet_transactions table exists from previous briques
-- If not, create a mock table for development

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_txn_daily_agg AS
SELECT
  (date_trunc('day', wt.occurred_at) AT TIME ZONE 'UTC')::date AS day,
  COALESCE(get_region_from_country(wt.country), 'GLOBAL') AS region,
  COALESCE(wt.country, 'UNKNOWN') AS country,
  wt.merchant_id,
  wt.agent_id,
  wt.product_id,
  wt.payment_method,
  COALESCE(wt.currency, 'USD') AS currency,

  -- Local currency aggregates
  SUM(CASE WHEN wt.status = 'succeeded' THEN wt.amount ELSE 0 END) AS gross_volume_local,
  SUM(CASE WHEN wt.status = 'succeeded' THEN (wt.amount - COALESCE(wt.fee_molam, 0) - COALESCE(wt.fee_partner, 0)) ELSE 0 END) AS net_revenue_local,
  SUM(CASE WHEN wt.status = 'succeeded' THEN COALESCE(wt.fee_molam, 0) ELSE 0 END) AS fees_molam_local,
  SUM(CASE WHEN wt.status = 'succeeded' THEN COALESCE(wt.fee_partner, 0) ELSE 0 END) AS fees_partner_local,
  SUM(CASE WHEN wt.status = 'refunded' THEN wt.amount ELSE 0 END) AS refunds_local,

  -- USD equivalents (joined with fx_rates)
  SUM(CASE WHEN wt.status = 'succeeded' THEN wt.amount * COALESCE(fx.rate, 1) ELSE 0 END) AS gross_volume_usd,
  SUM(CASE WHEN wt.status = 'succeeded' THEN (wt.amount - COALESCE(wt.fee_molam, 0) - COALESCE(wt.fee_partner, 0)) * COALESCE(fx.rate, 1) ELSE 0 END) AS net_revenue_usd,
  SUM(CASE WHEN wt.status = 'succeeded' THEN COALESCE(wt.fee_molam, 0) * COALESCE(fx.rate, 1) ELSE 0 END) AS fees_molam_usd,

  -- Counts
  COUNT(*) AS tx_count,
  COUNT(*) FILTER (WHERE wt.status = 'succeeded') AS success_count,
  COUNT(*) FILTER (WHERE wt.status = 'failed') AS failed_count

FROM wallet_transactions wt
LEFT JOIN fx_rates fx ON
  fx.as_of_date = (date_trunc('day', wt.occurred_at) AT TIME ZONE 'UTC')::date
  AND fx.base_currency = wt.currency
  AND fx.quote_currency = 'USD'
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_txn_daily_agg_pk
ON mv_txn_daily_agg(day, region, country, merchant_id, product_id, payment_method);

CREATE INDEX IF NOT EXISTS idx_mv_txn_daily_agg_day ON mv_txn_daily_agg(day DESC);
CREATE INDEX IF NOT EXISTS idx_mv_txn_daily_agg_merchant ON mv_txn_daily_agg(merchant_id, day DESC);
CREATE INDEX IF NOT EXISTS idx_mv_txn_daily_agg_region ON mv_txn_daily_agg(region, day DESC);

COMMENT ON MATERIALIZED VIEW mv_txn_daily_agg IS 'Daily rollup of transaction metrics from wallet_transactions';

-- ============================================================================
-- 7. Analytics Alerts Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS analytics_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL, -- 'sira', 'rule', 'manual'
  alert_type TEXT NOT NULL, -- 'anomaly', 'threshold', 'pattern'

  -- Scope
  merchant_id UUID,
  region TEXT,
  country TEXT,
  product_id TEXT,

  -- Alert details
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'critical')),
  metric TEXT NOT NULL,
  current_value NUMERIC,
  threshold_value NUMERIC,
  deviation_percent NUMERIC,

  -- Description and payload
  title TEXT NOT NULL,
  description TEXT,
  payload JSONB,

  -- Recommendations
  recommended_action TEXT,
  auto_action_taken BOOLEAN DEFAULT false,

  -- Status
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'investigating', 'resolved', 'closed', 'false_positive')),
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_alerts_merchant ON analytics_alerts(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_alerts_status ON analytics_alerts(status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_alerts_created ON analytics_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_alerts_severity ON analytics_alerts(severity, created_at DESC) WHERE status = 'open';

COMMENT ON TABLE analytics_alerts IS 'Operational alerts from analytics rules and SIRA anomaly detection';

-- ============================================================================
-- 8. Alert Rules Configuration Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS analytics_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,

  -- Rule scope
  merchant_id UUID, -- NULL = applies to all merchants
  region TEXT,
  country TEXT,

  -- Rule definition
  metric TEXT NOT NULL, -- 'refund_rate', 'chargeback_rate', 'volume_spike', etc.
  comparator TEXT NOT NULL CHECK (comparator IN ('>', '<', '>=', '<=', '=', '!=')),
  threshold NUMERIC NOT NULL,
  window_minutes INTEGER NOT NULL DEFAULT 60,

  -- Alert configuration
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'critical')),
  notify_channels JSONB, -- ['email', 'sms', 'webhook']
  webhook_url TEXT,

  -- Auto-actions
  auto_actions JSONB, -- {'pause_payouts': true, 'flag_merchant': true}

  -- Status
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_alert_rules_active ON analytics_alert_rules(is_active, metric);
CREATE INDEX IF NOT EXISTS idx_analytics_alert_rules_merchant ON analytics_alert_rules(merchant_id) WHERE merchant_id IS NOT NULL;

COMMENT ON TABLE analytics_alert_rules IS 'Configurable alert rules for operational monitoring';

-- ============================================================================
-- 9. Seed Default FX Rates (USD as base)
-- ============================================================================
INSERT INTO fx_rates (as_of_date, base_currency, quote_currency, rate, source) VALUES
  (CURRENT_DATE, 'USD', 'USD', 1.00000000, 'system'),
  (CURRENT_DATE, 'EUR', 'USD', 1.08000000, 'manual'),
  (CURRENT_DATE, 'GBP', 'USD', 1.27000000, 'manual'),
  (CURRENT_DATE, 'XOF', 'USD', 0.00163000, 'manual'),
  (CURRENT_DATE, 'NGN', 'USD', 0.00130000, 'manual')
ON CONFLICT (as_of_date, base_currency, quote_currency) DO NOTHING;

-- ============================================================================
-- 10. Create update timestamp trigger function
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER update_fx_rates_updated_at BEFORE UPDATE ON fx_rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_country_regions_updated_at BEFORE UPDATE ON country_regions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_analytics_alerts_updated_at BEFORE UPDATE ON analytics_alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_analytics_alert_rules_updated_at BEFORE UPDATE ON analytics_alert_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Migration Complete
-- ============================================================================
