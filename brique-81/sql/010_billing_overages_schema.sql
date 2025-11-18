-- =====================================================================
-- Brique 81: Dynamic Billing for Rate Limit Overages
-- =====================================================================
-- Automatically capture quota overages and convert to billing charges
-- Features:
--   - Idempotent event processing (Kafka → PostgreSQL)
--   - Multi-currency pricing with fallback hierarchy
--   - Ops override capabilities (void, credit, adjust)
--   - SIRA integration for trend analysis
--   - Complete audit trail
-- Date: 2025-11-12
-- =====================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- 1. Raw Overage Events (Idempotent Storage)
-- =====================================================================

CREATE TABLE IF NOT EXISTS billing_overage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Idempotency
  event_id TEXT NOT NULL UNIQUE,   -- External event ID (ULID/KSUID/UUID)

  -- Tenant context
  tenant_type TEXT NOT NULL,       -- 'merchant' | 'agent'
  tenant_id UUID NOT NULL,
  api_key_id UUID,                 -- Optional, null for tenant-level overages

  -- Plan context
  plan_id TEXT,                    -- Rate limit plan identifier

  -- Overage details
  metric TEXT NOT NULL,            -- 'api_calls' | 'bandwidth_gb' | 'burst' | 'daily_quota' | 'monthly_quota'
  unit_count NUMERIC(18,6) NOT NULL DEFAULT 0,

  -- Optional price snapshot (from event)
  unit_price NUMERIC(18,8),        -- Price per unit if provided in event
  currency TEXT,                   -- Currency of unit_price if provided

  -- Location context
  country TEXT,                    -- Tenant country for pricing rules

  -- Additional context
  context JSONB DEFAULT '{}'::jsonb,  -- Route, resource, extra metadata
  /*
    Example context:
    {
      "endpoint": "/payments/create",
      "method": "POST",
      "ip_address": "192.168.1.1",
      "region": "eu-west-1",
      "triggered_by": "daily_quota_exceeded"
    }
  */

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT billing_overage_events_metric_check CHECK (metric IN (
    'api_calls', 'bandwidth_gb', 'burst', 'daily_quota', 'monthly_quota', 'concurrent_requests', 'custom'
  ))
);

CREATE INDEX idx_billing_overage_events_tenant ON billing_overage_events(tenant_type, tenant_id);
CREATE INDEX idx_billing_overage_events_event_id ON billing_overage_events(event_id);
CREATE INDEX idx_billing_overage_events_created_at ON billing_overage_events(created_at DESC);
CREATE INDEX idx_billing_overage_events_metric ON billing_overage_events(metric);

COMMENT ON TABLE billing_overage_events IS 'Raw overage events from Kafka (idempotent by event_id)';
COMMENT ON COLUMN billing_overage_events.event_id IS 'External idempotency key (ULID/KSUID/UUID)';
COMMENT ON COLUMN billing_overage_events.context IS 'Additional context (route, IP, region, etc.)';

-- =====================================================================
-- 2. Normalized Overage Charges
-- =====================================================================

CREATE TYPE overage_status_enum AS ENUM (
  'open',            -- Overage recorded, not yet billed
  'billed',          -- Included in an invoice
  'voided',          -- Cancelled by Ops
  'credit_issued',   -- Credit note issued
  'disputed',        -- Under dispute
  'refunded'         -- Refunded to merchant
);

CREATE TABLE IF NOT EXISTS billing_overages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Idempotency (same as raw event)
  event_id TEXT NOT NULL UNIQUE,

  -- Link to billing system
  charge_id UUID,                  -- Link to billing_charges.id once created
  invoice_id UUID,                 -- Link to invoice once billed

  -- Tenant context
  tenant_type TEXT NOT NULL,
  tenant_id UUID NOT NULL,
  api_key_id UUID,

  -- Overage details
  metric TEXT NOT NULL,
  unit_count NUMERIC(18,6) NOT NULL,

  -- Pricing (in billing currency)
  unit_price NUMERIC(18,8) NOT NULL,    -- Price per unit in billing currency
  currency TEXT NOT NULL,                -- Billing currency (e.g., USD, EUR, XOF)
  amount NUMERIC(18,2) NOT NULL,         -- unit_count * unit_price (rounded to cents)

  -- Tax (if applicable)
  tax_rate NUMERIC(6,4) DEFAULT 0,       -- Tax rate (e.g., 0.20 for 20%)
  tax_amount NUMERIC(18,2) DEFAULT 0,    -- Computed tax
  total_amount NUMERIC(18,2) NOT NULL,   -- amount + tax_amount

  -- Status
  status overage_status_enum NOT NULL DEFAULT 'open',

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,    -- Additional metadata (plan_name, api_key_name, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  billed_at TIMESTAMPTZ,                 -- When included in invoice

  -- Constraints
  CONSTRAINT billing_overages_amount_positive CHECK (amount >= 0),
  CONSTRAINT billing_overages_total_positive CHECK (total_amount >= 0)
);

CREATE INDEX idx_billing_overages_tenant ON billing_overages(tenant_type, tenant_id);
CREATE INDEX idx_billing_overages_status ON billing_overages(status) WHERE status IN ('open', 'billed');
CREATE INDEX idx_billing_overages_created_at ON billing_overages(created_at DESC);
CREATE INDEX idx_billing_overages_charge_id ON billing_overages(charge_id) WHERE charge_id IS NOT NULL;
CREATE INDEX idx_billing_overages_invoice_id ON billing_overages(invoice_id) WHERE invoice_id IS NOT NULL;

-- Trigger for updated_at
CREATE TRIGGER billing_overages_updated_at
  BEFORE UPDATE ON billing_overages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE billing_overages IS 'Normalized overage charges linked to billing system';
COMMENT ON COLUMN billing_overages.event_id IS 'Idempotency key (matches billing_overage_events.event_id)';
COMMENT ON COLUMN billing_overages.charge_id IS 'Link to billing_charges table';

-- =====================================================================
-- 3. Overage Pricing Rules
-- =====================================================================

CREATE TABLE IF NOT EXISTS overage_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Pricing hierarchy (most specific to least specific)
  plan_id TEXT,                     -- Specific plan, NULL = default for all plans
  country TEXT,                     -- Specific country (ISO 3166-1 alpha-2), NULL = global
  metric TEXT NOT NULL,             -- 'api_calls', 'bandwidth_gb', 'burst', etc.

  -- Pricing formula
  fixed_amount NUMERIC(18,6) DEFAULT 0,      -- Fixed cost per unit (e.g., $0.01 per API call)
  percent_amount NUMERIC(6,4) DEFAULT 0,     -- Percentage surcharge (reserved for future use)

  -- Currency and status
  currency TEXT NOT NULL DEFAULT 'USD',
  active BOOLEAN NOT NULL DEFAULT true,

  -- Effective dates
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,                         -- NULL = no end date

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT overage_pricing_dates_check CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT overage_pricing_metric_check CHECK (metric IN (
    'api_calls', 'bandwidth_gb', 'burst', 'daily_quota', 'monthly_quota', 'concurrent_requests', 'custom'
  ))
);

CREATE INDEX idx_overage_pricing_lookup ON overage_pricing(metric, plan_id, country, active)
  WHERE active = true;
CREATE INDEX idx_overage_pricing_effective ON overage_pricing(effective_from, effective_to)
  WHERE active = true;

-- Trigger for updated_at
CREATE TRIGGER overage_pricing_updated_at
  BEFORE UPDATE ON overage_pricing
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE overage_pricing IS 'Pricing rules for overages with fallback hierarchy (plan > country > global)';
COMMENT ON COLUMN overage_pricing.plan_id IS 'NULL = default for all plans';
COMMENT ON COLUMN overage_pricing.country IS 'NULL = global pricing';

-- =====================================================================
-- 4. Overage Overrides (Ops Actions)
-- =====================================================================

CREATE TYPE overage_override_action_enum AS ENUM (
  'credit',          -- Issue credit note
  'void',            -- Void the charge
  'adjust_price',    -- Adjust unit price or total amount
  'adjust_units',    -- Adjust unit count
  'dispute_resolve', -- Resolve dispute
  'manual_bill',     -- Force billing
  'other'
);

CREATE TABLE IF NOT EXISTS overage_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target overage
  overage_id UUID NOT NULL REFERENCES billing_overages(id) ON DELETE CASCADE,

  -- Actor (Ops user)
  actor_id UUID NOT NULL,          -- Molam ID user ID
  actor_email TEXT,                -- For audit trail

  -- Action
  action overage_override_action_enum NOT NULL,

  -- Details
  payload JSONB DEFAULT '{}'::jsonb,
  /*
    Example payloads:
    - credit: { "amount": 10.50, "reason": "Goodwill gesture" }
    - void: { "reason": "Billing error" }
    - adjust_price: { "old_amount": 100.00, "new_amount": 50.00, "reason": "Special discount" }
    - adjust_units: { "old_units": 1000, "new_units": 500, "reason": "Incorrect calculation" }
  */

  reason TEXT,                     -- Human-readable reason

  -- Approval workflow (optional)
  approved_by UUID,
  approved_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_overage_overrides_overage ON overage_overrides(overage_id);
CREATE INDEX idx_overage_overrides_actor ON overage_overrides(actor_id);
CREATE INDEX idx_overage_overrides_action ON overage_overrides(action);
CREATE INDEX idx_overage_overrides_created_at ON overage_overrides(created_at DESC);

COMMENT ON TABLE overage_overrides IS 'Audit trail for Ops actions on overages';
COMMENT ON COLUMN overage_overrides.payload IS 'Action-specific data (amounts, reasons, etc.)';

-- =====================================================================
-- 5. Aggregation Configuration (Tenant-level)
-- =====================================================================

CREATE TYPE aggregation_window_enum AS ENUM (
  'realtime',  -- Create charge immediately for each event
  'hourly',    -- Aggregate events hourly
  'daily',     -- Aggregate events daily
  'monthly'    -- Aggregate events monthly
);

CREATE TABLE IF NOT EXISTS overage_aggregation_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant context
  tenant_type TEXT NOT NULL,
  tenant_id UUID NOT NULL,
  metric TEXT NOT NULL,

  -- Aggregation settings
  aggregation_window aggregation_window_enum NOT NULL DEFAULT 'hourly',

  -- Threshold (only create charge if total exceeds this)
  threshold NUMERIC(18,6) DEFAULT 0,

  -- Metadata
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Unique constraint
  CONSTRAINT overage_aggregation_config_unique UNIQUE (tenant_type, tenant_id, metric)
);

CREATE INDEX idx_overage_aggregation_config_tenant ON overage_aggregation_config(tenant_type, tenant_id);

-- Trigger for updated_at
CREATE TRIGGER overage_aggregation_config_updated_at
  BEFORE UPDATE ON overage_aggregation_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE overage_aggregation_config IS 'Per-tenant configuration for overage aggregation';
COMMENT ON COLUMN overage_aggregation_config.threshold IS 'Minimum units to trigger billing';

-- =====================================================================
-- 6. SIRA Trend Analysis (Overage Patterns)
-- =====================================================================

CREATE TABLE IF NOT EXISTS overage_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Analysis window
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,

  -- Tenant context
  tenant_type TEXT NOT NULL,
  tenant_id UUID NOT NULL,
  metric TEXT NOT NULL,

  -- Metrics
  total_units NUMERIC(18,6) NOT NULL,
  total_amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  event_count INTEGER NOT NULL,

  -- Growth metrics
  growth_rate NUMERIC(6,4),         -- Week-over-week growth (e.g., 0.25 = 25% growth)
  anomaly_score NUMERIC(6,4),       -- SIRA anomaly score (0-1)

  -- SIRA recommendations
  recommendations JSONB DEFAULT '[]'::jsonb,
  /*
    Example:
    [
      {
        "type": "upgrade_plan",
        "confidence": 0.85,
        "reason": "Consistent overage pattern",
        "suggested_plan": "business"
      },
      {
        "type": "notify_ops",
        "confidence": 0.95,
        "reason": "Unusual spike in bandwidth usage"
      }
    ]
  */

  -- Status
  reviewed BOOLEAN DEFAULT false,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_overage_trends_tenant ON overage_trends(tenant_type, tenant_id);
CREATE INDEX idx_overage_trends_window ON overage_trends(window_start, window_end);
CREATE INDEX idx_overage_trends_reviewed ON overage_trends(reviewed) WHERE reviewed = false;

COMMENT ON TABLE overage_trends IS 'SIRA analysis of overage patterns for recommendations';
COMMENT ON COLUMN overage_trends.recommendations IS 'SIRA-generated recommendations (JSON array)';

-- =====================================================================
-- 7. Functions
-- =====================================================================

-- Function: Get overage pricing with fallback
CREATE OR REPLACE FUNCTION get_overage_pricing(
  p_plan_id TEXT,
  p_country TEXT,
  p_metric TEXT
) RETURNS TABLE (
  unit_price NUMERIC(18,8),
  currency TEXT
) AS $$
BEGIN
  -- Try to find most specific pricing rule with fallback hierarchy:
  -- 1. plan_id + country + metric
  -- 2. plan_id + metric (country = NULL)
  -- 3. country + metric (plan_id = NULL)
  -- 4. metric only (plan_id = NULL AND country = NULL)

  RETURN QUERY
  SELECT
    op.fixed_amount AS unit_price,
    op.currency
  FROM overage_pricing op
  WHERE op.metric = p_metric
    AND op.active = true
    AND (op.plan_id = p_plan_id OR op.plan_id IS NULL)
    AND (op.country = p_country OR op.country IS NULL)
    AND (op.effective_from <= CURRENT_DATE)
    AND (op.effective_to IS NULL OR op.effective_to >= CURRENT_DATE)
  ORDER BY
    -- Prioritize more specific matches
    CASE WHEN op.plan_id IS NOT NULL AND op.country IS NOT NULL THEN 0
         WHEN op.plan_id IS NOT NULL AND op.country IS NULL THEN 1
         WHEN op.plan_id IS NULL AND op.country IS NOT NULL THEN 2
         ELSE 3
    END,
    op.effective_from DESC
  LIMIT 1;

  -- If no pricing found, return error
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pricing found for metric: %, plan: %, country: %', p_metric, p_plan_id, p_country;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_overage_pricing IS 'Get overage pricing with fallback hierarchy (plan+country > plan > country > global)';

-- Function: Compute overage amount
CREATE OR REPLACE FUNCTION compute_overage_amount(
  p_unit_count NUMERIC(18,6),
  p_unit_price NUMERIC(18,8),
  p_tax_rate NUMERIC(6,4) DEFAULT 0
) RETURNS TABLE (
  amount NUMERIC(18,2),
  tax_amount NUMERIC(18,2),
  total_amount NUMERIC(18,2)
) AS $$
DECLARE
  v_amount NUMERIC(18,2);
  v_tax_amount NUMERIC(18,2);
  v_total_amount NUMERIC(18,2);
BEGIN
  -- Compute base amount (rounded to cents)
  v_amount := ROUND(p_unit_count * p_unit_price, 2);

  -- Compute tax
  v_tax_amount := ROUND(v_amount * p_tax_rate, 2);

  -- Compute total
  v_total_amount := v_amount + v_tax_amount;

  RETURN QUERY SELECT v_amount, v_tax_amount, v_total_amount;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION compute_overage_amount IS 'Compute overage amount with tax';

-- Function: Aggregate overages for a tenant/window
CREATE OR REPLACE FUNCTION aggregate_overages_for_billing(
  p_tenant_id UUID,
  p_window_start TIMESTAMPTZ,
  p_window_end TIMESTAMPTZ
) RETURNS TABLE (
  metric TEXT,
  total_units NUMERIC(18,6),
  total_amount NUMERIC(18,2),
  currency TEXT,
  event_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.metric,
    SUM(o.unit_count) AS total_units,
    SUM(o.amount) AS total_amount,
    o.currency,
    COUNT(*) AS event_count
  FROM billing_overages o
  WHERE o.tenant_id = p_tenant_id
    AND o.status = 'open'
    AND o.created_at >= p_window_start
    AND o.created_at < p_window_end
  GROUP BY o.metric, o.currency;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION aggregate_overages_for_billing IS 'Aggregate open overages for a tenant within a time window';

-- =====================================================================
-- 8. Seed Data (Default Pricing)
-- =====================================================================

-- Global default pricing (USD)
INSERT INTO overage_pricing (metric, fixed_amount, currency, effective_from)
VALUES
  ('api_calls', 0.001, 'USD', CURRENT_DATE),           -- $0.001 per API call
  ('bandwidth_gb', 0.10, 'USD', CURRENT_DATE),         -- $0.10 per GB
  ('burst', 0.005, 'USD', CURRENT_DATE),               -- $0.005 per burst request
  ('daily_quota', 0.001, 'USD', CURRENT_DATE),         -- $0.001 per request over daily quota
  ('monthly_quota', 0.001, 'USD', CURRENT_DATE),       -- $0.001 per request over monthly quota
  ('concurrent_requests', 0.01, 'USD', CURRENT_DATE)   -- $0.01 per concurrent request over limit
ON CONFLICT DO NOTHING;

-- Regional pricing (Europe - EUR)
INSERT INTO overage_pricing (metric, country, fixed_amount, currency, effective_from)
VALUES
  ('api_calls', 'FR', 0.0009, 'EUR', CURRENT_DATE),
  ('api_calls', 'DE', 0.0009, 'EUR', CURRENT_DATE),
  ('bandwidth_gb', 'FR', 0.09, 'EUR', CURRENT_DATE),
  ('bandwidth_gb', 'DE', 0.09, 'EUR', CURRENT_DATE)
ON CONFLICT DO NOTHING;

-- Regional pricing (Africa - XOF)
INSERT INTO overage_pricing (metric, country, fixed_amount, currency, effective_from)
VALUES
  ('api_calls', 'CI', 0.5, 'XOF', CURRENT_DATE),      -- 0.5 XOF per API call (~$0.0008)
  ('api_calls', 'SN', 0.5, 'XOF', CURRENT_DATE),
  ('bandwidth_gb', 'CI', 50.0, 'XOF', CURRENT_DATE),  -- 50 XOF per GB (~$0.08)
  ('bandwidth_gb', 'SN', 50.0, 'XOF', CURRENT_DATE)
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 9. Views
-- =====================================================================

-- View: Open overages summary
CREATE OR REPLACE VIEW v_overages_open AS
SELECT
  o.id,
  o.tenant_type,
  o.tenant_id,
  o.metric,
  o.unit_count,
  o.unit_price,
  o.currency,
  o.amount,
  o.total_amount,
  o.status,
  o.created_at,
  oe.event_id,
  oe.context
FROM billing_overages o
JOIN billing_overage_events oe ON oe.event_id = o.event_id
WHERE o.status = 'open'
ORDER BY o.created_at DESC;

COMMENT ON VIEW v_overages_open IS 'Open overages with event context';

-- View: Overage summary by tenant/metric
CREATE OR REPLACE VIEW v_overage_summary AS
SELECT
  tenant_type,
  tenant_id,
  metric,
  currency,
  COUNT(*) AS total_count,
  SUM(unit_count) AS total_units,
  SUM(amount) AS total_amount,
  SUM(total_amount) AS total_with_tax,
  AVG(unit_price) AS avg_unit_price,
  MIN(created_at) AS first_overage,
  MAX(created_at) AS last_overage
FROM billing_overages
WHERE status IN ('open', 'billed')
GROUP BY tenant_type, tenant_id, metric, currency;

COMMENT ON VIEW v_overage_summary IS 'Overage summary statistics by tenant and metric';

-- =====================================================================
-- END OF SCHEMA
-- =====================================================================

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Brique 81 - Dynamic Billing for Rate Limit Overages schema created successfully';
  RAISE NOTICE '   Tables: billing_overage_events, billing_overages, overage_pricing, overage_overrides, overage_aggregation_config, overage_trends';
  RAISE NOTICE '   Functions: get_overage_pricing, compute_overage_amount, aggregate_overages_for_billing';
  RAISE NOTICE '   Views: v_overages_open, v_overage_summary';
  RAISE NOTICE '   Seed data: Default pricing for 6 metrics + regional pricing (EUR, XOF)';
END $$;
