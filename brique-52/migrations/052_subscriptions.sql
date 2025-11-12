/**
 * Brique 52 - Subscriptions & Recurring Payments Engine
 * Database Schema
 */

-- 1) Plans (subscription offerings)
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  code TEXT NOT NULL, -- e.g. "starter-monthly"
  name TEXT NOT NULL,
  description TEXT,
  billing_currency TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL, -- unit price per period
  interval TEXT NOT NULL CHECK (interval IN ('monthly','weekly','annual','custom')),
  interval_count INTEGER DEFAULT 1, -- e.g., 3 months, etc.
  trial_period_days INTEGER DEFAULT 0,
  proration_behavior TEXT DEFAULT 'credit' CHECK (proration_behavior IN ('credit','invoice_now','none')),
  metadata JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(merchant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_plans_merchant ON plans(merchant_id);
CREATE INDEX IF NOT EXISTS idx_plans_active ON plans(active) WHERE active = true;

-- 2) Subscriptions (customer subscriptions)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE, -- idempotency / public id
  merchant_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','past_due','canceled','trialing','unpaid')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  billing_currency TEXT NOT NULL,
  default_payment_method_id UUID, -- reference to payment_methods
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subs_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subs_merchant ON subscriptions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_subs_customer ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_subs_external_id ON subscriptions(external_id);

-- 3) Subscription items (supports multiple plans per subscription)
CREATE TABLE IF NOT EXISTS subscription_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES plans(id),
  quantity INTEGER DEFAULT 1 CHECK (quantity > 0),
  unit_amount NUMERIC(18,2) NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_items_subscription ON subscription_items(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_items_plan ON subscription_items(plan_id);

-- 4) Payment Methods vault (tokenized payment methods)
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  merchant_id UUID,
  type TEXT NOT NULL CHECK (type IN ('card','sepa_debit','ach_debit','bank_transfer','wallet')),
  provider TEXT NOT NULL, -- 'molam_vault'|'stripe'|'psp-x'
  token TEXT NOT NULL, -- provider token (encrypted)
  last4 TEXT,
  brand TEXT,
  exp_month INTEGER,
  exp_year INTEGER,
  sepa_mandate_ref TEXT,
  sepa_mandate_pdf_s3 TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','requires_action')),
  is_default BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_customer ON payment_methods(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_merchant ON payment_methods(merchant_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_status ON payment_methods(status);

-- 5) Subscription invoices (links to B46 billing invoices)
CREATE TABLE IF NOT EXISTS subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  invoice_id UUID, -- link to billing_invoices table (B46)
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  amount_due NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','voided')),
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_invoices_subscription ON subscription_invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_invoices_invoice ON subscription_invoices(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sub_invoices_next_attempt ON subscription_invoices(next_attempt_at) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS idx_sub_invoices_status ON subscription_invoices(status);

-- 6) Dunning policies (retry policies for failed payments)
CREATE TABLE IF NOT EXISTS dunning_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  name TEXT NOT NULL,
  retries JSONB NOT NULL, -- JSON array of {days, action} e.g. [{"days":1},{"days":3},{"days":7}]
  max_retries INTEGER DEFAULT 3 CHECK (max_retries >= 0),
  actions JSONB DEFAULT '{}', -- notifications templates / freeze actions
  is_default BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(merchant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_dunning_merchant ON dunning_policies(merchant_id);

-- 7) Subscription events log (audit trail)
CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor TEXT, -- user/system who triggered event
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_events_subscription ON subscription_events(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_events_type ON subscription_events(event_type);
CREATE INDEX IF NOT EXISTS idx_sub_events_created ON subscription_events(created_at DESC);

-- Seed default global dunning policy
INSERT INTO dunning_policies (merchant_id, name, retries, max_retries, is_default, actions)
VALUES
  (
    '00000000-0000-0000-0000-000000000000', -- global/system merchant
    'Default Dunning Policy',
    '[{"days": 1, "action": "retry"}, {"days": 3, "action": "retry"}, {"days": 7, "action": "cancel"}]'::jsonb,
    3,
    true,
    '{"email_template": "dunning_notification", "sms_enabled": false}'::jsonb
  )
ON CONFLICT DO NOTHING;

-- Sample plans for testing
INSERT INTO plans (merchant_id, code, name, description, billing_currency, amount, interval, interval_count, trial_period_days)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'starter-monthly',
    'Starter Plan (Monthly)',
    'Perfect for small businesses',
    'USD',
    29.99,
    'monthly',
    1,
    14
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'pro-monthly',
    'Pro Plan (Monthly)',
    'For growing teams',
    'USD',
    99.99,
    'monthly',
    1,
    7
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'enterprise-annual',
    'Enterprise Plan (Annual)',
    'For large organizations',
    'USD',
    9999.99,
    'annual',
    1,
    30
  )
ON CONFLICT DO NOTHING;

-- Comments
COMMENT ON TABLE plans IS 'Subscription plan offerings defined by merchants';
COMMENT ON TABLE subscriptions IS 'Active customer subscriptions with billing periods';
COMMENT ON TABLE subscription_items IS 'Line items within a subscription (supports multi-plan)';
COMMENT ON TABLE payment_methods IS 'Tokenized payment methods vault (PCI-compliant)';
COMMENT ON TABLE subscription_invoices IS 'Links subscription billing periods to B46 invoices';
COMMENT ON TABLE dunning_policies IS 'Failed payment retry policies per merchant';
COMMENT ON TABLE subscription_events IS 'Immutable audit log of subscription lifecycle events';
