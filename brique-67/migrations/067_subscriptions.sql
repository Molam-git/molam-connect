-- Brique 67 — Subscriptions & Recurring Billing
-- Industrial-grade subscription management with metered billing, dunning, proration

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1) PLANS (Global Catalog)
-- =====================================================
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,            -- e.g. "starter-monthly", "pro-annual"
  name TEXT NOT NULL,
  description TEXT,
  billing_interval TEXT NOT NULL,       -- 'monthly', 'weekly', 'annual'
  interval_count INT NOT NULL DEFAULT 1,
  currency TEXT NOT NULL,               -- base currency for plan (e.g., USD)
  unit_amount NUMERIC(18,6) NOT NULL,   -- per interval price in plan currency
  is_active BOOLEAN DEFAULT true,
  is_metered BOOLEAN DEFAULT false,     -- true for usage-based billing
  trial_period_days INT DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE plans IS 'Global subscription plan catalog';
COMMENT ON COLUMN plans.billing_interval IS 'Billing frequency: monthly, weekly, annual';
COMMENT ON COLUMN plans.is_metered IS 'If true, billing includes usage-based charges';

-- =====================================================
-- 2) PLAN PRICES (Multi-Currency Support)
-- =====================================================
CREATE TABLE IF NOT EXISTS plan_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  unit_amount NUMERIC(18,6) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(plan_id, currency)
);

COMMENT ON TABLE plan_prices IS 'Multi-currency pricing for plans (enables FX conversion)';

CREATE INDEX idx_plan_prices_plan ON plan_prices(plan_id);

-- =====================================================
-- 3) MERCHANT-SPECIFIC PLAN OVERRIDES
-- =====================================================
CREATE TABLE IF NOT EXISTS merchant_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  custom_unit_amount NUMERIC(18,6),     -- override plan price
  custom_currency TEXT,
  discount_percent NUMERIC(5,2),        -- e.g., 10.00 for 10% off
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE merchant_plans IS 'Merchant-specific plan customizations and discounts';

CREATE INDEX idx_merchant_plans_merchant ON merchant_plans(merchant_id);
CREATE INDEX idx_merchant_plans_plan ON merchant_plans(plan_id);

-- =====================================================
-- 4) SUBSCRIPTIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,            -- tenant
  customer_id UUID,                     -- optional (customer-level subscriptions)
  plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
  plan_snapshot JSONB NOT NULL,         -- copy of plan details at subscribe time
  status TEXT NOT NULL DEFAULT 'active',-- active | past_due | canceled | unpaid | trialing
  start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  trial_end TIMESTAMPTZ,
  billing_currency TEXT NOT NULL,
  payment_method JSONB,                  -- vault token / wallet info
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CHECK (status IN ('active', 'past_due', 'canceled', 'unpaid', 'trialing'))
);

COMMENT ON TABLE subscriptions IS 'Active and historical subscriptions';
COMMENT ON COLUMN subscriptions.plan_snapshot IS 'Immutable copy of plan at subscription time';
COMMENT ON COLUMN subscriptions.payment_method IS 'Tokenized payment method (PCI-compliant)';

CREATE INDEX idx_subscriptions_merchant ON subscriptions(merchant_id);
CREATE INDEX idx_subscriptions_customer ON subscriptions(customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_period_end ON subscriptions(current_period_end) WHERE status IN ('active', 'trialing');

-- =====================================================
-- 5) USAGE RECORDS (Metered Billing)
-- =====================================================
CREATE TABLE IF NOT EXISTS usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  unit_count NUMERIC(18,6) NOT NULL,
  unit_price NUMERIC(18,6),             -- price per unit (if metered)
  description TEXT,
  posted BOOLEAN DEFAULT false,         -- true when included in invoice
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE usage_records IS 'Usage tracking for metered billing plans';
COMMENT ON COLUMN usage_records.posted IS 'True when usage has been billed';

CREATE INDEX idx_usage_subscription_period ON usage_records(subscription_id, period_start, period_end);
CREATE INDEX idx_usage_posted ON usage_records(posted) WHERE NOT posted;

-- =====================================================
-- 6) SUBSCRIPTION INVOICES LINK
-- =====================================================
CREATE TABLE IF NOT EXISTS subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL,             -- FK to invoices.id in billing module (B46)
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  billing_period_start TIMESTAMPTZ NOT NULL,
  billing_period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE subscription_invoices IS 'Link between subscriptions and generated invoices';

CREATE INDEX idx_subscription_invoices_sub ON subscription_invoices(subscription_id);
CREATE INDEX idx_subscription_invoices_invoice ON subscription_invoices(invoice_id);

-- =====================================================
-- 7) SUBSCRIPTION DUNNING (Retry & Recovery)
-- =====================================================
CREATE TABLE IF NOT EXISTS subscription_dunning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  dunning_state TEXT DEFAULT 'ok',      -- ok | retrying | suspended | cancelled
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 4,           -- configurable per merchant
  retry_schedule JSONB,                 -- e.g., [3600, 21600, 86400, 259200] (seconds)
  next_retry_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CHECK (dunning_state IN ('ok', 'retrying', 'suspended', 'cancelled'))
);

COMMENT ON TABLE subscription_dunning IS 'Payment retry and dunning management';
COMMENT ON COLUMN subscription_dunning.retry_schedule IS 'Array of retry intervals in seconds';

CREATE INDEX idx_dunning_subscription ON subscription_dunning(subscription_id);
CREATE INDEX idx_dunning_next_retry ON subscription_dunning(next_retry_at) WHERE dunning_state = 'retrying';

-- =====================================================
-- 8) SUBSCRIPTION AUDIT LOGS
-- =====================================================
CREATE TABLE IF NOT EXISTS subscription_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  actor UUID,                           -- user/system who performed action
  action TEXT NOT NULL,                 -- created, renewed, canceled, plan_changed, etc.
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE subscription_logs IS 'Audit trail for all subscription changes';

CREATE INDEX idx_subscription_logs_sub ON subscription_logs(subscription_id);
CREATE INDEX idx_subscription_logs_created ON subscription_logs(created_at);

-- =====================================================
-- 9) SUBSCRIPTION SCHEDULE (Future Changes)
-- =====================================================
CREATE TABLE IF NOT EXISTS subscription_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  scheduled_action TEXT NOT NULL,       -- plan_change, cancel, price_change
  scheduled_at TIMESTAMPTZ NOT NULL,
  new_plan_id UUID REFERENCES plans(id),
  new_price NUMERIC(18,6),
  metadata JSONB,
  executed BOOLEAN DEFAULT false,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE subscription_schedules IS 'Scheduled future changes to subscriptions';

CREATE INDEX idx_subscription_schedules_sub ON subscription_schedules(subscription_id);
CREATE INDEX idx_subscription_schedules_pending ON subscription_schedules(scheduled_at) WHERE NOT executed;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_merchant_plans_updated_at BEFORE UPDATE ON merchant_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_dunning_updated_at BEFORE UPDATE ON subscription_dunning
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- VIEWS
-- =====================================================

-- Active subscriptions with plan details
CREATE OR REPLACE VIEW active_subscriptions AS
SELECT
  s.id,
  s.merchant_id,
  s.customer_id,
  s.status,
  s.current_period_start,
  s.current_period_end,
  s.billing_currency,
  s.plan_snapshot->>'slug' as plan_slug,
  s.plan_snapshot->>'name' as plan_name,
  (s.plan_snapshot->>'unit_amount')::numeric as plan_amount,
  s.trial_end,
  s.cancel_at_period_end,
  s.created_at
FROM subscriptions s
WHERE s.status IN ('active', 'trialing', 'past_due');

COMMENT ON VIEW active_subscriptions IS 'All active subscriptions with plan details';

-- Subscription health metrics per merchant
CREATE OR REPLACE VIEW merchant_subscription_stats AS
SELECT
  merchant_id,
  COUNT(*) as total_subscriptions,
  COUNT(*) FILTER (WHERE status = 'active') as active_count,
  COUNT(*) FILTER (WHERE status = 'trialing') as trial_count,
  COUNT(*) FILTER (WHERE status = 'past_due') as past_due_count,
  COUNT(*) FILTER (WHERE status = 'canceled') as canceled_count,
  SUM((plan_snapshot->>'unit_amount')::numeric) as mrr_total
FROM subscriptions
GROUP BY merchant_id;

COMMENT ON VIEW merchant_subscription_stats IS 'Subscription metrics per merchant (MRR, counts)';

-- =====================================================
-- SEED DATA (Example Plans)
-- =====================================================

INSERT INTO plans (slug, name, description, billing_interval, interval_count, currency, unit_amount, is_active, trial_period_days)
VALUES
  ('starter-monthly', 'Starter Monthly', 'Basic plan for small businesses', 'monthly', 1, 'USD', 29.00, true, 14),
  ('pro-monthly', 'Pro Monthly', 'Advanced features for growing teams', 'monthly', 1, 'USD', 99.00, true, 14),
  ('enterprise-annual', 'Enterprise Annual', 'Full suite with priority support', 'annual', 1, 'USD', 999.00, true, 30),
  ('metered-api', 'API Usage Plan', 'Pay per API call', 'monthly', 1, 'USD', 0.00, true, 0)
ON CONFLICT (slug) DO NOTHING;

-- Mark metered plan
UPDATE plans SET is_metered = true WHERE slug = 'metered-api';

-- Add multi-currency prices for starter plan
INSERT INTO plan_prices (plan_id, currency, unit_amount)
SELECT id, 'EUR', 27.00 FROM plans WHERE slug = 'starter-monthly'
ON CONFLICT (plan_id, currency) DO NOTHING;

INSERT INTO plan_prices (plan_id, currency, unit_amount)
SELECT id, 'GBP', 24.00 FROM plans WHERE slug = 'starter-monthly'
ON CONFLICT (plan_id, currency) DO NOTHING;

-- =====================================================
-- GRANTS (example)
-- =====================================================

-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO billing_ops;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO billing_ops;