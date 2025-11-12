-- ============================================
-- Brique 60: Recurring Billing & Subscriptions
-- Description: Gestion des abonnements récurrents avec facturation automatique
-- ============================================

-- 1) Plans (catalog)
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  frequency TEXT NOT NULL,  -- 'daily','weekly','monthly','yearly'
  trial_days INT DEFAULT 0,
  billing_anchor TEXT DEFAULT 'auto',
  metadata JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT plans_merchant_sku_unique UNIQUE(merchant_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_plans_merchant ON plans(merchant_id);
CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);

-- 2) Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  cancel_at TIMESTAMPTZ,
  cancel_reason TEXT,
  quantity INT DEFAULT 1,
  proration_behavior TEXT DEFAULT 'create_invoice',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_merchant ON subscriptions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON subscriptions(current_period_end);

-- 3) Subscription invoices link
CREATE TABLE IF NOT EXISTS subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_invoices_subscription ON subscription_invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_invoices_invoice ON subscription_invoices(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sub_invoices_status ON subscription_invoices(status);

-- 4) Dunning attempts / schedule
CREATE TABLE IF NOT EXISTS subscription_dunning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  attempt INT NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ NOT NULL,
  action JSONB,
  status TEXT DEFAULT 'scheduled',
  executed_at TIMESTAMPTZ,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dunning_sub_attempt_unique UNIQUE(subscription_id, attempt)
);

CREATE INDEX IF NOT EXISTS idx_dunning_sched ON subscription_dunning(scheduled_at, status);
CREATE INDEX IF NOT EXISTS idx_dunning_subscription ON subscription_dunning(subscription_id);

-- 5) Audit logs
CREATE TABLE IF NOT EXISTS molam_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON molam_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON molam_audit_logs(created_at DESC);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_plans_updated_at
  BEFORE UPDATE ON plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Commentaires
COMMENT ON TABLE plans IS 'Catalog of subscription plans';
COMMENT ON TABLE subscriptions IS 'Active subscriptions linking customers to plans';
COMMENT ON TABLE subscription_invoices IS 'Invoices generated for subscription billing cycles';
COMMENT ON TABLE subscription_dunning IS 'Dunning schedule for failed payments with retry logic';
COMMENT ON COLUMN subscriptions.status IS 'draft|trialing|active|past_due|cancelled|unpaid';
COMMENT ON COLUMN subscriptions.proration_behavior IS 'none|create_invoice|keep_as_credit';
