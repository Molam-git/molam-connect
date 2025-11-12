-- Brique 69bis - Advanced Reporting & Export
-- Migration 002: Report schedules, audit, and custom views

-- ============================================================================
-- 1. Report Schedules Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS analytics_report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  merchant_id UUID,
  org_id UUID,
  created_by UUID NOT NULL,

  -- Report configuration
  name TEXT NOT NULL,
  description TEXT,
  format TEXT NOT NULL CHECK (format IN ('csv', 'xlsx', 'pdf')),

  -- Query definition (JSON)
  query_params JSONB NOT NULL,
  -- Example: {
  --   "from": "2025-07-01",
  --   "to": "2025-07-31",
  --   "granularity": "day",
  --   "metrics": ["gross", "net", "fees"],
  --   "dimensions": ["country", "product_id"],
  --   "filters": {"region": "CEDEAO"}
  -- }

  -- Scheduling
  cron_expr TEXT NOT NULL, -- Standard cron expression
  timezone TEXT DEFAULT 'UTC',

  -- Recipients
  recipients JSONB NOT NULL,
  -- Example: [
  --   {"email": "finance@merchant.com", "role": "finance"},
  --   {"email": "ops@merchant.com", "role": "ops"}
  -- ]

  -- Delivery options
  delivery_method TEXT DEFAULT 'email' CHECK (delivery_method IN ('email', 'webhook', 'both')),
  webhook_url TEXT,
  webhook_auth JSONB, -- Optional auth headers

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  is_enabled BOOLEAN DEFAULT true,

  -- Execution tracking
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  next_run_at TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  last_error TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_schedules_merchant ON analytics_report_schedules(merchant_id) WHERE merchant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_report_schedules_org ON analytics_report_schedules(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_report_schedules_next_run ON analytics_report_schedules(next_run_at) WHERE status = 'active' AND is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_report_schedules_created_by ON analytics_report_schedules(created_by);

COMMENT ON TABLE analytics_report_schedules IS 'Scheduled analytics reports with CRON expressions';

-- ============================================================================
-- 2. Report Audit Log
-- ============================================================================
CREATE TABLE IF NOT EXISTS analytics_report_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference
  schedule_id UUID REFERENCES analytics_report_schedules(id) ON DELETE SET NULL,
  merchant_id UUID,
  org_id UUID,

  -- Report details
  report_name TEXT NOT NULL,
  format TEXT NOT NULL,
  query_params JSONB,

  -- File information
  file_url TEXT NOT NULL,
  file_size_bytes BIGINT,
  file_expires_at TIMESTAMPTZ,
  row_count INTEGER,

  -- Execution details
  execution_time_ms INTEGER,
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,

  -- User context
  created_by UUID,
  user_agent TEXT,
  ip_address INET,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_audit_schedule ON analytics_report_audit(schedule_id);
CREATE INDEX IF NOT EXISTS idx_report_audit_merchant ON analytics_report_audit(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_audit_created_by ON analytics_report_audit(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_audit_created_at ON analytics_report_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_audit_status ON analytics_report_audit(status, created_at DESC);

COMMENT ON TABLE analytics_report_audit IS 'Audit trail for all generated analytics reports';

-- ============================================================================
-- 3. Custom Views (Saved Filters)
-- ============================================================================
CREATE TABLE IF NOT EXISTS analytics_custom_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  merchant_id UUID,
  org_id UUID,
  created_by UUID NOT NULL,

  -- View definition
  name TEXT NOT NULL,
  description TEXT,

  -- Query configuration
  view_config JSONB NOT NULL,
  -- Example: {
  --   "dateRange": {"from": "2025-07-01", "to": "2025-07-31"},
  --   "granularity": "day",
  --   "metrics": ["gross_volume", "net_revenue"],
  --   "dimensions": ["country", "product_id"],
  --   "filters": {"region": "CEDEAO", "payment_method": "wallet"},
  --   "sortBy": "gross_volume",
  --   "sortOrder": "desc"
  -- }

  -- Sharing settings
  is_public BOOLEAN DEFAULT false,
  shared_with JSONB, -- Array of user IDs or roles

  -- Usage tracking
  view_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_views_merchant ON analytics_custom_views(merchant_id) WHERE merchant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_custom_views_org ON analytics_custom_views(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_custom_views_created_by ON analytics_custom_views(created_by);
CREATE INDEX IF NOT EXISTS idx_custom_views_public ON analytics_custom_views(is_public) WHERE is_public = true;

COMMENT ON TABLE analytics_custom_views IS 'User-defined custom dashboard views and saved filters';

-- ============================================================================
-- 4. Export Templates (Pre-configured report formats)
-- ============================================================================
CREATE TABLE IF NOT EXISTS analytics_export_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT, -- 'financial', 'operational', 'merchant', 'custom'

  -- Template configuration
  template_config JSONB NOT NULL,
  -- Includes default metrics, dimensions, formatting rules

  -- Access control
  required_permission TEXT NOT NULL, -- e.g., 'analytics:export:financial'
  available_formats TEXT[] DEFAULT ARRAY['csv', 'xlsx', 'pdf'],

  -- Status
  is_system BOOLEAN DEFAULT false, -- System templates cannot be deleted
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_export_templates_category ON analytics_export_templates(category);

COMMENT ON TABLE analytics_export_templates IS 'Pre-configured export templates for common report types';

-- ============================================================================
-- 5. Seed System Export Templates
-- ============================================================================
INSERT INTO analytics_export_templates (name, description, category, template_config, required_permission, is_system) VALUES
(
  'Daily Transaction Summary',
  'Daily overview of transactions, volume, and fees',
  'operational',
  '{
    "metrics": ["gross_volume_usd", "net_revenue_usd", "fees_molam_usd", "tx_count", "success_rate"],
    "dimensions": ["day"],
    "defaultGranularity": "day",
    "defaultDateRange": "last_30_days"
  }'::jsonb,
  'analytics:view',
  true
),
(
  'Merchant Performance Report',
  'Top merchants by volume and transaction count',
  'merchant',
  '{
    "metrics": ["gross_volume_usd", "net_revenue_usd", "fees_molam_usd", "tx_count"],
    "dimensions": ["merchant_id"],
    "sortBy": "gross_volume_usd",
    "sortOrder": "desc",
    "limit": 100
  }'::jsonb,
  'analytics:ops',
  true
),
(
  'Financial Reconciliation',
  'Detailed financial breakdown for accounting',
  'financial',
  '{
    "metrics": ["gross_volume_local", "gross_volume_usd", "net_revenue_usd", "fees_molam_usd", "fees_partner_usd", "refunds_usd", "chargebacks_usd"],
    "dimensions": ["day", "currency", "merchant_id"],
    "includeRawTransactions": true
  }'::jsonb,
  'analytics:export:financial',
  true
),
(
  'Geographic Performance',
  'Volume and transactions by country and region',
  'operational',
  '{
    "metrics": ["gross_volume_usd", "tx_count", "success_rate"],
    "dimensions": ["region", "country"],
    "sortBy": "gross_volume_usd"
  }'::jsonb,
  'analytics:view',
  true
)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 6. Helper Functions
-- ============================================================================

-- Function to calculate next run time based on cron expression
-- (Simplified - in production use a proper cron parser library)
CREATE OR REPLACE FUNCTION calculate_next_run(cron_expr TEXT, from_time TIMESTAMPTZ DEFAULT now())
RETURNS TIMESTAMPTZ AS $$
DECLARE
  next_run TIMESTAMPTZ;
BEGIN
  -- Simplified: This is a placeholder
  -- In production, use pg_cron or parse cron expressions properly

  -- For daily reports at 8am
  IF cron_expr = '0 8 * * *' THEN
    next_run := date_trunc('day', from_time) + INTERVAL '1 day' + INTERVAL '8 hours';
    IF next_run <= from_time THEN
      next_run := next_run + INTERVAL '1 day';
    END IF;
  -- For weekly reports (Monday 8am)
  ELSIF cron_expr = '0 8 * * 1' THEN
    next_run := date_trunc('week', from_time) + INTERVAL '1 week' + INTERVAL '8 hours';
    IF next_run <= from_time THEN
      next_run := next_run + INTERVAL '1 week';
    END IF;
  -- For monthly reports (1st at 8am)
  ELSIF cron_expr = '0 8 1 * *' THEN
    next_run := date_trunc('month', from_time) + INTERVAL '1 month' + INTERVAL '8 hours';
    IF next_run <= from_time THEN
      next_run := next_run + INTERVAL '1 month';
    END IF;
  ELSE
    -- Default: run tomorrow at same time
    next_run := from_time + INTERVAL '1 day';
  END IF;

  RETURN next_run;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_next_run IS 'Calculate next run time from cron expression (simplified)';

-- Trigger to update next_run_at on schedule creation/update
CREATE OR REPLACE FUNCTION update_schedule_next_run()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (NEW.cron_expr IS DISTINCT FROM OLD.cron_expr OR NEW.last_run_at IS DISTINCT FROM OLD.last_run_at)) THEN
    NEW.next_run_at := calculate_next_run(NEW.cron_expr, COALESCE(NEW.last_run_at, now()));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_schedule_next_run
  BEFORE INSERT OR UPDATE ON analytics_report_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_schedule_next_run();

-- ============================================================================
-- 7. Apply update timestamp triggers
-- ============================================================================

CREATE TRIGGER update_report_schedules_updated_at
  BEFORE UPDATE ON analytics_report_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_custom_views_updated_at
  BEFORE UPDATE ON analytics_custom_views
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_export_templates_updated_at
  BEFORE UPDATE ON analytics_export_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Migration Complete
-- ============================================================================
