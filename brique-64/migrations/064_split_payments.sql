-- ============================================================================
-- Brique 64 — Marketplace & Split Payments Engine (Connect)
-- ============================================================================
-- Purpose: Split payment orchestration for marketplace platforms
-- Features: Multi-party settlements, seller/partner splits, tax handling
-- ============================================================================

-- Drop existing objects if they exist
DROP TABLE IF EXISTS split_settlements CASCADE;
DROP TABLE IF EXISTS payment_splits CASCADE;
DROP TABLE IF EXISTS split_rules CASCADE;
DROP TYPE IF EXISTS split_rule_type CASCADE;
DROP TYPE IF EXISTS split_status CASCADE;
DROP TYPE IF EXISTS settlement_status CASCADE;

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE split_rule_type AS ENUM (
  'percentage',      -- Percentage of amount
  'fixed',          -- Fixed amount
  'tiered',         -- Tiered based on volume
  'hierarchical'    -- Cascading splits (platform → partner → seller)
);

CREATE TYPE split_status AS ENUM (
  'pending',        -- Split calculated, not yet settled
  'processing',     -- Settlement in progress
  'settled',        -- Funds transferred
  'failed',         -- Settlement failed
  'reversed'        -- Split was reversed due to dispute
);

CREATE TYPE settlement_status AS ENUM (
  'scheduled',      -- Settlement scheduled
  'processing',     -- Being processed
  'completed',      -- All splits transferred
  'partial',        -- Some splits failed
  'failed',         -- All splits failed
  'cancelled'       -- Settlement cancelled
);

-- ============================================================================
-- TABLE: split_rules
-- Purpose: Define split payment rules for merchants/platforms
-- ============================================================================
CREATE TABLE IF NOT EXISTS split_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL,                    -- Platform/marketplace ID
  merchant_id UUID,                             -- Optional: specific merchant override
  rule_name TEXT NOT NULL,                      -- e.g., "Standard Marketplace Split"
  rule_type split_rule_type NOT NULL,

  -- Split configuration (JSONB for flexibility)
  -- Example percentage: {"platform": 10, "seller": 85, "partner": 5}
  -- Example fixed: {"platform_fee": 500}  (500 cents = $5)
  -- Example tiered: [{"min": 0, "max": 10000, "platform": 15}, {"min": 10001, "max": null, "platform": 10}]
  -- Example hierarchical: [{"order": 1, "recipient": "platform", "amount": 10}, {"order": 2, "recipient": "partner", "amount": 5, "from_remaining": true}]
  rule_config JSONB NOT NULL,

  -- Constraints and validation
  max_recipients INT DEFAULT 10,                -- Maximum number of split recipients
  min_split_amount INT DEFAULT 0,               -- Minimum amount per recipient (cents)
  tax_handling TEXT DEFAULT 'included',         -- 'included' | 'excluded' | 'added'

  -- Currency and country restrictions
  allowed_currencies TEXT[] DEFAULT ARRAY['USD','EUR','GBP']::TEXT[],
  allowed_countries TEXT[] DEFAULT ARRAY['US','CA','GB','FR','DE']::TEXT[],

  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),

  -- Audit fields
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Metadata for custom fields
  metadata JSONB DEFAULT '{}'::jsonb,

  CONSTRAINT valid_rule_config CHECK (jsonb_typeof(rule_config) = 'object' OR jsonb_typeof(rule_config) = 'array')
);

-- Indexes for split_rules
CREATE INDEX idx_split_rules_platform ON split_rules(platform_id) WHERE status = 'active';
CREATE INDEX idx_split_rules_merchant ON split_rules(merchant_id) WHERE merchant_id IS NOT NULL AND status = 'active';
CREATE INDEX idx_split_rules_status ON split_rules(status);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_split_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_split_rules_updated_at
  BEFORE UPDATE ON split_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_split_rules_updated_at();

-- ============================================================================
-- TABLE: payment_splits
-- Purpose: Store executed splits for each payment transaction
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to original payment
  payment_id UUID NOT NULL,                     -- ID from payments/transactions table
  split_rule_id UUID REFERENCES split_rules(id) ON DELETE RESTRICT,

  -- Payer and platform info
  platform_id UUID NOT NULL,
  merchant_id UUID NOT NULL,
  customer_id UUID,

  -- Split details
  recipient_id UUID NOT NULL,                   -- Who receives this split (seller/partner/platform)
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('platform','seller','partner','tax_authority','other')),
  recipient_account_id UUID,                    -- Link to wallet/bank account

  -- Amounts (in cents)
  total_payment_amount INT NOT NULL,            -- Original payment total
  split_amount INT NOT NULL,                    -- Amount for this recipient
  currency TEXT NOT NULL DEFAULT 'USD',

  -- Split calculation details
  calculation_basis JSONB NOT NULL,             -- How split was calculated: {"type": "percentage", "rate": 10, "base_amount": 10000}

  -- Status tracking
  status split_status NOT NULL DEFAULT 'pending',
  settlement_id UUID,                           -- Link to settlement batch
  settled_at TIMESTAMPTZ,

  -- Failure handling
  failure_reason TEXT,
  retry_count INT DEFAULT 0,
  next_retry_at TIMESTAMPTZ,

  -- SIRA risk scoring
  risk_score INT,                               -- From SIRA anomaly detection
  risk_flags JSONB DEFAULT '[]'::jsonb,         -- e.g., ["unusual_split_ratio", "high_frequency"]

  -- Audit trail
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  metadata JSONB DEFAULT '{}'::jsonb,

  CONSTRAINT valid_split_amount CHECK (split_amount >= 0 AND split_amount <= total_payment_amount),
  CONSTRAINT valid_risk_score CHECK (risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 100))
);

-- Indexes for payment_splits
CREATE INDEX idx_payment_splits_payment_id ON payment_splits(payment_id);
CREATE INDEX idx_payment_splits_recipient ON payment_splits(recipient_id, status);
CREATE INDEX idx_payment_splits_platform ON payment_splits(platform_id, created_at DESC);
CREATE INDEX idx_payment_splits_status ON payment_splits(status) WHERE status IN ('pending','processing');
CREATE INDEX idx_payment_splits_settlement ON payment_splits(settlement_id) WHERE settlement_id IS NOT NULL;
CREATE INDEX idx_payment_splits_high_risk ON payment_splits(risk_score) WHERE risk_score > 70;
CREATE INDEX idx_payment_splits_retry ON payment_splits(next_retry_at) WHERE next_retry_at IS NOT NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_payment_splits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_payment_splits_updated_at
  BEFORE UPDATE ON payment_splits
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_splits_updated_at();

-- ============================================================================
-- TABLE: split_settlements
-- Purpose: Batch settlements for split payments
-- ============================================================================
CREATE TABLE IF NOT EXISTS split_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Settlement identification
  settlement_batch_id TEXT NOT NULL UNIQUE,     -- e.g., "SETTLE-2025-01-06-001"

  -- Scope
  platform_id UUID NOT NULL,
  recipient_id UUID NOT NULL,                   -- Who is being paid in this batch
  recipient_type TEXT NOT NULL,

  -- Aggregated amounts
  total_splits_count INT NOT NULL DEFAULT 0,
  total_amount INT NOT NULL DEFAULT 0,          -- Sum of all split amounts
  currency TEXT NOT NULL DEFAULT 'USD',

  -- Settlement window
  settlement_period_start TIMESTAMPTZ NOT NULL,
  settlement_period_end TIMESTAMPTZ NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,            -- When settlement should execute

  -- Status tracking
  status settlement_status NOT NULL DEFAULT 'scheduled',
  executed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Payout details
  payout_id UUID,                               -- Link to actual payout/transfer
  payout_method TEXT,                           -- 'wallet' | 'bank_transfer' | 'check'
  payout_reference TEXT,                        -- External reference number

  -- Failure handling
  failed_splits_count INT DEFAULT 0,
  failure_summary JSONB DEFAULT '[]'::jsonb,    -- Array of {"split_id": "...", "reason": "..."}

  -- SIRA integration
  risk_score INT,
  risk_flags JSONB DEFAULT '[]'::jsonb,
  requires_manual_review BOOLEAN DEFAULT false,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,

  -- Audit trail
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  metadata JSONB DEFAULT '{}'::jsonb,

  CONSTRAINT valid_settlement_dates CHECK (settlement_period_end >= settlement_period_start),
  CONSTRAINT valid_split_counts CHECK (total_splits_count >= 0 AND failed_splits_count >= 0 AND failed_splits_count <= total_splits_count)
);

-- Indexes for split_settlements
CREATE INDEX idx_split_settlements_platform ON split_settlements(platform_id, created_at DESC);
CREATE INDEX idx_split_settlements_recipient ON split_settlements(recipient_id, status);
CREATE INDEX idx_split_settlements_status ON split_settlements(status, scheduled_at);
CREATE INDEX idx_split_settlements_batch_id ON split_settlements(settlement_batch_id);
CREATE INDEX idx_split_settlements_pending_review ON split_settlements(requires_manual_review) WHERE requires_manual_review = true AND reviewed_at IS NULL;
CREATE INDEX idx_split_settlements_scheduled ON split_settlements(scheduled_at) WHERE status = 'scheduled';

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_split_settlements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_split_settlements_updated_at
  BEFORE UPDATE ON split_settlements
  FOR EACH ROW
  EXECUTE FUNCTION update_split_settlements_updated_at();

-- ============================================================================
-- TABLE: molam_audit_logs (if not exists from other briques)
-- Purpose: Immutable audit trail for all split operations
-- ============================================================================
CREATE TABLE IF NOT EXISTS molam_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brique_id TEXT NOT NULL,                      -- 'brique-64'
  entity_type TEXT NOT NULL,                    -- 'split_rule' | 'payment_split' | 'settlement'
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,                         -- 'created' | 'updated' | 'executed' | 'failed' | 'reversed'
  actor_id UUID,                                -- User or system that performed action
  actor_type TEXT DEFAULT 'user',               -- 'user' | 'system' | 'worker'
  changes JSONB,                                -- What changed
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_brique64 ON molam_audit_logs(brique_id, entity_type, created_at DESC) WHERE brique_id = 'brique-64';
CREATE INDEX idx_audit_entity ON molam_audit_logs(entity_type, entity_id);

-- ============================================================================
-- HELPER VIEWS
-- ============================================================================

-- View: Pending settlements ready to execute
CREATE OR REPLACE VIEW v_pending_settlements AS
SELECT
  s.*,
  COUNT(ps.id) as actual_splits_count,
  SUM(ps.split_amount) as actual_total_amount
FROM split_settlements s
LEFT JOIN payment_splits ps ON ps.settlement_id = s.id
WHERE s.status = 'scheduled'
  AND s.scheduled_at <= NOW()
  AND (s.requires_manual_review = false OR s.reviewed_at IS NOT NULL)
GROUP BY s.id;

-- View: Split summary by recipient (for dashboard)
CREATE OR REPLACE VIEW v_recipient_split_summary AS
SELECT
  recipient_id,
  recipient_type,
  currency,
  status,
  COUNT(*) as splits_count,
  SUM(split_amount) as total_amount,
  MIN(created_at) as first_split_at,
  MAX(created_at) as last_split_at
FROM payment_splits
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY recipient_id, recipient_type, currency, status;

-- View: High-risk splits requiring review
CREATE OR REPLACE VIEW v_high_risk_splits AS
SELECT
  ps.*,
  sr.rule_name,
  sr.platform_id
FROM payment_splits ps
JOIN split_rules sr ON sr.id = ps.split_rule_id
WHERE ps.risk_score > 80
  AND ps.status = 'pending'
ORDER BY ps.risk_score DESC, ps.created_at ASC;

-- ============================================================================
-- SEED DATA (Examples)
-- ============================================================================

-- Example 1: Standard marketplace split rule (Platform 10%, Seller 90%)
INSERT INTO split_rules (
  platform_id,
  rule_name,
  rule_type,
  rule_config,
  created_by,
  metadata
) VALUES (
  gen_random_uuid(),
  'Standard Marketplace Split',
  'percentage',
  '{"platform": 10, "seller": 90}'::jsonb,
  gen_random_uuid(),
  '{"description": "Default split for all marketplace transactions"}'::jsonb
);

-- Example 2: Tiered split rule (Higher platform fee for small transactions)
INSERT INTO split_rules (
  platform_id,
  rule_name,
  rule_type,
  rule_config,
  created_by,
  metadata
) VALUES (
  gen_random_uuid(),
  'Tiered Platform Fee',
  'tiered',
  '[
    {"min_amount": 0, "max_amount": 5000, "platform": 15, "seller": 85},
    {"min_amount": 5001, "max_amount": 50000, "platform": 10, "seller": 90},
    {"min_amount": 50001, "max_amount": null, "platform": 5, "seller": 95}
  ]'::jsonb,
  gen_random_uuid(),
  '{"description": "Volume-based pricing for sellers"}'::jsonb
);

-- Example 3: Hierarchical split (Platform → Partner → Seller)
INSERT INTO split_rules (
  platform_id,
  rule_name,
  rule_type,
  rule_config,
  created_by,
  metadata
) VALUES (
  gen_random_uuid(),
  'Partner Referral Split',
  'hierarchical',
  '[
    {"order": 1, "recipient_type": "platform", "percentage": 7},
    {"order": 2, "recipient_type": "partner", "percentage": 3},
    {"order": 3, "recipient_type": "seller", "percentage": 90}
  ]'::jsonb,
  gen_random_uuid(),
  '{"description": "Includes partner referral fee"}'::jsonb
);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE split_rules IS 'Split payment rules for marketplace platforms';
COMMENT ON TABLE payment_splits IS 'Executed splits for individual payments';
COMMENT ON TABLE split_settlements IS 'Batch settlements for split payouts';
COMMENT ON TABLE molam_audit_logs IS 'Immutable audit trail for compliance';

COMMENT ON COLUMN split_rules.rule_config IS 'JSONB configuration for split calculation';
COMMENT ON COLUMN payment_splits.risk_score IS 'SIRA ML risk score (0-100) for anomaly detection';
COMMENT ON COLUMN split_settlements.requires_manual_review IS 'Flag for high-risk settlements requiring human approval';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================