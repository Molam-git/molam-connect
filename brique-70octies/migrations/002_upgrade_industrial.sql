/**
 * Brique 70octies - Industrial Upgrade
 * Adds: locked balance, vouchers, tier snapshots, encryption, audit trails
 */

-- Add locked balance column (for pending redemptions)
ALTER TABLE loyalty_balances ADD COLUMN IF NOT EXISTS locked NUMERIC(28,8) DEFAULT 0;
ALTER TABLE loyalty_balances ADD COLUMN IF NOT EXISTS encrypted_meta BYTEA; -- encrypted PII

-- Add fraud flags
ALTER TABLE loyalty_balances ADD COLUMN IF NOT EXISTS fraud_flags JSONB DEFAULT '[]';
ALTER TABLE loyalty_balances ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN DEFAULT FALSE;

-- Vouchers table (industrial)
CREATE TABLE IF NOT EXISTS loyalty_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES loyalty_campaigns(id),
  program_id UUID REFERENCES loyalty_programs(id),
  user_id UUID,
  code TEXT UNIQUE NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  voucher_type TEXT DEFAULT 'discount', -- discount, wallet_topup, free_product
  expires_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  redeemed_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vouchers_code ON loyalty_vouchers(code);
CREATE INDEX idx_vouchers_user ON loyalty_vouchers(user_id) WHERE redeemed_at IS NULL;

-- Tier snapshots (audit/rollback)
CREATE TABLE IF NOT EXISTS loyalty_tier_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES loyalty_programs(id),
  snapshot JSONB NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs (immutable)
CREATE TABLE IF NOT EXISTS loyalty_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- program, balance, campaign
  entity_id UUID NOT NULL,
  action TEXT NOT NULL, -- create, update, freeze, adjust
  actor_id UUID,
  actor_role TEXT,
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON loyalty_audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_actor ON loyalty_audit_logs(actor_id);
CREATE INDEX idx_audit_created ON loyalty_audit_logs(created_at DESC);

-- Multi-sig approvals
CREATE TABLE IF NOT EXISTS loyalty_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type TEXT NOT NULL, -- campaign_budget, manual_adjust, freeze_program
  entity_id UUID NOT NULL,
  amount NUMERIC(18,2),
  reason TEXT,
  required_approvers TEXT[] NOT NULL, -- ['finance_ops', 'ops_marketing']
  approvals JSONB DEFAULT '[]', -- [{"role": "finance_ops", "user_id": "uuid", "at": "timestamp"}]
  status TEXT DEFAULT 'pending', -- pending, approved, rejected
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- SIRA ML feedback table
CREATE TABLE IF NOT EXISTS loyalty_sira_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  program_id UUID NOT NULL,
  event_type TEXT NOT NULL, -- churn, redeem, tier_upgrade
  features JSONB NOT NULL,
  label BOOLEAN, -- true = positive outcome (retained, redeemed, upgraded)
  model_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sira_feedback_model ON loyalty_sira_feedback(model_version, created_at DESC);

-- Add idempotency to transactions (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='loyalty_transactions' AND column_name='idempotency_key'
  ) THEN
    ALTER TABLE loyalty_transactions ADD COLUMN idempotency_key TEXT UNIQUE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_txn_idempotency ON loyalty_transactions(idempotency_key);

-- Add program controls
ALTER TABLE loyalty_programs ADD COLUMN IF NOT EXISTS budget_limit NUMERIC(18,2);
ALTER TABLE loyalty_programs ADD COLUMN IF NOT EXISTS budget_spent NUMERIC(18,2) DEFAULT 0;
ALTER TABLE loyalty_programs ADD COLUMN IF NOT EXISTS max_earn_per_day NUMERIC(18,2);
ALTER TABLE loyalty_programs ADD COLUMN IF NOT EXISTS fraud_detection_enabled BOOLEAN DEFAULT TRUE;

-- Function: Check budget before award
CREATE OR REPLACE FUNCTION check_program_budget()
RETURNS TRIGGER AS $$
DECLARE
  prog RECORD;
BEGIN
  SELECT * INTO prog FROM loyalty_programs WHERE id = (
    SELECT program_id FROM loyalty_balances WHERE id = NEW.balance_id
  );

  IF prog.budget_limit IS NOT NULL AND prog.budget_spent >= prog.budget_limit THEN
    RAISE EXCEPTION 'Program budget exhausted';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_budget
  BEFORE INSERT ON loyalty_transactions
  FOR EACH ROW
  WHEN (NEW.event_type = 'earn')
  EXECUTE FUNCTION check_program_budget();

-- Function: Update budget spent
CREATE OR REPLACE FUNCTION update_program_budget()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.event_type = 'earn' THEN
    UPDATE loyalty_programs
    SET budget_spent = budget_spent + NEW.amount
    WHERE id = (SELECT program_id FROM loyalty_balances WHERE id = NEW.balance_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_budget
  AFTER INSERT ON loyalty_transactions
  FOR EACH ROW
  WHEN (NEW.event_type = 'earn')
  EXECUTE FUNCTION update_program_budget();

-- Comments
COMMENT ON TABLE loyalty_vouchers IS 'Redeemable vouchers generated from loyalty points';
COMMENT ON TABLE loyalty_audit_logs IS 'Immutable audit trail for all loyalty operations';
COMMENT ON TABLE loyalty_approval_requests IS 'Multi-sig approval workflow for sensitive operations';
COMMENT ON TABLE loyalty_sira_feedback IS 'Training data for SIRA ML models';
COMMENT ON COLUMN loyalty_balances.locked IS 'Points locked in pending redemptions';
COMMENT ON COLUMN loyalty_balances.encrypted_meta IS 'Encrypted PII (KMS/Vault)';
