/**
 * Brique 54 - Refunds & Cancellations Engine
 * Database Schema
 */

-- 1) Refunds table
CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE NOT NULL, -- idempotency key
  payment_id UUID NOT NULL, -- reference to payments table
  merchant_id UUID NOT NULL,
  customer_id UUID,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','succeeded','failed','cancelled')),
  initiated_by TEXT NOT NULL CHECK (initiated_by IN ('merchant','ops','system','customer')),
  approved_by UUID, -- ops user who approved (if required)
  failed_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_merchant ON refunds(merchant_id);
CREATE INDEX IF NOT EXISTS idx_refunds_customer ON refunds(customer_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);
CREATE INDEX IF NOT EXISTS idx_refunds_external_id ON refunds(external_id);
CREATE INDEX IF NOT EXISTS idx_refunds_created ON refunds(created_at DESC);

-- 2) Refund audit logs (immutable)
CREATE TABLE IF NOT EXISTS refund_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id UUID REFERENCES refunds(id) ON DELETE CASCADE,
  actor TEXT NOT NULL, -- user id or "system"
  action TEXT NOT NULL, -- created, approved, processed, failed, cancelled
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refund_audit_refund ON refund_audit_logs(refund_id);
CREATE INDEX IF NOT EXISTS idx_refund_audit_created ON refund_audit_logs(created_at DESC);

-- 3) Refund rules (ops configuration)
CREATE TABLE IF NOT EXISTS refund_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID, -- NULL for global rules
  max_refund_days INTEGER DEFAULT 30,
  max_amount_without_approval NUMERIC(18,2) DEFAULT 1000,
  require_ops_approval_above NUMERIC(18,2) DEFAULT 10000,
  auto_refund_enabled BOOLEAN DEFAULT false,
  max_refund_percentage NUMERIC(5,2) DEFAULT 100, -- % of original payment
  sira_threshold NUMERIC(5,4) DEFAULT 0.5, -- block if customer SIRA > this
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refund_rules_merchant ON refund_rules(merchant_id);

-- 4) Refund statistics cache (for dashboard performance)
CREATE TABLE IF NOT EXISTS refund_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_refunds INTEGER DEFAULT 0,
  total_amount NUMERIC(18,2) DEFAULT 0,
  refund_rate NUMERIC(5,2) DEFAULT 0, -- percentage of payments refunded
  avg_processing_time_seconds INTEGER DEFAULT 0,
  by_reason JSONB DEFAULT '{}',
  by_status JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(merchant_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_refund_stats_merchant ON refund_statistics(merchant_id);
CREATE INDEX IF NOT EXISTS idx_refund_stats_period ON refund_statistics(period_start, period_end);

-- Seed global default refund rules
INSERT INTO refund_rules (merchant_id, max_refund_days, max_amount_without_approval, require_ops_approval_above, auto_refund_enabled, max_refund_percentage, sira_threshold)
VALUES (NULL, 30, 1000, 10000, false, 100, 0.5)
ON CONFLICT DO NOTHING;

-- Comments
COMMENT ON TABLE refunds IS 'Refund transactions for payments (full or partial)';
COMMENT ON TABLE refund_audit_logs IS 'Immutable audit trail for refund actions';
COMMENT ON TABLE refund_rules IS 'Configurable refund policies per merchant or global';
COMMENT ON TABLE refund_statistics IS 'Pre-aggregated refund metrics for dashboard performance';

COMMENT ON COLUMN refunds.status IS 'pending: awaiting processing | processing: in flight | succeeded: completed | failed: payment processor rejected | cancelled: manually cancelled by ops';
COMMENT ON COLUMN refunds.initiated_by IS 'Who initiated the refund: merchant, ops, system (auto), customer (dispute)';
