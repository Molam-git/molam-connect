-- ============================================
-- Brique 62: Unified Merchant Dashboard
-- Description: Dashboard with Wallet, Connect, Subscriptions, Disputes & SIRA Widgets
-- ============================================

-- 1) Dashboard widgets configuration per merchant/user
CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  widget_type TEXT NOT NULL CHECK (widget_type IN (
    'balance', 'transactions', 'subscriptions', 'disputes',
    'sira_tile', 'sira_action', 'wallet_summary', 'connect_summary',
    'mrr_chart', 'churn_alerts', 'fraud_alerts', 'recent_payouts'
  )),
  config JSONB NOT NULL DEFAULT '{}'::jsonb, -- {position, filters, size, preferences}
  is_visible BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_widgets_merchant_user ON dashboard_widgets(merchant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_widgets_type ON dashboard_widgets(widget_type);
CREATE INDEX IF NOT EXISTS idx_widgets_visible ON dashboard_widgets(is_visible) WHERE is_visible = true;

-- 2) Real-time tiles cache (fed by SIRA + aggregators)
CREATE TABLE IF NOT EXISTS dashboard_tiles_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  tile_type TEXT NOT NULL CHECK (tile_type IN (
    'fraud_alerts', 'churn_risk', 'sales_summary', 'balance_summary',
    'disputes_pending', 'subscriptions_mrr', 'payout_pending',
    'failed_payments', 'high_risk_transactions', 'anomaly_detected'
  )),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  payload JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'system', -- 'sira','wallet','connect','subscriptions','disputes'
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tiles_merchant ON dashboard_tiles_cache(merchant_id);
CREATE INDEX IF NOT EXISTS idx_tiles_type ON dashboard_tiles_cache(tile_type);
CREATE INDEX IF NOT EXISTS idx_tiles_priority ON dashboard_tiles_cache(priority);
CREATE INDEX IF NOT EXISTS idx_tiles_computed ON dashboard_tiles_cache(computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_tiles_unacknowledged ON dashboard_tiles_cache(merchant_id, acknowledged) WHERE acknowledged = false;

-- 3) Ops dashboard rules (what actions can be enforced or suggested)
CREATE TABLE IF NOT EXISTS ops_dashboard_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL CHECK (scope IN ('wallet','connect','subscriptions','disputes','all')),
  rule_type TEXT NOT NULL CHECK (rule_type IN ('threshold','timeout','escalation','auto_action','suggestion')),
  params JSONB NOT NULL, -- {threshold_amount, timeout_hours, escalation_level, auto_approve}
  active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_rules_scope ON ops_dashboard_rules(scope);
CREATE INDEX IF NOT EXISTS idx_ops_rules_active ON ops_dashboard_rules(active) WHERE active = true;

-- 4) Dashboard action log (user interactions with tiles/widgets)
CREATE TABLE IF NOT EXISTS dashboard_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL, -- 'acknowledge_tile','dismiss_tile','widget_config_change','execute_action'
  entity_type TEXT NOT NULL, -- 'tile','widget','rule'
  entity_id UUID NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_log_merchant ON dashboard_action_log(merchant_id);
CREATE INDEX IF NOT EXISTS idx_action_log_user ON dashboard_action_log(user_id);
CREATE INDEX IF NOT EXISTS idx_action_log_created ON dashboard_action_log(created_at DESC);

-- 5) Dashboard metrics aggregation (pre-computed for performance)
CREATE TABLE IF NOT EXISTS dashboard_metrics_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  metrics JSONB NOT NULL, -- {total_balance, mrr, arr, churn_rate, dispute_count, fraud_alerts}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_metrics_merchant_date ON dashboard_metrics_summary(merchant_id, metric_date DESC);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_widgets_updated_at
  BEFORE UPDATE ON dashboard_widgets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_ops_rules_updated_at
  BEFORE UPDATE ON ops_dashboard_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_metrics_updated_at
  BEFORE UPDATE ON dashboard_metrics_summary
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE dashboard_widgets IS 'User-customizable dashboard widgets with layout configuration';
COMMENT ON TABLE dashboard_tiles_cache IS 'Real-time alerts and notifications from SIRA and other services';
COMMENT ON TABLE ops_dashboard_rules IS 'Ops-configurable business rules and thresholds';
COMMENT ON TABLE dashboard_action_log IS 'Audit trail of user interactions with dashboard';
COMMENT ON TABLE dashboard_metrics_summary IS 'Pre-aggregated daily metrics for fast dashboard loading';

COMMENT ON COLUMN dashboard_widgets.config IS 'Widget configuration: {position:{x,y}, size:{w,h}, filters, preferences}';
COMMENT ON COLUMN dashboard_tiles_cache.priority IS 'Alert priority: low/normal/high/critical';
COMMENT ON COLUMN dashboard_tiles_cache.payload IS 'Tile content and metadata';
COMMENT ON COLUMN ops_dashboard_rules.params IS 'Rule-specific parameters and thresholds';
