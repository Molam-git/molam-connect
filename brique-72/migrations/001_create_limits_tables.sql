/**
 * Brique 72 - Account Capabilities & Limits Management
 * Version: 1.0.0
 * Dependencies: PostgreSQL 14+
 */

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Check PostgreSQL version
DO $$
BEGIN
  IF current_setting('server_version_num')::int < 140000 THEN
    RAISE EXCEPTION 'PostgreSQL 14+ required (current: %)', version();
  END IF;
END $$;

-- 1) Capability definitions (reference table)
CREATE TABLE IF NOT EXISTS capability_definitions (
  capability_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,              -- 'payment', 'payout', 'agent', 'merchant'
  requires_kyc_level TEXT,             -- Minimum KYC level required (P0, P1, P2, P3)
  default_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO capability_definitions (capability_key, display_name, description, category, requires_kyc_level, default_enabled) VALUES
('can_send_p2p', 'Send P2P Payments', 'Send money to other users', 'payment', 'P1', TRUE),
('can_receive_p2p', 'Receive P2P Payments', 'Receive money from other users', 'payment', 'P0', TRUE),
('can_pay_card', 'Pay with Card', 'Make card payments', 'payment', 'P1', TRUE),
('can_pay_merchant', 'Pay Merchants', 'Pay at merchant checkouts', 'payment', 'P1', TRUE),
('can_receive_payout', 'Receive Payouts', 'Receive payouts to wallet', 'payout', 'P1', TRUE),
('can_instant_payout', 'Instant Payout', 'Receive instant payouts', 'payout', 'P2', FALSE),
('can_bank_transfer_out', 'Bank Transfer Out', 'Send money to bank account', 'payout', 'P1', TRUE),
('can_bank_transfer_in', 'Bank Transfer In', 'Receive money from bank', 'payment', 'P1', TRUE),
('can_agent_cash_in', 'Agent Cash In', 'Deposit cash via agent', 'agent', 'P0', TRUE),
('can_agent_cash_out', 'Agent Cash Out', 'Withdraw cash via agent', 'agent', 'P1', TRUE),
('can_create_checkout', 'Create Checkout', 'Create merchant checkout sessions', 'merchant', 'P2', FALSE),
('can_receive_checkout_payments', 'Receive Checkout Payments', 'Accept payments via checkout', 'merchant', 'P2', FALSE),
('can_issue_refunds', 'Issue Refunds', 'Process refund requests', 'merchant', 'P2', FALSE),
('can_international_transfer', 'International Transfer', 'Send money internationally', 'payment', 'P2', FALSE)
ON CONFLICT (capability_key) DO NOTHING;

COMMENT ON TABLE capability_definitions IS 'Master list of all capabilities in the system';

-- 2) User capabilities (what users can do)
CREATE TABLE IF NOT EXISTS account_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  account_type TEXT NOT NULL,          -- 'personal', 'professional', 'business', 'bank'
  capability_key TEXT NOT NULL REFERENCES capability_definitions(capability_key),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMPTZ DEFAULT NOW(),
  effective_to TIMESTAMPTZ,            -- NULL = indefinite
  origin TEXT NOT NULL DEFAULT 'default', -- 'default', 'kyc', 'sira', 'ops_override'
  override_reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, capability_key)
);

CREATE INDEX idx_capabilities_user ON account_capabilities(user_id);
CREATE INDEX idx_capabilities_enabled ON account_capabilities(enabled) WHERE enabled = TRUE;
CREATE INDEX idx_capabilities_effective ON account_capabilities(effective_from, effective_to);

COMMENT ON TABLE account_capabilities IS 'Per-user capability settings';
COMMENT ON COLUMN account_capabilities.origin IS 'Source: default (KYC-based), kyc (updated on KYC change), sira (ML recommendation), ops_override (manual)';

-- 3) Limit definitions (reference table)
CREATE TABLE IF NOT EXISTS limit_definitions (
  limit_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'amount',  -- 'amount' (currency value) or 'count' (number of transactions)
  time_window TEXT,                     -- NULL = per-transaction, 'daily', 'weekly', 'monthly'
  applies_to TEXT[] DEFAULT ARRAY['all'], -- ['all'] or specific capabilities
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO limit_definitions (limit_key, display_name, description, unit, time_window) VALUES
('max_single_tx', 'Max Single Transaction', 'Maximum amount for a single transaction', 'amount', NULL),
('max_daily_in', 'Max Daily Incoming', 'Maximum incoming volume per day', 'amount', 'daily'),
('max_daily_out', 'Max Daily Outgoing', 'Maximum outgoing volume per day', 'amount', 'daily'),
('max_weekly_out', 'Max Weekly Outgoing', 'Maximum outgoing volume per week', 'amount', 'weekly'),
('max_monthly_volume', 'Max Monthly Volume', 'Maximum total volume per month', 'amount', 'monthly'),
('max_daily_tx_count', 'Max Daily Transaction Count', 'Maximum number of transactions per day', 'count', 'daily'),
('max_payout_per_day', 'Max Payout Per Day', 'Maximum payout amount per day', 'amount', 'daily'),
('max_agent_cash_out', 'Max Agent Cash Out', 'Maximum cash withdrawal via agent per transaction', 'amount', NULL),
('max_international_tx', 'Max International Transfer', 'Maximum international transfer amount', 'amount', NULL)
ON CONFLICT (limit_key) DO NOTHING;

COMMENT ON TABLE limit_definitions IS 'Master list of all limit types';

-- 4) Default limits (by KYC level, account type, country)
CREATE TABLE IF NOT EXISTS limit_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kyc_level TEXT NOT NULL,             -- P0, P1, P2, P3
  account_type TEXT NOT NULL,          -- 'personal', 'professional', 'business', 'bank'
  country TEXT,                        -- NULL = global default
  legal_entity TEXT,                   -- 'molam_sn', 'molam_ci', etc.
  currency TEXT NOT NULL DEFAULT 'USD',
  limit_key TEXT NOT NULL REFERENCES limit_definitions(limit_key),
  limit_value NUMERIC(18,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(kyc_level, account_type, country, currency, limit_key)
);

CREATE INDEX idx_limit_defaults_kyc ON limit_defaults(kyc_level, account_type);
CREATE INDEX idx_limit_defaults_country ON limit_defaults(country) WHERE country IS NOT NULL;

COMMENT ON TABLE limit_defaults IS 'Default limits by KYC level and account type';

-- Insert default limits for P0 (Basic)
INSERT INTO limit_defaults (kyc_level, account_type, country, currency, limit_key, limit_value) VALUES
('P0', 'personal', NULL, 'USD', 'max_single_tx', 0),           -- Can't send
('P0', 'personal', NULL, 'USD', 'max_daily_in', 1000),         -- Can receive up to $1000/day
('P0', 'personal', NULL, 'USD', 'max_daily_out', 0),
('P0', 'personal', NULL, 'USD', 'max_monthly_volume', 5000)
ON CONFLICT DO NOTHING;

-- Insert default limits for P1 (ID Verified)
INSERT INTO limit_defaults (kyc_level, account_type, country, currency, limit_key, limit_value) VALUES
('P1', 'personal', NULL, 'USD', 'max_single_tx', 1000),
('P1', 'personal', NULL, 'USD', 'max_daily_in', 5000),
('P1', 'personal', NULL, 'USD', 'max_daily_out', 5000),
('P1', 'personal', NULL, 'USD', 'max_monthly_volume', 50000),
('P1', 'personal', NULL, 'USD', 'max_daily_tx_count', 20),
('P1', 'personal', NULL, 'USD', 'max_agent_cash_out', 500)
ON CONFLICT DO NOTHING;

-- Insert default limits for P2 (Professional/Business)
INSERT INTO limit_defaults (kyc_level, account_type, country, currency, limit_key, limit_value) VALUES
('P2', 'professional', NULL, 'USD', 'max_single_tx', 50000),
('P2', 'professional', NULL, 'USD', 'max_daily_in', 200000),
('P2', 'professional', NULL, 'USD', 'max_daily_out', 200000),
('P2', 'professional', NULL, 'USD', 'max_monthly_volume', 2000000),
('P2', 'professional', NULL, 'USD', 'max_payout_per_day', 100000),
('P2', 'professional', NULL, 'USD', 'max_international_tx', 25000)
ON CONFLICT DO NOTHING;

-- Insert default limits for P3 (Bank Partner)
INSERT INTO limit_defaults (kyc_level, account_type, country, currency, limit_key, limit_value) VALUES
('P3', 'bank', NULL, 'USD', 'max_single_tx', 999999999),      -- Essentially unlimited
('P3', 'bank', NULL, 'USD', 'max_daily_in', 999999999),
('P3', 'bank', NULL, 'USD', 'max_daily_out', 999999999),
('P3', 'bank', NULL, 'USD', 'max_monthly_volume', 999999999)
ON CONFLICT DO NOTHING;

-- 5) User-specific limits (overrides defaults)
CREATE TABLE IF NOT EXISTS account_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  account_type TEXT NOT NULL,
  country TEXT,
  legal_entity TEXT,
  kyc_level TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  limit_key TEXT NOT NULL REFERENCES limit_definitions(limit_key),
  limit_value NUMERIC(18,2) NOT NULL,
  origin TEXT NOT NULL DEFAULT 'default',  -- 'default', 'kyc', 'sira', 'ops_override'
  effective_from TIMESTAMPTZ DEFAULT NOW(),
  effective_to TIMESTAMPTZ,                -- NULL = indefinite
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, limit_key, currency)
);

CREATE INDEX idx_account_limits_user ON account_limits(user_id);
CREATE INDEX idx_account_limits_key ON account_limits(limit_key);
CREATE INDEX idx_account_limits_effective ON account_limits(effective_from, effective_to);

COMMENT ON TABLE account_limits IS 'User-specific limit overrides';

-- 6) Temporary limit overrides (Ops)
CREATE TABLE IF NOT EXISTS limit_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,                            -- NULL = global override
  limit_key TEXT NOT NULL REFERENCES limit_definitions(limit_key),
  currency TEXT NOT NULL DEFAULT 'USD',
  new_value NUMERIC(18,2) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,         -- Mandatory expiry for overrides
  created_by UUID NOT NULL,                -- Ops user ID
  approved_by UUID,                        -- For multi-sig
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'active',            -- 'active', 'expired', 'revoked'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_overrides_user ON limit_overrides(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_overrides_active ON limit_overrides(status) WHERE status = 'active';
CREATE INDEX idx_overrides_expires ON limit_overrides(expires_at) WHERE status = 'active';

COMMENT ON TABLE limit_overrides IS 'Temporary limit overrides with mandatory expiry';

-- 7) Immutable audit log
CREATE TABLE IF NOT EXISTS limit_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  actor_id UUID,
  actor_role TEXT,
  action TEXT NOT NULL,                    -- 'set_limit', 'create_override', 'revoke_override', 'sira_recommendation', 'capability_change'
  entity_type TEXT NOT NULL,               -- 'capability', 'limit', 'override'
  entity_id UUID,
  payload JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_limit_audit_user ON limit_audit(user_id);
CREATE INDEX idx_limit_audit_actor ON limit_audit(actor_id);
CREATE INDEX idx_limit_audit_created ON limit_audit(created_at DESC);
CREATE INDEX idx_limit_audit_action ON limit_audit(action);

COMMENT ON TABLE limit_audit IS 'Immutable audit trail for all limit and capability changes';

-- 8) Enforcement cache snapshots (for audit/backfill, real cache in Redis)
CREATE TABLE IF NOT EXISTS enforcement_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  snapshot_type TEXT NOT NULL,             -- 'capabilities', 'limits'
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_snapshots_user ON enforcement_snapshots(user_id);
CREATE INDEX idx_snapshots_created ON enforcement_snapshots(created_at DESC);

COMMENT ON TABLE enforcement_snapshots IS 'Point-in-time snapshots for audit and cache rebuild';

-- 9) Usage tracking (for limit enforcement)
CREATE TABLE IF NOT EXISTS limit_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  limit_key TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  time_window DATE NOT NULL,               -- For daily/monthly aggregation
  usage_amount NUMERIC(18,2) DEFAULT 0,
  usage_count INT DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_usage_unique ON limit_usage(user_id, limit_key, currency, time_window);
CREATE INDEX idx_usage_user ON limit_usage(user_id);
CREATE INDEX idx_usage_window ON limit_usage(time_window);

COMMENT ON TABLE limit_usage IS 'Real-time usage tracking for limit enforcement';

-- Triggers

-- Update updated_at on account_capabilities
CREATE OR REPLACE FUNCTION update_capabilities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_capabilities_updated
  BEFORE UPDATE ON account_capabilities
  FOR EACH ROW
  EXECUTE FUNCTION update_capabilities_updated_at();

-- Update updated_at on account_limits
CREATE TRIGGER trigger_limits_updated
  BEFORE UPDATE ON account_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_capabilities_updated_at();

-- Auto-expire overrides
CREATE OR REPLACE FUNCTION auto_expire_overrides()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at <= NOW() AND NEW.status = 'active' THEN
    NEW.status = 'expired';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_override_expiry
  BEFORE UPDATE ON limit_overrides
  FOR EACH ROW
  EXECUTE FUNCTION auto_expire_overrides();

-- Create audit log on capability change
CREATE OR REPLACE FUNCTION audit_capability_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO limit_audit (user_id, action, entity_type, entity_id, payload)
    VALUES (NEW.user_id, 'capability_enabled', 'capability', NEW.id, jsonb_build_object(
      'capability_key', NEW.capability_key,
      'enabled', NEW.enabled,
      'origin', NEW.origin
    ));
  ELSIF TG_OP = 'UPDATE' AND OLD.enabled IS DISTINCT FROM NEW.enabled THEN
    INSERT INTO limit_audit (user_id, action, entity_type, entity_id, payload)
    VALUES (NEW.user_id, CASE WHEN NEW.enabled THEN 'capability_enabled' ELSE 'capability_disabled' END,
            'capability', NEW.id, jsonb_build_object(
      'capability_key', NEW.capability_key,
      'old_enabled', OLD.enabled,
      'new_enabled', NEW.enabled,
      'origin', NEW.origin
    ));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_audit_capability
  AFTER INSERT OR UPDATE ON account_capabilities
  FOR EACH ROW
  EXECUTE FUNCTION audit_capability_change();

-- Function: Get effective limit for user
CREATE OR REPLACE FUNCTION get_effective_limit(
  p_user_id UUID,
  p_limit_key TEXT,
  p_currency TEXT DEFAULT 'USD'
)
RETURNS NUMERIC AS $$
DECLARE
  v_limit NUMERIC;
  v_kyc_level TEXT;
  v_account_type TEXT;
  v_country TEXT;
BEGIN
  -- 1. Check for active override
  SELECT new_value INTO v_limit
  FROM limit_overrides
  WHERE (user_id = p_user_id OR user_id IS NULL)
    AND limit_key = p_limit_key
    AND currency = p_currency
    AND status = 'active'
    AND expires_at > NOW()
  ORDER BY user_id DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF v_limit IS NOT NULL THEN
    RETURN v_limit;
  END IF;

  -- 2. Check user-specific limit
  SELECT limit_value INTO v_limit
  FROM account_limits
  WHERE user_id = p_user_id
    AND limit_key = p_limit_key
    AND currency = p_currency
    AND (effective_to IS NULL OR effective_to > NOW())
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_limit IS NOT NULL THEN
    RETURN v_limit;
  END IF;

  -- 3. Get user KYC level and account type (mock - would query molam_users)
  -- For now, return default based on P1
  SELECT limit_value INTO v_limit
  FROM limit_defaults
  WHERE kyc_level = 'P1'
    AND account_type = 'personal'
    AND limit_key = p_limit_key
    AND currency = p_currency
    AND country IS NULL
  LIMIT 1;

  RETURN COALESCE(v_limit, 1000); -- Fallback default
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_effective_limit IS 'Get effective limit for user considering overrides, user-specific limits, and defaults';

-- Function: Check if user has capability
CREATE OR REPLACE FUNCTION has_capability(
  p_user_id UUID,
  p_capability_key TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_enabled BOOLEAN;
BEGIN
  SELECT enabled INTO v_enabled
  FROM account_capabilities
  WHERE user_id = p_user_id
    AND capability_key = p_capability_key
    AND (effective_to IS NULL OR effective_to > NOW())
  LIMIT 1;

  -- If no record, check if capability requires KYC and user has it (simplified)
  IF v_enabled IS NULL THEN
    SELECT default_enabled INTO v_enabled
    FROM capability_definitions
    WHERE capability_key = p_capability_key;
  END IF;

  RETURN COALESCE(v_enabled, FALSE);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION has_capability IS 'Check if user has a specific capability enabled';

-- View: Active capabilities per user
CREATE OR REPLACE VIEW v_user_capabilities AS
SELECT
  ac.user_id,
  ac.capability_key,
  cd.display_name,
  cd.category,
  ac.enabled,
  ac.origin,
  ac.effective_from,
  ac.effective_to
FROM account_capabilities ac
JOIN capability_definitions cd ON ac.capability_key = cd.capability_key
WHERE ac.effective_to IS NULL OR ac.effective_to > NOW();

COMMENT ON VIEW v_user_capabilities IS 'Active capabilities per user with definitions';

-- View: Effective limits per user
CREATE OR REPLACE VIEW v_user_limits AS
SELECT
  al.user_id,
  al.limit_key,
  ld.display_name,
  ld.unit,
  ld.time_window,
  al.currency,
  al.limit_value,
  al.origin,
  al.effective_from,
  al.effective_to
FROM account_limits al
JOIN limit_definitions ld ON al.limit_key = ld.limit_key
WHERE al.effective_to IS NULL OR al.effective_to > NOW();

COMMENT ON VIEW v_user_limits IS 'Effective limits per user with definitions';

-- Comments on key concepts
COMMENT ON COLUMN account_capabilities.effective_to IS 'NULL = permanent, timestamp = temporary capability grant';
COMMENT ON COLUMN limit_overrides.expires_at IS 'Mandatory expiry - all overrides must have end date';
COMMENT ON COLUMN limit_audit.payload IS 'JSONB containing before/after values and context';
