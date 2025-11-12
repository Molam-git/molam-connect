-- =====================================================================
-- Brique 77 - Dashboard Unifié Molam Pay (Wallet + Connect)
-- =====================================================================
-- Version: 1.0.0
-- Date: 2025-11-12
-- Description: Industrial real-time dashboard with aggregations, snapshots,
--              ops actions, SIRA integration, and RBAC
-- =====================================================================

-- =====================================================================
-- EXTENSION & SETUP
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "postgis"; -- For agent map geospatial

-- =====================================================================
-- ENUM TYPES
-- =====================================================================

-- Tenant types
CREATE TYPE dash_tenant_type AS ENUM (
  'platform',      -- Global platform view
  'merchant',      -- Per-merchant view
  'agent',         -- Per-agent view
  'bank',          -- Per-bank view
  'region'         -- Per-region view (WAEMU, EU, etc.)
);

-- Ops action types
CREATE TYPE ops_action_type AS ENUM (
  'PAUSE_PAYOUT',           -- Pause payouts for a bank/merchant
  'RESUME_PAYOUT',          -- Resume payouts
  'FREEZE_MERCHANT',        -- Freeze all merchant operations
  'UNFREEZE_MERCHANT',      -- Unfreeze merchant
  'EXECUTE_PLAN',           -- Execute a generated plan
  'REQUEUE_DLQ',           -- Requeue dead letter queue items
  'FORCE_RETRY_PAYOUT',    -- Force retry a specific payout
  'ISSUE_MANUAL_REFUND',   -- Issue manual refund
  'ADJUST_FLOAT',          -- Adjust agent/merchant float
  'APPLY_SIRA_RECOMMENDATION', -- Apply SIRA recommendation
  'EMERGENCY_SHUTDOWN',    -- Emergency shutdown (requires multi-sig)
  'UPDATE_RISK_THRESHOLD', -- Update risk thresholds
  'ROUTE_PAYOUT_OVERRIDE'  -- Override payout routing
);

-- Ops action status
CREATE TYPE ops_action_status AS ENUM (
  'requested',
  'pending_approval',
  'approved',
  'rejected',
  'executing',
  'executed',
  'failed',
  'rolled_back'
);

-- Widget types
CREATE TYPE dash_widget_kind AS ENUM (
  'chart_line',
  'chart_bar',
  'chart_pie',
  'gauge',
  'table',
  'list',
  'map',
  'metric',
  'alert_list',
  'timeline',
  'heatmap'
);

-- Alert severity
CREATE TYPE alert_severity AS ENUM (
  'critical',
  'high',
  'medium',
  'low',
  'info'
);

-- =====================================================================
-- CORE TABLES
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. DASHBOARD AGGREGATES (Time-Bucketed)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dash_aggregates_hourly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Time bucket
  bucket_ts TIMESTAMPTZ NOT NULL, -- Start of hour

  -- Tenant scope
  tenant_type dash_tenant_type NOT NULL,
  tenant_id UUID,                  -- NULL for platform

  -- Geographic scope
  country TEXT,
  region TEXT,                     -- e.g., 'WAEMU', 'EU', 'ASEAN'
  city TEXT,

  -- Currency
  currency TEXT NOT NULL DEFAULT 'XOF',

  -- Metrics: Volume
  gmv NUMERIC(20,2) DEFAULT 0,              -- Gross Merchandise Volume
  transaction_count BIGINT DEFAULT 0,
  unique_customers BIGINT DEFAULT 0,

  -- Metrics: Revenue
  net_revenue NUMERIC(20,2) DEFAULT 0,
  total_fees NUMERIC(20,2) DEFAULT 0,       -- Molam fees
  partner_fees NUMERIC(20,2) DEFAULT 0,     -- Partner fees (banks, MNOs)

  -- Metrics: Refunds & Disputes
  refunds_amount NUMERIC(20,2) DEFAULT 0,
  refunds_count BIGINT DEFAULT 0,
  disputes_count BIGINT DEFAULT 0,
  disputes_amount NUMERIC(20,2) DEFAULT 0,
  chargebacks_count BIGINT DEFAULT 0,

  -- Metrics: Payouts
  payouts_amount NUMERIC(20,2) DEFAULT 0,
  payouts_count BIGINT DEFAULT 0,
  payout_pending_count BIGINT DEFAULT 0,
  payout_pending_amount NUMERIC(20,2) DEFAULT 0,
  payout_failed_count BIGINT DEFAULT 0,

  -- Metrics: Float & Treasury
  float_available NUMERIC(20,2) DEFAULT 0,
  float_reserved NUMERIC(20,2) DEFAULT 0,
  float_distributed NUMERIC(20,2) DEFAULT 0, -- For agents

  -- Metrics: Reconciliation
  reconciliation_match_rate NUMERIC(5,4) DEFAULT 1.0, -- 0-1

  -- Metrics: Conversion & Success
  conversion_rate NUMERIC(5,4) DEFAULT 0,    -- Payment success rate
  fraud_rate NUMERIC(5,4) DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Unique constraint per bucket + tenant
  UNIQUE(bucket_ts, tenant_type, tenant_id, country, region, currency)
);

-- Indexes
CREATE INDEX idx_dash_agg_bucket ON dash_aggregates_hourly(bucket_ts DESC);
CREATE INDEX idx_dash_agg_tenant ON dash_aggregates_hourly(tenant_type, tenant_id, bucket_ts DESC);
CREATE INDEX idx_dash_agg_country ON dash_aggregates_hourly(country, bucket_ts DESC);
CREATE INDEX idx_dash_agg_region ON dash_aggregates_hourly(region, bucket_ts DESC);
CREATE INDEX idx_dash_agg_currency ON dash_aggregates_hourly(currency);

COMMENT ON TABLE dash_aggregates_hourly IS 'Hourly aggregated metrics for dashboard (time-bucketed for fast queries)';

-- ---------------------------------------------------------------------
-- 2. DASHBOARD SNAPSHOTS (Fast Lookup)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dash_snapshots (
  tenant_type dash_tenant_type NOT NULL,
  tenant_id UUID,

  -- Snapshot timestamp
  snapshot_ts TIMESTAMPTZ NOT NULL,

  -- Precomputed KPIs (JSONB for flexibility)
  payload JSONB NOT NULL,

  -- Example payload structure:
  -- {
  --   "gmv": 1000000,
  --   "net_revenue": 25000,
  --   "fees": 25000,
  --   "refunds": 5000,
  --   "disputes": 10,
  --   "payouts_pending": 50000,
  --   "float_available": 100000,
  --   "conversion_rate": 0.95,
  --   "fraud_rate": 0.02,
  --   "top_countries": [{"country": "SN", "gmv": 500000}, ...],
  --   "recent_transactions": [...],
  --   "alerts": [...]
  -- }

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  PRIMARY KEY (tenant_type, tenant_id)
);

-- Index for fast lookup
CREATE INDEX idx_dash_snapshots_ts ON dash_snapshots(snapshot_ts DESC);

COMMENT ON TABLE dash_snapshots IS 'Fast lookup snapshots with precomputed KPIs (updated every 1-5 minutes)';

-- ---------------------------------------------------------------------
-- 3. OPS ACTIONS (Operator Actions & Audit)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ops_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Actor (who requested)
  actor_id UUID NOT NULL,
  actor_role TEXT NOT NULL,
  actor_email TEXT,

  -- Action details
  action_type ops_action_type NOT NULL,

  -- Target (what/who is affected)
  target JSONB NOT NULL,
  -- Example: {"merchant_id": "...", "bank_profile_id": "..."}

  -- Parameters
  params JSONB DEFAULT '{}'::JSONB,
  -- Example: {"duration": "24h", "reason": "High fraud rate"}

  -- Status
  status ops_action_status DEFAULT 'requested',

  -- Approval workflow (multi-sig)
  required_approvals INTEGER DEFAULT 1,
  approvals JSONB DEFAULT '[]'::JSONB,
  -- Example: [{"approver_id": "...", "approved_at": "...", "comment": "..."}]

  -- Execution
  executed_at TIMESTAMPTZ,
  executed_by UUID,
  execution_result JSONB,

  -- Error handling
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Audit & Safety
  risk_level TEXT DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  auto_approved BOOLEAN DEFAULT false,
  reversal_action_id UUID, -- Reference to reversal action if rolled back

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ -- Auto-expire if not executed
);

-- Indexes
CREATE INDEX idx_ops_actions_status ON ops_actions(status, created_at DESC);
CREATE INDEX idx_ops_actions_actor ON ops_actions(actor_id, created_at DESC);
CREATE INDEX idx_ops_actions_type ON ops_actions(action_type, created_at DESC);
CREATE INDEX idx_ops_actions_target ON ops_actions USING gin(target);

COMMENT ON TABLE ops_actions IS 'Operator actions with multi-sig approval and immutable audit trail';

-- ---------------------------------------------------------------------
-- 4. DASHBOARD WIDGETS (Customizable)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dash_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant scope
  tenant_type dash_tenant_type NOT NULL,
  tenant_id UUID,

  -- Widget details
  name TEXT NOT NULL,
  kind dash_widget_kind NOT NULL,

  -- Configuration (flexible JSONB)
  config JSONB NOT NULL,
  -- Example for chart_line:
  -- {
  --   "title": "GMV Trend",
  --   "metric": "gmv",
  --   "time_range": "7d",
  --   "aggregation": "sum",
  --   "groupBy": "day",
  --   "colors": ["#4CAF50"]
  -- }

  -- Position & Layout
  position JSONB,
  -- Example: {"row": 0, "col": 0, "width": 6, "height": 4}

  -- Visibility & Access
  visible BOOLEAN DEFAULT true,
  required_roles TEXT[],

  -- Metadata
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX idx_dash_widgets_tenant ON dash_widgets(tenant_type, tenant_id);
CREATE INDEX idx_dash_widgets_kind ON dash_widgets(kind);

COMMENT ON TABLE dash_widgets IS 'Configurable dashboard widgets per tenant';

-- ---------------------------------------------------------------------
-- 5. DASHBOARD ALERTS (Real-time Alerts)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dash_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant scope
  tenant_type dash_tenant_type NOT NULL,
  tenant_id UUID,

  -- Alert details
  severity alert_severity NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT, -- e.g., 'float', 'fraud', 'reconciliation', 'payout'

  -- Source
  source TEXT, -- e.g., 'sira', 'threshold', 'manual'
  source_id UUID, -- Reference to source entity (e.g., recommendation_id)

  -- Actionable
  action_url TEXT, -- Deep link to resolve alert
  action_label TEXT, -- e.g., "View Details", "Approve Payout"

  -- Metadata
  context JSONB DEFAULT '{}'::JSONB,

  -- Status
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,

  -- Expiration
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '7 days'),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX idx_dash_alerts_tenant ON dash_alerts(tenant_type, tenant_id, status, created_at DESC);
CREATE INDEX idx_dash_alerts_severity ON dash_alerts(severity, status);
CREATE INDEX idx_dash_alerts_category ON dash_alerts(category);

COMMENT ON TABLE dash_alerts IS 'Real-time alerts for dashboard (threshold breaches, SIRA recommendations, etc.)';

-- ---------------------------------------------------------------------
-- 6. AGENT LOCATIONS (Geospatial for Map Widget)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_locations (
  agent_id UUID PRIMARY KEY,

  -- Location
  location GEOGRAPHY(POINT, 4326), -- PostGIS geography type
  country TEXT NOT NULL,
  region TEXT,
  city TEXT,
  address TEXT,

  -- Metrics
  float_available NUMERIC(20,2) DEFAULT 0,
  sales_30d NUMERIC(20,2) DEFAULT 0,
  transaction_count_30d BIGINT DEFAULT 0,

  -- Status
  active BOOLEAN DEFAULT true,
  last_activity_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Spatial index
CREATE INDEX idx_agent_locations_geog ON agent_locations USING gist(location);
CREATE INDEX idx_agent_locations_country ON agent_locations(country);

COMMENT ON TABLE agent_locations IS 'Agent geospatial locations for map widget';

-- ---------------------------------------------------------------------
-- 7. SIRA RECOMMENDATIONS (AI-Powered Insights)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sira_dash_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant scope
  tenant_type dash_tenant_type NOT NULL,
  tenant_id UUID,

  -- Recommendation details
  recommendation_type TEXT NOT NULL, -- e.g., 'route_payout', 'set_hold', 'adjust_threshold'
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),

  -- Title & Description
  title TEXT NOT NULL,
  description TEXT NOT NULL,

  -- Suggested action
  suggested_action JSONB NOT NULL,
  -- Example: {"action_type": "ROUTE_PAYOUT_OVERRIDE", "target": {...}, "params": {...}}

  -- Impact estimation
  estimated_impact JSONB,
  -- Example: {"cost_savings": 500, "risk_reduction": 0.15, "revenue_gain": 2000}

  -- Explainability (SIRA features)
  explanation JSONB,
  -- Example: {"features": [{"name": "fraud_rate", "value": 0.12, "weight": 0.8}], "model": "sira-v2"}

  -- Confidence
  confidence_score NUMERIC(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected', 'expired', 'superseded')),
  applied_at TIMESTAMPTZ,
  applied_by UUID,
  rejected_at TIMESTAMPTZ,
  rejected_by UUID,
  rejection_reason TEXT,

  -- Expiration
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days'),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX idx_sira_recs_tenant ON sira_dash_recommendations(tenant_type, tenant_id, status, created_at DESC);
CREATE INDEX idx_sira_recs_priority ON sira_dash_recommendations(priority, status);
CREATE INDEX idx_sira_recs_type ON sira_dash_recommendations(recommendation_type);

COMMENT ON TABLE sira_dash_recommendations IS 'SIRA AI recommendations for dashboard with explainability';

-- =====================================================================
-- FUNCTIONS
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Get Dashboard Snapshot (Fast Lookup)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_dashboard_snapshot(
  p_tenant_type dash_tenant_type,
  p_tenant_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_snapshot JSONB;
BEGIN
  -- Try to get cached snapshot
  SELECT payload INTO v_snapshot
  FROM dash_snapshots
  WHERE tenant_type = p_tenant_type
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);

  IF v_snapshot IS NULL THEN
    -- Fallback: compute on-the-fly (should be rare)
    v_snapshot := compute_dashboard_snapshot(p_tenant_type, p_tenant_id);
  END IF;

  RETURN v_snapshot;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_dashboard_snapshot IS 'Get precomputed dashboard snapshot (fast lookup)';

-- ---------------------------------------------------------------------
-- 2. Compute Dashboard Snapshot (Aggregate from hourly data)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION compute_dashboard_snapshot(
  p_tenant_type dash_tenant_type,
  p_tenant_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_snapshot JSONB;
BEGIN
  -- Aggregate last 7 days
  SELECT jsonb_build_object(
    'gmv', SUM(gmv),
    'net_revenue', SUM(net_revenue),
    'total_fees', SUM(total_fees),
    'refunds_amount', SUM(refunds_amount),
    'refunds_count', SUM(refunds_count),
    'disputes_count', SUM(disputes_count),
    'payouts_pending_count', SUM(payout_pending_count),
    'payouts_pending_amount', SUM(payout_pending_amount),
    'float_available', AVG(float_available),
    'conversion_rate', AVG(conversion_rate),
    'fraud_rate', AVG(fraud_rate),
    'transaction_count', SUM(transaction_count),
    'unique_customers', SUM(unique_customers)
  ) INTO v_snapshot
  FROM dash_aggregates_hourly
  WHERE tenant_type = p_tenant_type
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    AND bucket_ts >= now() - INTERVAL '7 days';

  RETURN v_snapshot;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION compute_dashboard_snapshot IS 'Compute dashboard snapshot from aggregates (fallback)';

-- ---------------------------------------------------------------------
-- 3. Upsert Hourly Aggregate (Idempotent)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION upsert_hourly_aggregate(
  p_bucket_ts TIMESTAMPTZ,
  p_tenant_type dash_tenant_type,
  p_tenant_id UUID,
  p_country TEXT,
  p_region TEXT,
  p_currency TEXT,
  p_metrics JSONB
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO dash_aggregates_hourly (
    bucket_ts, tenant_type, tenant_id, country, region, currency,
    gmv, transaction_count, net_revenue, total_fees, refunds_amount,
    refunds_count, disputes_count, payouts_amount, payouts_count,
    float_available, conversion_rate, fraud_rate
  ) VALUES (
    p_bucket_ts, p_tenant_type, p_tenant_id, p_country, p_region, p_currency,
    (p_metrics->>'gmv')::NUMERIC,
    (p_metrics->>'transaction_count')::BIGINT,
    (p_metrics->>'net_revenue')::NUMERIC,
    (p_metrics->>'total_fees')::NUMERIC,
    (p_metrics->>'refunds_amount')::NUMERIC,
    (p_metrics->>'refunds_count')::BIGINT,
    (p_metrics->>'disputes_count')::BIGINT,
    (p_metrics->>'payouts_amount')::NUMERIC,
    (p_metrics->>'payouts_count')::BIGINT,
    (p_metrics->>'float_available')::NUMERIC,
    (p_metrics->>'conversion_rate')::NUMERIC,
    (p_metrics->>'fraud_rate')::NUMERIC
  )
  ON CONFLICT (bucket_ts, tenant_type, tenant_id, country, region, currency)
  DO UPDATE SET
    gmv = dash_aggregates_hourly.gmv + EXCLUDED.gmv,
    transaction_count = dash_aggregates_hourly.transaction_count + EXCLUDED.transaction_count,
    net_revenue = dash_aggregates_hourly.net_revenue + EXCLUDED.net_revenue,
    total_fees = dash_aggregates_hourly.total_fees + EXCLUDED.total_fees,
    refunds_amount = dash_aggregates_hourly.refunds_amount + EXCLUDED.refunds_amount,
    refunds_count = dash_aggregates_hourly.refunds_count + EXCLUDED.refunds_count,
    disputes_count = dash_aggregates_hourly.disputes_count + EXCLUDED.disputes_count,
    payouts_amount = dash_aggregates_hourly.payouts_amount + EXCLUDED.payouts_amount,
    payouts_count = dash_aggregates_hourly.payouts_count + EXCLUDED.payouts_count,
    float_available = EXCLUDED.float_available, -- Latest value
    conversion_rate = EXCLUDED.conversion_rate,
    fraud_rate = EXCLUDED.fraud_rate,
    updated_at = now();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION upsert_hourly_aggregate IS 'Upsert hourly aggregate (idempotent for stream processing)';

-- ---------------------------------------------------------------------
-- 4. Refresh Dashboard Snapshot (Scheduled Job)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION refresh_dashboard_snapshots()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_tenant RECORD;
BEGIN
  -- Refresh snapshots for all active tenants
  FOR v_tenant IN
    SELECT DISTINCT tenant_type, tenant_id
    FROM dash_aggregates_hourly
    WHERE bucket_ts >= now() - INTERVAL '1 hour'
  LOOP
    INSERT INTO dash_snapshots (tenant_type, tenant_id, snapshot_ts, payload)
    VALUES (
      v_tenant.tenant_type,
      v_tenant.tenant_id,
      now(),
      compute_dashboard_snapshot(v_tenant.tenant_type, v_tenant.tenant_id)
    )
    ON CONFLICT (tenant_type, tenant_id)
    DO UPDATE SET
      snapshot_ts = EXCLUDED.snapshot_ts,
      payload = EXCLUDED.payload,
      created_at = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_dashboard_snapshots IS 'Refresh all dashboard snapshots (run every 1-5 minutes)';

-- ---------------------------------------------------------------------
-- 5. Check Ops Action Approvals (Multi-Sig)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_ops_action_approvals(p_action_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_action ops_actions;
  v_approvals JSONB;
  v_approval_count INTEGER;
BEGIN
  -- Get action
  SELECT * INTO v_action FROM ops_actions WHERE id = p_action_id;

  IF v_action IS NULL THEN
    RETURN false;
  END IF;

  -- Count approvals
  v_approvals := v_action.approvals;
  v_approval_count := jsonb_array_length(v_approvals);

  -- Check if enough approvals
  IF v_approval_count >= v_action.required_approvals THEN
    -- Auto-update status to approved
    UPDATE ops_actions SET status = 'approved', updated_at = now()
    WHERE id = p_action_id AND status = 'pending_approval';

    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_ops_action_approvals IS 'Check if ops action has enough approvals (multi-sig)';

-- ---------------------------------------------------------------------
-- 6. Get Agents Nearby (Geospatial Query)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_agents_nearby(
  p_lat NUMERIC,
  p_lon NUMERIC,
  p_radius_km NUMERIC DEFAULT 50
)
RETURNS TABLE (
  agent_id UUID,
  distance_km NUMERIC,
  country TEXT,
  city TEXT,
  float_available NUMERIC,
  sales_30d NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.agent_id,
    ST_Distance(a.location, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography) / 1000 AS distance_km,
    a.country,
    a.city,
    a.float_available,
    a.sales_30d
  FROM agent_locations a
  WHERE ST_DWithin(
    a.location,
    ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
    p_radius_km * 1000
  )
    AND a.active = true
  ORDER BY distance_km ASC
  LIMIT 100;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_agents_nearby IS 'Get agents within radius (geospatial query for map widget)';

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Auto-update updated_at
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_dash_aggregates_updated_at
BEFORE UPDATE ON dash_aggregates_hourly
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ops_actions_updated_at
BEFORE UPDATE ON ops_actions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dash_widgets_updated_at
BEFORE UPDATE ON dash_widgets
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_locations_updated_at
BEFORE UPDATE ON agent_locations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------
-- 2. Auto-check approvals on ops_actions update
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION auto_check_ops_action_approvals()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pending_approval' AND OLD.approvals IS DISTINCT FROM NEW.approvals THEN
    PERFORM check_ops_action_approvals(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_check_approvals_on_ops_actions
AFTER UPDATE ON ops_actions
FOR EACH ROW EXECUTE FUNCTION auto_check_ops_action_approvals();

-- =====================================================================
-- VIEWS
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Dashboard Overview (Last 24 Hours)
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW dash_overview_24h AS
SELECT
  tenant_type,
  tenant_id,
  SUM(gmv) AS gmv,
  SUM(net_revenue) AS net_revenue,
  SUM(total_fees) AS total_fees,
  SUM(refunds_amount) AS refunds_amount,
  SUM(refunds_count) AS refunds_count,
  SUM(disputes_count) AS disputes_count,
  SUM(transaction_count) AS transaction_count,
  AVG(conversion_rate) AS avg_conversion_rate,
  AVG(fraud_rate) AS avg_fraud_rate
FROM dash_aggregates_hourly
WHERE bucket_ts >= now() - INTERVAL '24 hours'
GROUP BY tenant_type, tenant_id;

COMMENT ON VIEW dash_overview_24h IS 'Dashboard overview for last 24 hours (aggregated)';

-- ---------------------------------------------------------------------
-- 2. Open Alerts Count by Severity
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW dash_alerts_summary AS
SELECT
  tenant_type,
  tenant_id,
  severity,
  COUNT(*) AS alert_count
FROM dash_alerts
WHERE status = 'open' AND (expires_at IS NULL OR expires_at > now())
GROUP BY tenant_type, tenant_id, severity;

COMMENT ON VIEW dash_alerts_summary IS 'Summary of open alerts by severity';

-- ---------------------------------------------------------------------
-- 3. Pending Ops Actions
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW dash_pending_ops_actions AS
SELECT
  action_type,
  status,
  COUNT(*) AS action_count,
  MIN(created_at) AS oldest_created_at
FROM ops_actions
WHERE status IN ('requested', 'pending_approval')
GROUP BY action_type, status;

COMMENT ON VIEW dash_pending_ops_actions IS 'Summary of pending ops actions';

-- =====================================================================
-- SEED DATA
-- =====================================================================

-- Default widgets for platform view
INSERT INTO dash_widgets (tenant_type, tenant_id, name, kind, config, position) VALUES
  ('platform', NULL, 'GMV Trend', 'chart_line', '{
    "title": "GMV Trend (7 Days)",
    "metric": "gmv",
    "time_range": "7d",
    "aggregation": "sum",
    "groupBy": "day"
  }'::JSONB, '{"row": 0, "col": 0, "width": 6, "height": 3}'::JSONB),

  ('platform', NULL, 'Transaction Volume', 'chart_bar', '{
    "title": "Transaction Volume",
    "metric": "transaction_count",
    "time_range": "24h",
    "aggregation": "sum",
    "groupBy": "hour"
  }'::JSONB, '{"row": 0, "col": 6, "width": 6, "height": 3}'::JSONB),

  ('platform', NULL, 'Float Available', 'gauge', '{
    "title": "Float Available",
    "metric": "float_available",
    "min": 0,
    "max": 10000000,
    "thresholds": [{"value": 1000000, "color": "red"}, {"value": 5000000, "color": "yellow"}]
  }'::JSONB, '{"row": 3, "col": 0, "width": 3, "height": 2}'::JSONB),

  ('platform', NULL, 'Conversion Rate', 'gauge', '{
    "title": "Conversion Rate",
    "metric": "conversion_rate",
    "min": 0,
    "max": 1,
    "format": "percent",
    "thresholds": [{"value": 0.85, "color": "red"}, {"value": 0.95, "color": "yellow"}]
  }'::JSONB, '{"row": 3, "col": 3, "width": 3, "height": 2}'::JSONB),

  ('platform', NULL, 'Top Countries', 'table', '{
    "title": "Top Countries by GMV",
    "columns": ["country", "gmv", "transaction_count"],
    "limit": 10,
    "sortBy": "gmv",
    "sortOrder": "desc"
  }'::JSONB, '{"row": 3, "col": 6, "width": 6, "height": 4}'::JSONB),

  ('platform', NULL, 'Alerts', 'alert_list', '{
    "title": "Active Alerts",
    "severities": ["critical", "high"],
    "limit": 10
  }'::JSONB, '{"row": 5, "col": 0, "width": 6, "height": 3}'::JSONB);

-- =====================================================================
-- PARTITIONING (For High Volume)
-- =====================================================================

-- Partition dash_aggregates_hourly by month for performance
-- (Run after initial setup, when volume is high)

COMMENT ON TABLE dash_aggregates_hourly IS 'PARTITIONING RECOMMENDED: Partition by bucket_ts (monthly) for high volume';

-- Example partitioning (manual, run when needed):
-- CREATE TABLE dash_aggregates_hourly_2025_11 PARTITION OF dash_aggregates_hourly
--   FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

-- =====================================================================
-- GRANTS (Role-Based Access)
-- =====================================================================

-- Grant read-only to analytics role
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_role;

-- Grant full access to dashboard service
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO dashboard_service_role;

-- Grant ops actions to ops admins only
-- GRANT INSERT, UPDATE, SELECT ON ops_actions TO ops_admin_role;

-- =====================================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================================

-- GIN index for JSONB columns (fast lookup)
CREATE INDEX idx_dash_snapshots_payload_gin ON dash_snapshots USING gin(payload);
CREATE INDEX idx_ops_actions_params_gin ON ops_actions USING gin(params);
CREATE INDEX idx_sira_recs_explanation_gin ON sira_dash_recommendations USING gin(explanation);

-- =====================================================================
-- COMPLETION
-- =====================================================================

-- Schema version
COMMENT ON SCHEMA public IS 'Brique 77 - Dashboard Unifié v1.0.0 - 2025-11-12';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Brique 77 - Dashboard Unifié schema created successfully';
  RAISE NOTICE '📊 Tables created: 7 (aggregates, snapshots, actions, widgets, alerts, agent_locations, sira_recommendations)';
  RAISE NOTICE '⚙️ Functions created: 6';
  RAISE NOTICE '🔔 Triggers created: 5';
  RAISE NOTICE '📈 Views created: 3';
  RAISE NOTICE '🎨 Seed widgets: 6 (platform view)';
  RAISE NOTICE '🚀 Ready for real-time dashboard with SIRA integration';
END $$;
