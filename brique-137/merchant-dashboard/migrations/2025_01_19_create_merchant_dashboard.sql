-- ============================================================================
-- Merchant Dashboard - Database Schema
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1) Merchant Dashboard Configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS merchant_dashboards (
  merchant_id UUID PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
  default_currency TEXT NOT NULL DEFAULT 'XOF',
  payout_schedule TEXT NOT NULL DEFAULT 'weekly' CHECK (payout_schedule IN ('daily', 'weekly', 'monthly', 'instant')),
  timezone TEXT DEFAULT 'UTC',
  locale TEXT DEFAULT 'fr',

  -- Dashboard preferences
  dashboard_config JSONB DEFAULT '{
    "theme": "light",
    "default_period": "mtd",
    "show_usd_equivalent": true,
    "notifications_enabled": true,
    "two_factor_required_for_refunds": true,
    "refund_threshold_requiring_approval": 100000
  }'::jsonb,

  -- Limits
  daily_refund_limit NUMERIC(18,2),
  monthly_refund_limit NUMERIC(18,2),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_dashboards_updated ON merchant_dashboards(updated_at);

-- ============================================================================
-- 2) KPI Cache (pre-computed metrics for fast dashboard loading)
-- ============================================================================
CREATE TABLE IF NOT EXISTS merchant_kpis_cache (
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  period TEXT NOT NULL,                    -- 'today', 'yesterday', 'last_7d', 'mtd', 'ytd', 'custom:YYYY-MM-DD:YYYY-MM-DD'
  kpi_key TEXT NOT NULL,                   -- 'sales', 'refunds', 'fees', 'net_revenue', 'chargeback_rate', 'conversion_rate', 'avg_ticket'
  value NUMERIC(30,8) NOT NULL,
  currency TEXT NOT NULL,
  usd_equivalent NUMERIC(30,8),            -- converted to USD for cross-merchant analytics

  -- Metadata
  txn_count INTEGER,                       -- number of transactions in this period
  metadata JSONB DEFAULT '{}'::jsonb,

  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (merchant_id, period, kpi_key, currency)
);

CREATE INDEX IF NOT EXISTS idx_merchant_kpis_computed_at ON merchant_kpis_cache(computed_at);
CREATE INDEX IF NOT EXISTS idx_merchant_kpis_merchant_period ON merchant_kpis_cache(merchant_id, period);

-- ============================================================================
-- 3) Refunds table (if not exists)
-- ============================================================================
CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL,           -- wallet_transactions or connect_charges
  merchant_id UUID NOT NULL REFERENCES merchants(id),

  -- Refund details
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),

  -- Authorization
  created_by UUID NOT NULL,                -- user who initiated
  approved_by UUID,                        -- if approval required
  requires_approval BOOLEAN DEFAULT FALSE,
  approval_id UUID,                        -- link to B136ter approval

  -- Evidence
  evidence_urls TEXT[],

  -- Processing
  ledger_entry_id UUID,                    -- double-entry reversal
  payout_adjustment_id UUID,               -- adjustment to next payout

  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  failed_reason TEXT,

  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_refunds_merchant ON refunds(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refunds_transaction ON refunds(transaction_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);

-- ============================================================================
-- 4) Disputes (chargebacks & merchant disputes)
-- ============================================================================
CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL,
  merchant_id UUID NOT NULL REFERENCES merchants(id),

  -- Dispute details
  type TEXT NOT NULL CHECK (type IN ('chargeback', 'retrieval_request', 'merchant_dispute')),
  reason TEXT,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'won', 'lost', 'accepted', 'escalated')),

  -- Evidence
  evidence_required BOOLEAN DEFAULT TRUE,
  evidence_deadline TIMESTAMPTZ,
  evidence_submitted_at TIMESTAMPTZ,
  evidence_urls TEXT[],

  -- Resolution
  resolved_at TIMESTAMPTZ,
  resolution TEXT,                         -- 'merchant_won', 'customer_won', 'partial_refund'

  -- Network info (card networks)
  network_case_id TEXT,                    -- Visa/Mastercard case ID
  network_reason_code TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_disputes_merchant ON disputes(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_deadline ON disputes(evidence_deadline) WHERE evidence_required = TRUE AND evidence_submitted_at IS NULL;

-- ============================================================================
-- 5) Merchant Actions Audit (every action taken in dashboard)
-- ============================================================================
CREATE TABLE IF NOT EXISTS merchant_actions_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  user_id UUID NOT NULL,                   -- Molam ID user

  -- Action details
  action_type TEXT NOT NULL,               -- 'refund_initiated', 'payout_schedule_changed', 'webhook_configured', 'export_csv', 'dispute_evidence_uploaded'
  resource_type TEXT,                      -- 'transaction', 'payout', 'dispute', 'settings'
  resource_id UUID,

  -- Context
  ip_address TEXT,
  user_agent TEXT,

  -- Changes
  changes JSONB,                           -- { "before": {...}, "after": {...} }

  -- Authorization
  requires_2fa BOOLEAN DEFAULT FALSE,
  two_factor_verified BOOLEAN DEFAULT FALSE,
  approval_required BOOLEAN DEFAULT FALSE,
  approval_id UUID,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_actions_merchant ON merchant_actions_audit(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_merchant_actions_user ON merchant_actions_audit(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_merchant_actions_type ON merchant_actions_audit(action_type);

-- ============================================================================
-- 6) Merchant Alerts (SIRA anomalies, threshold breaches)
-- ============================================================================
CREATE TABLE IF NOT EXISTS merchant_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id),

  -- Alert details
  alert_type TEXT NOT NULL,                -- 'sira_anomaly', 'high_chargeback_rate', 'unusual_refund_pattern', 'velocity_exceeded', 'threshold_breach'
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  description TEXT,

  -- Context
  related_transactions UUID[],
  related_entities JSONB,                  -- { "payouts": [...], "disputes": [...] }

  -- SIRA scoring
  sira_score INTEGER,
  sira_tags TEXT[],
  sira_recommendations TEXT[],

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'dismissed')),
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_merchant_alerts_merchant ON merchant_alerts(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_merchant_alerts_status ON merchant_alerts(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_merchant_alerts_severity ON merchant_alerts(severity) WHERE status = 'active';

-- ============================================================================
-- 7) Materialized View: Merchant Transaction Aggregates (fast KPI computation)
-- ============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_merchant_tx_agg AS
SELECT
  merchant_id,
  (occurred_at AT TIME ZONE 'UTC')::date AS day,

  -- Transaction counts
  COUNT(*) FILTER (WHERE type = 'payment' AND status = 'succeeded') AS payment_count,
  COUNT(*) FILTER (WHERE type = 'refund' AND status = 'succeeded') AS refund_count,

  -- Amounts
  SUM(amount) FILTER (WHERE type = 'payment' AND status = 'succeeded') AS total_sales,
  SUM(amount) FILTER (WHERE type = 'refund' AND status = 'succeeded') AS total_refunds,
  SUM(fee_molam) AS total_fees,

  -- Currency
  currency,

  -- Aggregation timestamp
  now() AS computed_at
FROM wallet_transactions
WHERE merchant_id IS NOT NULL
  AND occurred_at >= (CURRENT_DATE - INTERVAL '2 years')
GROUP BY merchant_id, (occurred_at AT TIME ZONE 'UTC')::date, currency;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_merchant_tx_agg_key ON mv_merchant_tx_agg(merchant_id, day, currency);
CREATE INDEX IF NOT EXISTS idx_mv_merchant_tx_agg_day ON mv_merchant_tx_agg(day DESC);

-- ============================================================================
-- 8) Webhook Configurations (merchant-specific webhook endpoints)
-- ============================================================================
CREATE TABLE IF NOT EXISTS merchant_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

  -- Endpoint
  url TEXT NOT NULL,
  secret TEXT NOT NULL,                    -- HMAC signing secret

  -- Events subscribed
  events TEXT[] NOT NULL,                  -- ['transaction.succeeded', 'refund.created', 'payout.paid', 'dispute.created']

  -- Status
  active BOOLEAN DEFAULT TRUE,

  -- Delivery stats
  total_delivered INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  last_delivered_at TIMESTAMPTZ,
  last_failed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_webhooks_merchant ON merchant_webhooks(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_webhooks_active ON merchant_webhooks(active) WHERE active = TRUE;

-- ============================================================================
-- Seed default merchant dashboards for existing merchants
-- ============================================================================
INSERT INTO merchant_dashboards (merchant_id, default_currency, payout_schedule, timezone, locale)
SELECT id, 'XOF', 'weekly', 'Africa/Abidjan', 'fr'
FROM merchants
ON CONFLICT (merchant_id) DO NOTHING;

-- ============================================================================
-- Functions for KPI computation
-- ============================================================================

-- Function to refresh materialized view incrementally
CREATE OR REPLACE FUNCTION refresh_merchant_tx_agg() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_merchant_tx_agg;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update merchant_dashboards.updated_at
CREATE OR REPLACE FUNCTION update_merchant_dashboard_timestamp() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER merchant_dashboards_update_timestamp
BEFORE UPDATE ON merchant_dashboards
FOR EACH ROW EXECUTE FUNCTION update_merchant_dashboard_timestamp();
