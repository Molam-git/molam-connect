-- =====================================================================
-- Brique 82 — Overage Billing UI: Invoice Preview & Pre-billing Notifications
-- =====================================================================
-- Migration: Overage Previews & Lines
-- Date: 2025-11-12
-- Dependencies: Brique 81 (billing_overages table)
-- =====================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =====================================================================
-- Table: overage_previews
-- =====================================================================
-- Stores aggregated overage charges per tenant per billing period
-- for merchant preview and approval before actual billing
-- =====================================================================

CREATE TABLE IF NOT EXISTS overage_previews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Tenant identification
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('merchant', 'platform', 'partner')),
  tenant_id UUID NOT NULL,

  -- Billing period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Financial information
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'EUR', 'GBP', 'XOF', 'XAF')),
  total_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  tax_amount NUMERIC(18,2) DEFAULT 0,
  discount_amount NUMERIC(18,2) DEFAULT 0,
  final_amount NUMERIC(18,2) GENERATED ALWAYS AS (total_amount + COALESCE(tax_amount, 0) - COALESCE(discount_amount, 0)) STORED,

  -- Status workflow
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending',              -- Preview created, not yet notified
      'notified',             -- Merchant has been notified
      'accepted',             -- Merchant accepted charges
      'contested',            -- Merchant contests charges
      'approved_by_ops',      -- Ops approved contested charges
      'rejected_by_ops',      -- Ops rejected/voided charges
      'forwarded_to_billing', -- Charges sent to billing engine (B46)
      'billed',               -- Invoice created
      'cancelled'             -- Preview cancelled
    )
  ),

  -- Notification tracking
  notification_sent_at TIMESTAMPTZ,
  notification_method TEXT CHECK (notification_method IN ('email', 'sms', 'push', 'webhook', 'all')),
  notification_retries INT DEFAULT 0,

  -- Acceptance/Contest tracking
  merchant_action TEXT CHECK (merchant_action IN ('accepted', 'contested', 'ignored')),
  merchant_action_at TIMESTAMPTZ,
  merchant_action_by UUID, -- User ID from Molam ID
  merchant_notes TEXT,

  -- Ops override tracking
  ops_action TEXT CHECK (ops_action IN ('approved', 'rejected', 'adjusted', 'credited')),
  ops_action_at TIMESTAMPTZ,
  ops_action_by UUID, -- Ops user ID
  ops_notes TEXT,

  -- Billing integration
  billing_invoice_id UUID, -- Reference to invoice in billing system (B46)
  billing_forwarded_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(tenant_type, tenant_id, period_start, period_end),
  CHECK (period_end > period_start)
);

-- Indexes for performance
CREATE INDEX idx_overage_previews_tenant
  ON overage_previews(tenant_type, tenant_id);

CREATE INDEX idx_overage_previews_status
  ON overage_previews(status)
  WHERE status IN ('pending', 'notified', 'contested');

CREATE INDEX idx_overage_previews_period
  ON overage_previews(period_start, period_end);

CREATE INDEX idx_overage_previews_notification
  ON overage_previews(notification_sent_at)
  WHERE notification_sent_at IS NULL;

CREATE INDEX idx_overage_previews_billing
  ON overage_previews(billing_invoice_id)
  WHERE billing_invoice_id IS NOT NULL;

-- GIN index for metadata queries
CREATE INDEX idx_overage_previews_metadata
  ON overage_previews USING gin(metadata);

-- Comment
COMMENT ON TABLE overage_previews IS 'Aggregated overage charges per tenant per billing period for preview and approval';

-- =====================================================================
-- Table: overage_preview_lines
-- =====================================================================
-- Detail lines for each preview, linked to actual billing_overages
-- =====================================================================

CREATE TABLE IF NOT EXISTS overage_preview_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Preview reference
  preview_id UUID NOT NULL REFERENCES overage_previews(id) ON DELETE CASCADE,

  -- Overage reference (from Brique 81)
  overage_id UUID REFERENCES billing_overages(id) ON DELETE SET NULL,

  -- Metric details
  metric TEXT NOT NULL CHECK (
    metric IN (
      'requests_per_second',
      'requests_per_day',
      'requests_per_month',
      'data_transfer_gb',
      'api_calls',
      'compute_seconds',
      'storage_gb',
      'bandwidth_mbps'
    )
  ),

  -- Quantity and pricing
  unit_count NUMERIC(18,6) NOT NULL CHECK (unit_count >= 0),
  unit_price NUMERIC(18,8) NOT NULL CHECK (unit_price >= 0),
  amount NUMERIC(18,2) NOT NULL CHECK (amount >= 0),

  -- Billing model used
  billing_model TEXT NOT NULL DEFAULT 'per_unit' CHECK (
    billing_model IN ('per_unit', 'fixed', 'tiered')
  ),

  -- Tiered pricing breakdown (if applicable)
  tier_breakdown JSONB,

  -- Line status
  line_status TEXT NOT NULL DEFAULT 'included' CHECK (
    line_status IN (
      'included',   -- Included in preview
      'excluded',   -- Excluded by merchant/ops
      'adjusted',   -- Amount adjusted by ops
      'credited'    -- Credited back
    )
  ),

  -- Adjustment tracking
  original_amount NUMERIC(18,2),
  adjusted_amount NUMERIC(18,2),
  adjustment_reason TEXT,
  adjusted_by UUID,
  adjusted_at TIMESTAMPTZ,

  -- Notes
  note TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_overage_preview_lines_preview
  ON overage_preview_lines(preview_id);

CREATE INDEX idx_overage_preview_lines_overage
  ON overage_preview_lines(overage_id)
  WHERE overage_id IS NOT NULL;

CREATE INDEX idx_overage_preview_lines_metric
  ON overage_preview_lines(metric);

CREATE INDEX idx_overage_preview_lines_status
  ON overage_preview_lines(line_status);

-- Comment
COMMENT ON TABLE overage_preview_lines IS 'Detail lines for overage previews, linked to actual billing_overages';

-- =====================================================================
-- Table: preview_notifications
-- =====================================================================
-- Notification history for overage previews
-- =====================================================================

CREATE TABLE IF NOT EXISTS preview_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Preview reference
  preview_id UUID NOT NULL REFERENCES overage_previews(id) ON DELETE CASCADE,

  -- Recipient information
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('merchant', 'ops', 'finance', 'admin')),
  recipient_id UUID NOT NULL, -- User ID from Molam ID
  recipient_email TEXT,
  recipient_phone TEXT,

  -- Notification details
  notification_type TEXT NOT NULL CHECK (
    notification_type IN ('preview_created', 'reminder', 'accepted', 'contested', 'approved', 'billed')
  ),
  notification_method TEXT NOT NULL CHECK (
    notification_method IN ('email', 'sms', 'push', 'webhook')
  ),

  -- Delivery tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')
  ),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,

  -- Content
  subject TEXT,
  body TEXT,
  template_id TEXT,
  template_variables JSONB,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_preview_notifications_preview
  ON preview_notifications(preview_id);

CREATE INDEX idx_preview_notifications_recipient
  ON preview_notifications(recipient_type, recipient_id);

CREATE INDEX idx_preview_notifications_status
  ON preview_notifications(status)
  WHERE status IN ('pending', 'failed');

CREATE INDEX idx_preview_notifications_type
  ON preview_notifications(notification_type, notification_method);

-- Comment
COMMENT ON TABLE preview_notifications IS 'Notification history for overage previews';

-- =====================================================================
-- Table: preview_audit_log
-- =====================================================================
-- Audit log for all preview actions
-- =====================================================================

CREATE TABLE IF NOT EXISTS preview_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Preview reference
  preview_id UUID NOT NULL REFERENCES overage_previews(id) ON DELETE CASCADE,

  -- Action details
  action TEXT NOT NULL CHECK (
    action IN (
      'created', 'updated', 'notified',
      'accepted', 'contested', 'cancelled',
      'approved_by_ops', 'rejected_by_ops', 'adjusted',
      'forwarded_to_billing', 'billed'
    )
  ),

  -- Actor information
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'merchant', 'ops', 'finance')),
  actor_id UUID, -- User ID from Molam ID (NULL for system actions)
  actor_email TEXT,

  -- Change tracking
  old_status TEXT,
  new_status TEXT,
  old_amount NUMERIC(18,2),
  new_amount NUMERIC(18,2),

  -- Additional context
  reason TEXT,
  notes TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Client information
  ip_address INET,
  user_agent TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_preview_audit_log_preview
  ON preview_audit_log(preview_id);

CREATE INDEX idx_preview_audit_log_action
  ON preview_audit_log(action, created_at DESC);

CREATE INDEX idx_preview_audit_log_actor
  ON preview_audit_log(actor_type, actor_id);

-- Comment
COMMENT ON TABLE preview_audit_log IS 'Audit log for all overage preview actions';

-- =====================================================================
-- Functions
-- =====================================================================

-- Function: Update preview total amount when lines change
CREATE OR REPLACE FUNCTION update_preview_total_amount()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE overage_previews
  SET
    total_amount = (
      SELECT COALESCE(SUM(
        CASE
          WHEN line_status = 'included' THEN amount
          WHEN line_status = 'adjusted' THEN COALESCE(adjusted_amount, amount)
          ELSE 0
        END
      ), 0)
      FROM overage_preview_lines
      WHERE preview_id = COALESCE(NEW.preview_id, OLD.preview_id)
    ),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.preview_id, OLD.preview_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger: Update total on line insert/update/delete
DROP TRIGGER IF EXISTS trigger_update_preview_total ON overage_preview_lines;
CREATE TRIGGER trigger_update_preview_total
  AFTER INSERT OR UPDATE OR DELETE ON overage_preview_lines
  FOR EACH ROW
  EXECUTE FUNCTION update_preview_total_amount();

-- Function: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Update updated_at on previews table
DROP TRIGGER IF EXISTS trigger_update_previews_timestamp ON overage_previews;
CREATE TRIGGER trigger_update_previews_timestamp
  BEFORE UPDATE ON overage_previews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update updated_at on lines table
DROP TRIGGER IF EXISTS trigger_update_lines_timestamp ON overage_preview_lines;
CREATE TRIGGER trigger_update_lines_timestamp
  BEFORE UPDATE ON overage_preview_lines
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function: Log audit trail on preview status change
CREATE OR REPLACE FUNCTION log_preview_audit_trail()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status OR
     OLD.total_amount IS DISTINCT FROM NEW.total_amount THEN

    INSERT INTO preview_audit_log (
      preview_id,
      action,
      actor_type,
      actor_id,
      old_status,
      new_status,
      old_amount,
      new_amount,
      metadata
    ) VALUES (
      NEW.id,
      CASE
        WHEN NEW.status = 'accepted' THEN 'accepted'
        WHEN NEW.status = 'contested' THEN 'contested'
        WHEN NEW.status = 'approved_by_ops' THEN 'approved_by_ops'
        WHEN NEW.status = 'rejected_by_ops' THEN 'rejected_by_ops'
        WHEN NEW.status = 'forwarded_to_billing' THEN 'forwarded_to_billing'
        ELSE 'updated'
      END,
      CASE
        WHEN NEW.merchant_action_by IS NOT NULL THEN 'merchant'
        WHEN NEW.ops_action_by IS NOT NULL THEN 'ops'
        ELSE 'system'
      END,
      COALESCE(NEW.merchant_action_by, NEW.ops_action_by),
      OLD.status,
      NEW.status,
      OLD.total_amount,
      NEW.total_amount,
      jsonb_build_object(
        'merchant_notes', NEW.merchant_notes,
        'ops_notes', NEW.ops_notes
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Log audit on preview update
DROP TRIGGER IF EXISTS trigger_log_preview_audit ON overage_previews;
CREATE TRIGGER trigger_log_preview_audit
  AFTER UPDATE ON overage_previews
  FOR EACH ROW
  EXECUTE FUNCTION log_preview_audit_trail();

-- =====================================================================
-- Views
-- =====================================================================

-- View: Pending previews requiring action
CREATE OR REPLACE VIEW v_pending_previews AS
SELECT
  p.*,
  COUNT(pl.id) as line_count,
  array_agg(DISTINCT pl.metric) as metrics,
  MIN(pl.created_at) as earliest_charge,
  MAX(pl.created_at) as latest_charge
FROM overage_previews p
LEFT JOIN overage_preview_lines pl ON p.id = pl.preview_id
WHERE p.status IN ('pending', 'notified', 'contested')
GROUP BY p.id;

-- View: Preview summary with statistics
CREATE OR REPLACE VIEW v_preview_summary AS
SELECT
  p.id,
  p.tenant_id,
  p.period_start,
  p.period_end,
  p.currency,
  p.total_amount,
  p.final_amount,
  p.status,
  p.created_at,
  COUNT(pl.id) as total_lines,
  SUM(CASE WHEN pl.line_status = 'included' THEN 1 ELSE 0 END) as included_lines,
  SUM(CASE WHEN pl.line_status = 'excluded' THEN 1 ELSE 0 END) as excluded_lines,
  SUM(CASE WHEN pl.line_status = 'adjusted' THEN 1 ELSE 0 END) as adjusted_lines,
  array_agg(DISTINCT pl.metric) as metrics_used
FROM overage_previews p
LEFT JOIN overage_preview_lines pl ON p.id = pl.preview_id
GROUP BY p.id;

-- =====================================================================
-- Seed Data (Example)
-- =====================================================================

-- Insert sample preview configuration
INSERT INTO overage_previews (
  tenant_type,
  tenant_id,
  period_start,
  period_end,
  currency,
  total_amount,
  status,
  metadata
) VALUES (
  'merchant',
  '00000000-0000-0000-0000-000000000000', -- Replace with actual tenant ID
  '2025-11-01',
  '2025-11-30',
  'USD',
  0,
  'pending',
  '{
    "notes": "Example preview for testing",
    "billing_cycle": "monthly"
  }'::jsonb
) ON CONFLICT DO NOTHING;

-- =====================================================================
-- Permissions (adjust based on your RBAC setup)
-- =====================================================================

-- Grant permissions to application role
-- GRANT SELECT, INSERT, UPDATE ON overage_previews TO molam_app;
-- GRANT SELECT, INSERT, UPDATE ON overage_preview_lines TO molam_app;
-- GRANT SELECT, INSERT ON preview_notifications TO molam_app;
-- GRANT SELECT, INSERT ON preview_audit_log TO molam_app;

-- Grant read-only access to reporting role
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO molam_reporting;

-- =====================================================================
-- End of Migration
-- =====================================================================
