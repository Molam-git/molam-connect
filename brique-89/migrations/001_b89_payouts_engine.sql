-- Brique 89 — Payouts & Settlement Engine
-- SQL Schema for payout processing system

-- ============================================================================
-- 1. PAYOUTS TABLE (core entity)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE NULL, -- idempotency key
  origin_module TEXT NOT NULL,  -- 'connect','wallet','agents','treasury'
  origin_entity_id UUID NULL,   -- merchant/agent/user id

  -- Amounts
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  molam_fee NUMERIC(10,2) DEFAULT 0 CHECK (molam_fee >= 0),
  bank_fee NUMERIC(10,2) DEFAULT 0 CHECK (bank_fee >= 0),
  total_debited NUMERIC(18,2) DEFAULT 0,
  net_to_beneficiary NUMERIC(18,2) NULL, -- actual amount sent (may differ if fees adjusted)

  -- Beneficiary details
  beneficiary JSONB NOT NULL, -- {account_number, bank_code, name, etc.}

  -- Routing
  bank_profile_id UUID NULL, -- REFERENCES bank_profiles(id) - added when routed
  treasury_account_id UUID NULL, -- REFERENCES treasury_accounts(id)
  routing_method TEXT NULL, -- 'instant','batch','sepa','swift', etc.

  -- Status & lifecycle
  status TEXT NOT NULL DEFAULT 'created',
  -- created → held → queued → processing → sent → settled → failed → reversed
  priority TEXT NOT NULL DEFAULT 'normal', -- normal|priority|instant
  scheduled_for TIMESTAMPTZ NULL, -- for scheduled payouts

  -- Processing metadata
  attempt_count INT DEFAULT 0,
  max_attempts INT DEFAULT 6,
  last_attempt_at TIMESTAMPTZ NULL,
  next_retry_at TIMESTAMPTZ NULL,
  provider_ref TEXT NULL, -- provider/bank reference
  batch_id UUID NULL, -- REFERENCES payout_batches(id)

  -- Hold mechanism
  hold_reason TEXT NULL,
  hold_until TIMESTAMPTZ NULL,
  hold_approved_by UUID[] DEFAULT ARRAY[]::UUID[],
  hold_approval_required INT DEFAULT 0,

  -- Approval workflow
  requires_approval BOOLEAN DEFAULT FALSE,
  approved_by UUID[] DEFAULT ARRAY[]::UUID[],
  approval_count INT DEFAULT 0,
  approval_required INT DEFAULT 0,

  -- Settlement
  settled_at TIMESTAMPTZ NULL,
  settled_amount NUMERIC(18,2) NULL,
  settlement_ref TEXT NULL, -- from bank statement reconciliation

  -- Ledger integration
  ledger_hold_id UUID NULL, -- reference to ledger hold
  ledger_entry_id UUID NULL, -- final ledger entry after settlement

  -- Audit
  created_by UUID NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  CONSTRAINT valid_status CHECK (status IN ('created','held','queued','processing','sent','settled','failed','reversed','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_payout_status ON payouts(status) WHERE status NOT IN ('settled','cancelled');
CREATE INDEX IF NOT EXISTS idx_payout_status_sched ON payouts(status, scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payout_priority ON payouts(priority) WHERE status IN ('created','queued');
CREATE INDEX IF NOT EXISTS idx_payout_origin ON payouts(origin_module, origin_entity_id);
CREATE INDEX IF NOT EXISTS idx_payout_bank_profile ON payouts(bank_profile_id) WHERE bank_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payout_batch ON payouts(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payout_provider_ref ON payouts(provider_ref) WHERE provider_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payout_settlement_ref ON payouts(settlement_ref) WHERE settlement_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payout_next_retry ON payouts(next_retry_at) WHERE next_retry_at IS NOT NULL;

COMMENT ON TABLE payouts IS 'Core payouts table for settlement engine';
COMMENT ON COLUMN payouts.external_id IS 'Idempotency key for duplicate prevention';
COMMENT ON COLUMN payouts.hold_reason IS 'Reason for hold: fraud_review, compliance_check, manual_review';
COMMENT ON COLUMN payouts.batch_id IS 'Link to batch if processed in batch mode';

-- ============================================================================
-- 2. PAYOUT BATCHES (grouping for bank submission)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Batch identification
  batch_ref TEXT UNIQUE NOT NULL, -- internal batch reference
  provider_batch_ref TEXT NULL, -- bank/provider batch reference

  -- Routing
  bank_profile_id UUID NOT NULL, -- REFERENCES bank_profiles(id)
  treasury_account_id UUID NOT NULL, -- REFERENCES treasury_accounts(id)
  currency TEXT NOT NULL,

  -- Batch metadata
  batch_date DATE DEFAULT CURRENT_DATE,
  cutoff_time TIME NULL, -- bank cutoff time for this batch
  batch_type TEXT NOT NULL DEFAULT 'standard', -- standard|priority|instant

  -- Status
  status TEXT NOT NULL DEFAULT 'open',
  -- open → prepared → submitted → acknowledged → settled → failed

  -- Aggregates
  total_amount NUMERIC(18,2) DEFAULT 0,
  item_count INT DEFAULT 0,
  successful_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,

  -- Processing
  prepared_at TIMESTAMPTZ NULL,
  submitted_at TIMESTAMPTZ NULL,
  acknowledged_at TIMESTAMPTZ NULL,
  settled_at TIMESTAMPTZ NULL,

  -- File handling
  file_path TEXT NULL, -- path to batch file (ISO20022, CSV, etc.)
  file_format TEXT NULL, -- 'iso20022','csv','pain.001'
  file_hash TEXT NULL, -- SHA256 of batch file

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT valid_batch_status CHECK (status IN ('open','prepared','submitted','acknowledged','settled','failed','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_batch_status ON payout_batches(status);
CREATE INDEX IF NOT EXISTS idx_batch_bank_date ON payout_batches(bank_profile_id, batch_date);
CREATE INDEX IF NOT EXISTS idx_batch_provider_ref ON payout_batches(provider_batch_ref) WHERE provider_batch_ref IS NOT NULL;

COMMENT ON TABLE payout_batches IS 'Batch grouping for optimized bank submission';

-- ============================================================================
-- 3. PAYOUT ATTEMPTS (immutable audit log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL, -- REFERENCES payouts(id) ON DELETE CASCADE
  batch_id UUID NULL, -- REFERENCES payout_batches(id)

  -- Attempt details
  attempt_number INT NOT NULL,
  attempted_at TIMESTAMPTZ DEFAULT now(),

  -- Request/response
  http_method TEXT NULL,
  http_code INT NULL,
  request_payload JSONB NULL,
  response_payload JSONB NULL,

  -- Result
  success BOOLEAN DEFAULT FALSE,
  provider_ref TEXT NULL,
  error_code TEXT NULL,
  error_message TEXT NULL,

  -- Performance
  latency_ms INT NULL,
  connector_name TEXT NULL,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_attempts_payout ON payout_attempts(payout_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_batch ON payout_attempts(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attempts_failed ON payout_attempts(payout_id) WHERE success = FALSE;

COMMENT ON TABLE payout_attempts IS 'Immutable log of all payout processing attempts';

-- ============================================================================
-- 4. PAYOUT HOLD APPROVALS (multi-signature)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_hold_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL, -- REFERENCES payouts(id)

  -- Approval details
  approver_id UUID NOT NULL,
  approver_role TEXT NOT NULL, -- 'finance_ops','treasury_ops','compliance'
  action TEXT NOT NULL, -- 'approve_release','approve_hold','reject'

  -- Reasoning
  comment TEXT NULL,
  approved_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_hold_approvals_payout ON payout_hold_approvals(payout_id, approved_at DESC);
CREATE INDEX IF NOT EXISTS idx_hold_approvals_user ON payout_hold_approvals(approver_id);

COMMENT ON TABLE payout_hold_approvals IS 'Multi-signature approval log for hold/release operations';

-- ============================================================================
-- 5. PAYOUT FEES CONFIGURATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_fee_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Rule identification
  rule_name TEXT UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  priority INT DEFAULT 100, -- higher priority rules evaluated first

  -- Conditions
  origin_module TEXT NULL, -- match specific module
  currency TEXT NULL,
  min_amount NUMERIC(18,2) NULL,
  max_amount NUMERIC(18,2) NULL,
  bank_profile_id UUID NULL,
  payout_priority TEXT NULL, -- instant|priority|normal

  -- Fee structure
  fee_type TEXT NOT NULL, -- 'fixed','percentage','tiered'
  fixed_fee NUMERIC(10,2) DEFAULT 0,
  percentage_fee NUMERIC(5,4) DEFAULT 0, -- e.g., 0.0150 = 1.5%
  min_fee NUMERIC(10,2) DEFAULT 0,
  max_fee NUMERIC(10,2) NULL,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT valid_fee_type CHECK (fee_type IN ('fixed','percentage','tiered'))
);

CREATE INDEX IF NOT EXISTS idx_fee_rules_active ON payout_fee_rules(active, priority DESC);

COMMENT ON TABLE payout_fee_rules IS 'Fee calculation rules for payouts';

-- ============================================================================
-- 6. PAYOUT DLQ (Dead Letter Queue)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL, -- REFERENCES payouts(id)

  -- DLQ details
  reason TEXT NOT NULL, -- 'max_retries_exceeded','permanent_failure','config_error'
  error_summary TEXT NOT NULL,
  last_error TEXT NULL,
  attempts_made INT DEFAULT 0,

  -- Resolution
  status TEXT DEFAULT 'pending', -- pending|investigating|resolved|abandoned
  assigned_to UUID NULL,
  resolved_at TIMESTAMPTZ NULL,
  resolution_notes TEXT NULL,

  -- Timestamps
  added_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dlq_status ON payout_dlq(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_dlq_payout ON payout_dlq(payout_id);
CREATE INDEX IF NOT EXISTS idx_dlq_assigned ON payout_dlq(assigned_to) WHERE assigned_to IS NOT NULL;

COMMENT ON TABLE payout_dlq IS 'Dead letter queue for failed payouts requiring manual intervention';

-- ============================================================================
-- 7. SETTLEMENT RECONCILIATION TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Linkage
  payout_id UUID NOT NULL, -- REFERENCES payouts(id)
  bank_statement_line_id UUID NULL, -- from B86 reconciliation

  -- Reconciliation details
  reconciled_at TIMESTAMPTZ DEFAULT now(),
  reconciled_by TEXT NULL, -- 'auto'|user_id

  -- Settlement data
  settled_amount NUMERIC(18,2) NOT NULL,
  settled_currency TEXT NOT NULL,
  actual_bank_fee NUMERIC(10,2) DEFAULT 0,
  settlement_date DATE NULL,

  -- Variance handling
  variance_amount NUMERIC(18,2) DEFAULT 0,
  variance_reason TEXT NULL,
  adjustment_id UUID NULL, -- REFERENCES ledger_adjustments(id) from B88

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_recon_payout ON payout_reconciliation(payout_id);
CREATE INDEX IF NOT EXISTS idx_recon_statement ON payout_reconciliation(bank_statement_line_id) WHERE bank_statement_line_id IS NOT NULL;

COMMENT ON TABLE payout_reconciliation IS 'Tracks settlement reconciliation between payouts and bank statements';

-- ============================================================================
-- 8. HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate total fee for a payout
CREATE OR REPLACE FUNCTION calculate_payout_fee(
  p_origin_module TEXT,
  p_currency TEXT,
  p_amount NUMERIC,
  p_priority TEXT,
  p_bank_profile_id UUID
) RETURNS NUMERIC AS $$
DECLARE
  v_fee NUMERIC := 0;
  v_rule RECORD;
BEGIN
  -- Find matching fee rule (highest priority first)
  SELECT * INTO v_rule
  FROM payout_fee_rules
  WHERE active = TRUE
    AND (origin_module IS NULL OR origin_module = p_origin_module)
    AND (currency IS NULL OR currency = p_currency)
    AND (min_amount IS NULL OR p_amount >= min_amount)
    AND (max_amount IS NULL OR p_amount <= max_amount)
    AND (bank_profile_id IS NULL OR bank_profile_id = p_bank_profile_id)
    AND (payout_priority IS NULL OR payout_priority = p_priority)
  ORDER BY priority DESC
  LIMIT 1;

  IF v_rule IS NOT NULL THEN
    CASE v_rule.fee_type
      WHEN 'fixed' THEN
        v_fee := v_rule.fixed_fee;
      WHEN 'percentage' THEN
        v_fee := p_amount * v_rule.percentage_fee;
        v_fee := GREATEST(v_fee, COALESCE(v_rule.min_fee, 0));
        v_fee := LEAST(v_fee, COALESCE(v_rule.max_fee, v_fee));
      ELSE
        v_fee := v_rule.fixed_fee;
    END CASE;
  END IF;

  RETURN ROUND(v_fee, 2);
END;
$$ LANGUAGE plpgsql;

-- Function to check if payout can be released from hold
CREATE OR REPLACE FUNCTION can_release_payout(p_payout_id UUID) RETURNS BOOLEAN AS $$
DECLARE
  v_payout RECORD;
  v_approval_count INT;
BEGIN
  SELECT * INTO v_payout FROM payouts WHERE id = p_payout_id;

  IF v_payout IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Not on hold
  IF v_payout.hold_reason IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Hold expired
  IF v_payout.hold_until IS NOT NULL AND v_payout.hold_until <= now() THEN
    RETURN TRUE;
  END IF;

  -- Check approvals
  SELECT COUNT(*) INTO v_approval_count
  FROM payout_hold_approvals
  WHERE payout_id = p_payout_id AND action = 'approve_release';

  IF v_approval_count >= v_payout.hold_approval_required THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate next retry time with exponential backoff
CREATE OR REPLACE FUNCTION calculate_next_retry(
  p_attempt_count INT
) RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_backoff_minutes INT[] := ARRAY[1, 5, 15, 60, 360, 1440]; -- 1m, 5m, 15m, 1h, 6h, 24h
  v_delay INT;
BEGIN
  IF p_attempt_count >= array_length(v_backoff_minutes, 1) THEN
    v_delay := v_backoff_minutes[array_length(v_backoff_minutes, 1)];
  ELSE
    v_delay := v_backoff_minutes[p_attempt_count + 1];
  END IF;

  RETURN now() + (v_delay || ' minutes')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. TRIGGERS
-- ============================================================================

-- Update updated_at on payouts
CREATE OR REPLACE FUNCTION update_payout_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payouts_updated_at
BEFORE UPDATE ON payouts
FOR EACH ROW
EXECUTE FUNCTION update_payout_updated_at();

-- Update updated_at on batches
CREATE TRIGGER batches_updated_at
BEFORE UPDATE ON payout_batches
FOR EACH ROW
EXECUTE FUNCTION update_payout_updated_at();

-- Auto-calculate total_debited on insert
CREATE OR REPLACE FUNCTION calculate_total_debited()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_debited = NEW.amount + NEW.molam_fee + NEW.bank_fee;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payouts_calculate_total
BEFORE INSERT OR UPDATE OF amount, molam_fee, bank_fee ON payouts
FOR EACH ROW
EXECUTE FUNCTION calculate_total_debited();

-- ============================================================================
-- 10. SEED DATA - FEE RULES
-- ============================================================================

-- Standard batch payout fees
INSERT INTO payout_fee_rules (rule_name, currency, payout_priority, fee_type, fixed_fee, percentage_fee, min_fee, priority)
VALUES
  ('batch_usd_standard', 'USD', 'normal', 'percentage', 0, 0.0050, 0.50, 100),
  ('batch_eur_standard', 'EUR', 'normal', 'percentage', 0, 0.0050, 0.45, 100),
  ('batch_xof_standard', 'XOF', 'normal', 'fixed', 250, 0, 250, 100)
ON CONFLICT (rule_name) DO NOTHING;

-- Instant payout fees (higher)
INSERT INTO payout_fee_rules (rule_name, currency, payout_priority, fee_type, fixed_fee, percentage_fee, min_fee, priority)
VALUES
  ('instant_usd', 'USD', 'instant', 'percentage', 2.00, 0.0150, 2.00, 200),
  ('instant_eur', 'EUR', 'instant', 'percentage', 1.80, 0.0150, 1.80, 200),
  ('instant_xof', 'XOF', 'instant', 'fixed', 1500, 0, 1500, 200)
ON CONFLICT (rule_name) DO NOTHING;

-- Priority payout fees
INSERT INTO payout_fee_rules (rule_name, currency, payout_priority, fee_type, fixed_fee, percentage_fee, min_fee, priority)
VALUES
  ('priority_usd', 'USD', 'priority', 'percentage', 1.00, 0.0100, 1.00, 150),
  ('priority_eur', 'EUR', 'priority', 'percentage', 0.90, 0.0100, 0.90, 150),
  ('priority_xof', 'XOF', 'priority', 'fixed', 750, 0, 750, 150)
ON CONFLICT (rule_name) DO NOTHING;

-- ============================================================================
-- 11. MATERIALIZED VIEW - PAYOUT METRICS
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS payout_metrics AS
SELECT
  DATE(created_at) as metric_date,
  origin_module,
  currency,
  priority,
  status,
  COUNT(*) as payout_count,
  SUM(amount) as total_amount,
  SUM(molam_fee) as total_molam_fees,
  SUM(bank_fee) as total_bank_fees,
  AVG(amount) as avg_amount,
  MIN(amount) as min_amount,
  MAX(amount) as max_amount
FROM payouts
GROUP BY DATE(created_at), origin_module, currency, priority, status;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_metrics_unique
ON payout_metrics(metric_date, origin_module, currency, priority, status);

COMMENT ON MATERIALIZED VIEW payout_metrics IS 'Daily aggregated payout metrics for monitoring';

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_payout_metrics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY payout_metrics;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMPLETION
-- ============================================================================

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON payouts TO app_user;
-- GRANT SELECT, INSERT, UPDATE ON payout_batches TO app_user;
-- GRANT SELECT, INSERT ON payout_attempts TO app_user;
-- GRANT SELECT, INSERT ON payout_hold_approvals TO app_user;

COMMENT ON SCHEMA public IS 'Brique 89 - Payouts & Settlement Engine - Schema v1.0';
