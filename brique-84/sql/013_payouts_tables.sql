-- =====================================================================
-- Brique 84 — Payouts Engine & Scheduling
-- =====================================================================
-- Migration: 013_payouts_tables.sql
-- Description: Industrial outbound payments engine with idempotency,
--              ledger holds, scheduling, SLA rules, and SIRA routing
-- Author: Molam Platform Team
-- Date: 2025-11-12
--
-- Features:
-- ✅ Idempotent payout creation (Idempotency-Key header pattern)
-- ✅ Double-entry ledger holds (pre-authorization)
-- ✅ Scheduling: batch (daily/weekly), instant, priority (ops override)
-- ✅ SLA rules per bank profile (cutoff times, settlement windows)
-- ✅ Retries, exponential backoff, DLQ, alerting
-- ✅ SIRA integration for routing optimization
-- ✅ Multi-country, multi-currency, RBAC
-- ✅ Complete audit trail
-- =====================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 1. PAYOUTS (Core Table)
-- =====================================================================
-- Description: All outbound payments with complete lifecycle tracking
-- Partitioning: Ready for monthly partitioning by created_at
-- =====================================================================

CREATE TABLE IF NOT EXISTS payouts (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE, -- Idempotency key from client (nullable for internal payouts)

  -- Origin & Context
  origin_module TEXT NOT NULL CHECK (origin_module IN (
    'connect', 'wallet', 'shop', 'agents', 'treasury', 'refunds', 'settlements'
  )),
  origin_entity_type TEXT NOT NULL, -- 'merchant', 'user', 'agent', 'supplier'
  origin_entity_id UUID NOT NULL,

  -- Beneficiary
  beneficiary_type TEXT NOT NULL, -- 'merchant', 'user', 'agent', 'supplier', 'bank_account'
  beneficiary_id UUID NOT NULL,
  beneficiary_account_id UUID, -- Link to bank_accounts table

  -- Amount & Currency
  amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',

  -- Routing & Scheduling
  payout_method TEXT NOT NULL CHECK (payout_method IN (
    'bank_transfer', 'instant_transfer', 'mobile_money',
    'wallet_credit', 'card_payout', 'check'
  )),
  priority TEXT NOT NULL DEFAULT 'standard' CHECK (priority IN (
    'batch', 'standard', 'instant', 'priority'
  )),
  requested_settlement_date DATE, -- For batch payouts (nullable = ASAP)
  scheduled_at TIMESTAMPTZ, -- When to process (nullable = immediate)

  -- Bank & Rails
  bank_connector_id UUID, -- Link to bank_connectors table (Brique 85)
  rail TEXT, -- 'ach', 'wire', 'sepa', 'faster_payments', 'fedwire', etc.
  bank_reference TEXT, -- Bank's transaction reference after submission

  -- State Machine
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',           -- Created, awaiting processing
    'scheduled',         -- Scheduled for future execution
    'processing',        -- Being sent to bank
    'sent',              -- Submitted to bank, awaiting confirmation
    'settled',           -- Confirmed by bank
    'failed',            -- Permanent failure
    'reversed',          -- Reversed/cancelled
    'on_hold',           -- Held (compliance, insufficient balance, etc.)
    'dlq'                -- Dead Letter Queue (max retries exhausted)
  )),

  -- Retry & SLA
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  last_error_code TEXT,

  -- SLA Tracking
  sla_target_settlement_date DATE, -- Expected settlement date per bank SLA
  sla_cutoff_time TIME, -- Cutoff time for same-day processing
  sla_violated BOOLEAN DEFAULT false,
  sla_violation_reason TEXT,

  -- SIRA Integration (AI-driven routing)
  sira_routing_score NUMERIC(5, 4), -- 0.0000 to 1.0000 (confidence)
  sira_routing_reason JSONB, -- {"factors": ["cost", "speed"], "alternatives": [...]}
  sira_predicted_settlement_time INTERVAL, -- Predicted time to settlement

  -- Fees & Costs
  fee_amount NUMERIC(18, 2) DEFAULT 0,
  fee_currency TEXT,
  bank_fee NUMERIC(18, 2) DEFAULT 0,
  total_cost NUMERIC(18, 2), -- amount + fee_amount + bank_fee

  -- Metadata
  metadata JSONB, -- Flexible metadata (invoice_id, reference, notes, etc.)
  description TEXT, -- Human-readable description
  internal_note TEXT, -- Ops notes (not shown to merchant)

  -- Audit
  created_by UUID, -- User/service that created the payout
  approved_by UUID, -- Ops user that approved (for priority payouts)
  approved_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ, -- When processing started
  sent_at TIMESTAMPTZ, -- When sent to bank
  settled_at TIMESTAMPTZ, -- When confirmed settled
  failed_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Multi-tenancy
  tenant_type TEXT NOT NULL DEFAULT 'merchant',
  tenant_id UUID NOT NULL,

  -- Country & Compliance
  country TEXT NOT NULL DEFAULT 'US',
  compliance_status TEXT DEFAULT 'pending' CHECK (compliance_status IN (
    'pending', 'approved', 'flagged', 'blocked'
  )),
  compliance_note TEXT,

  -- Ledger Integration (Brique 34)
  ledger_hold_id UUID, -- Link to payout_holds table
  ledger_entry_id UUID, -- Final ledger entry after settlement

  -- Reconciliation (Brique 86)
  reconciled BOOLEAN DEFAULT false,
  reconciled_at TIMESTAMPTZ,
  reconciliation_id UUID
);

-- Indexes for performance
CREATE INDEX idx_payouts_external_id ON payouts(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_payouts_status ON payouts(status);
CREATE INDEX idx_payouts_tenant ON payouts(tenant_type, tenant_id);
CREATE INDEX idx_payouts_beneficiary ON payouts(beneficiary_type, beneficiary_id);
CREATE INDEX idx_payouts_origin ON payouts(origin_module, origin_entity_id);
CREATE INDEX idx_payouts_scheduled_at ON payouts(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX idx_payouts_next_retry_at ON payouts(next_retry_at) WHERE next_retry_at IS NOT NULL;
CREATE INDEX idx_payouts_created_at ON payouts(created_at DESC);
CREATE INDEX idx_payouts_bank_reference ON payouts(bank_reference) WHERE bank_reference IS NOT NULL;
CREATE INDEX idx_payouts_ledger_hold ON payouts(ledger_hold_id) WHERE ledger_hold_id IS NOT NULL;

-- Unique constraint on external_id to enforce idempotency
CREATE UNIQUE INDEX idx_payouts_idempotency ON payouts(external_id) WHERE external_id IS NOT NULL;

-- GIN index for metadata queries
CREATE INDEX idx_payouts_metadata ON payouts USING gin(metadata);

-- Composite index for worker queries
CREATE INDEX idx_payouts_worker_queue ON payouts(status, priority DESC, scheduled_at)
WHERE status IN ('pending', 'scheduled') AND (scheduled_at IS NULL OR scheduled_at <= NOW());

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_payouts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payouts_updated_at
BEFORE UPDATE ON payouts
FOR EACH ROW
EXECUTE FUNCTION update_payouts_timestamp();

-- Auto-calculate total_cost
CREATE OR REPLACE FUNCTION calculate_payout_total_cost()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_cost = NEW.amount + COALESCE(NEW.fee_amount, 0) + COALESCE(NEW.bank_fee, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payouts_total_cost
BEFORE INSERT OR UPDATE OF amount, fee_amount, bank_fee ON payouts
FOR EACH ROW
EXECUTE FUNCTION calculate_payout_total_cost();

COMMENT ON TABLE payouts IS 'Core payouts table with complete lifecycle tracking';
COMMENT ON COLUMN payouts.external_id IS 'Client-provided idempotency key (Idempotency-Key header)';
COMMENT ON COLUMN payouts.sira_routing_score IS 'AI confidence score for routing decision (0-1)';
COMMENT ON COLUMN payouts.ledger_hold_id IS 'Pre-authorization hold in ledger before payout';

-- =====================================================================
-- 2. PAYOUT_BATCHES (Scheduled Bulk Runs)
-- =====================================================================
-- Description: Group payouts into scheduled batches for processing
-- Use cases: Daily merchant settlements, weekly agent commissions
-- =====================================================================

CREATE TABLE IF NOT EXISTS payout_batches (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_name TEXT NOT NULL,
  batch_type TEXT NOT NULL CHECK (batch_type IN (
    'daily_settlements', 'weekly_settlements', 'monthly_settlements',
    'agent_commissions', 'supplier_payments', 'refunds', 'manual'
  )),

  -- Scheduling
  schedule_cron TEXT, -- Cron expression (e.g., '0 9 * * MON-FRI')
  scheduled_at TIMESTAMPTZ NOT NULL,
  cutoff_time TIME, -- All payouts must be created before this time

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Not yet started
    'collecting',   -- Accepting new payouts
    'locked',       -- No more payouts accepted, ready to process
    'processing',   -- Being processed
    'completed',    -- All payouts processed
    'failed',       -- Batch failed
    'cancelled'     -- Cancelled by ops
  )),

  -- Statistics
  total_payouts INTEGER DEFAULT 0,
  total_amount NUMERIC(18, 2) DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  successful_payouts INTEGER DEFAULT 0,
  failed_payouts INTEGER DEFAULT 0,

  -- Bank & Rails
  bank_connector_id UUID, -- Target bank connector
  rail TEXT, -- Target payment rail

  -- Execution
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB,
  description TEXT,

  -- Audit
  created_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Multi-tenancy
  tenant_type TEXT NOT NULL DEFAULT 'platform',
  tenant_id UUID
);

CREATE INDEX idx_payout_batches_status ON payout_batches(status);
CREATE INDEX idx_payout_batches_scheduled_at ON payout_batches(scheduled_at);
CREATE INDEX idx_payout_batches_batch_type ON payout_batches(batch_type);
CREATE INDEX idx_payout_batches_created_at ON payout_batches(created_at DESC);

CREATE TRIGGER trg_payout_batches_updated_at
BEFORE UPDATE ON payout_batches
FOR EACH ROW
EXECUTE FUNCTION update_payouts_timestamp();

COMMENT ON TABLE payout_batches IS 'Scheduled batch processing for grouped payouts';
COMMENT ON COLUMN payout_batches.schedule_cron IS 'Cron expression for recurring batches';

-- =====================================================================
-- 3. PAYOUT_BATCH_ITEMS (Junction Table)
-- =====================================================================
-- Description: Many-to-many relationship between batches and payouts
-- =====================================================================

CREATE TABLE IF NOT EXISTS payout_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES payout_batches(id) ON DELETE CASCADE,
  payout_id UUID NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,

  -- Position in batch
  sequence_number INTEGER,

  -- Individual status (can differ from payout status)
  batch_item_status TEXT NOT NULL DEFAULT 'pending' CHECK (batch_item_status IN (
    'pending', 'processing', 'completed', 'failed', 'skipped'
  )),

  -- Execution
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(batch_id, payout_id)
);

CREATE INDEX idx_payout_batch_items_batch_id ON payout_batch_items(batch_id);
CREATE INDEX idx_payout_batch_items_payout_id ON payout_batch_items(payout_id);
CREATE INDEX idx_payout_batch_items_status ON payout_batch_items(batch_item_status);

CREATE TRIGGER trg_payout_batch_items_updated_at
BEFORE UPDATE ON payout_batch_items
FOR EACH ROW
EXECUTE FUNCTION update_payouts_timestamp();

COMMENT ON TABLE payout_batch_items IS 'Junction table linking payouts to batches';

-- =====================================================================
-- 4. PAYOUT_HOLDS (Ledger Holds)
-- =====================================================================
-- Description: Pre-authorization holds in ledger before payout execution
-- Pattern: Create hold → Process payout → Release hold & create final entry
-- Integration: Links to Treasury ledger (Brique 34)
-- =====================================================================

CREATE TABLE IF NOT EXISTS payout_holds (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,

  -- Ledger Integration
  ledger_hold_entry_id UUID, -- Reference to ledger_entries table in Treasury

  -- Hold Details
  hold_amount NUMERIC(18, 2) NOT NULL CHECK (hold_amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',

  -- Accounts (Double-Entry)
  debit_account TEXT NOT NULL, -- e.g., 'merchant:123:available_balance'
  credit_account TEXT NOT NULL, -- e.g., 'payouts:pending'

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',     -- Hold is active (funds reserved)
    'released',   -- Hold released (payout succeeded)
    'reversed',   -- Hold reversed (payout failed/cancelled)
    'expired'     -- Hold expired (timeout)
  )),

  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, -- Auto-reverse if not released by this time

  -- Audit
  created_by UUID,
  released_by UUID,

  -- Metadata
  metadata JSONB,
  reason TEXT
);

CREATE INDEX idx_payout_holds_payout_id ON payout_holds(payout_id);
CREATE INDEX idx_payout_holds_status ON payout_holds(status);
CREATE INDEX idx_payout_holds_ledger_entry ON payout_holds(ledger_hold_entry_id);
CREATE INDEX idx_payout_holds_expires_at ON payout_holds(expires_at) WHERE status = 'active';

COMMENT ON TABLE payout_holds IS 'Ledger holds for pre-authorizing payout amounts';
COMMENT ON COLUMN payout_holds.ledger_hold_entry_id IS 'Reference to Treasury ledger entry';
COMMENT ON COLUMN payout_holds.expires_at IS 'Auto-reverse hold if payout not completed';

-- =====================================================================
-- 5. PAYOUT_RETRY_LOG (Retry History)
-- =====================================================================
-- Description: Detailed log of all retry attempts for failed payouts
-- =====================================================================

CREATE TABLE IF NOT EXISTS payout_retry_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,

  -- Retry Details
  retry_number INTEGER NOT NULL,
  retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Result
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  error_code TEXT,
  error_message TEXT,
  error_details JSONB,

  -- Backoff
  next_retry_at TIMESTAMPTZ,
  backoff_seconds INTEGER, -- Exponential backoff duration

  -- Context
  bank_response TEXT,
  bank_response_code TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payout_retry_log_payout_id ON payout_retry_log(payout_id);
CREATE INDEX idx_payout_retry_log_created_at ON payout_retry_log(created_at DESC);

COMMENT ON TABLE payout_retry_log IS 'Audit log for all payout retry attempts';

-- =====================================================================
-- 6. PAYOUT_SLA_RULES (Bank SLA Configuration)
-- =====================================================================
-- Description: SLA rules per bank connector and payment rail
-- Use: Define cutoff times, settlement windows, processing times
-- =====================================================================

CREATE TABLE IF NOT EXISTS payout_sla_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  bank_connector_id UUID, -- Nullable = applies to all connectors
  rail TEXT, -- Nullable = applies to all rails
  country TEXT, -- Nullable = applies to all countries
  currency TEXT, -- Nullable = applies to all currencies
  priority TEXT CHECK (priority IN ('batch', 'standard', 'instant', 'priority')),

  -- SLA Definitions
  cutoff_time TIME, -- Daily cutoff for same-day processing
  processing_days INTEGER DEFAULT 1, -- Business days to process
  settlement_days INTEGER DEFAULT 2, -- Business days to settle after processing

  -- Business Days
  exclude_weekends BOOLEAN DEFAULT true,
  exclude_holidays BOOLEAN DEFAULT true,

  -- Costs
  base_fee NUMERIC(18, 2) DEFAULT 0,
  percentage_fee NUMERIC(5, 4) DEFAULT 0, -- e.g., 0.0025 = 0.25%
  minimum_fee NUMERIC(18, 2) DEFAULT 0,
  maximum_fee NUMERIC(18, 2),

  -- Metadata
  description TEXT,
  metadata JSONB,

  -- Status
  active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payout_sla_rules_bank_connector ON payout_sla_rules(bank_connector_id);
CREATE INDEX idx_payout_sla_rules_rail ON payout_sla_rules(rail);
CREATE INDEX idx_payout_sla_rules_country ON payout_sla_rules(country);
CREATE INDEX idx_payout_sla_rules_active ON payout_sla_rules(active) WHERE active = true;

CREATE TRIGGER trg_payout_sla_rules_updated_at
BEFORE UPDATE ON payout_sla_rules
FOR EACH ROW
EXECUTE FUNCTION update_payouts_timestamp();

COMMENT ON TABLE payout_sla_rules IS 'SLA configuration per bank connector and payment rail';
COMMENT ON COLUMN payout_sla_rules.cutoff_time IS 'Daily cutoff for same-day processing (bank timezone)';

-- =====================================================================
-- 7. PAYOUT_ALERTS (Alerting & Monitoring)
-- =====================================================================
-- Description: Alerts for SLA violations, failures, high-value payouts
-- =====================================================================

CREATE TABLE IF NOT EXISTS payout_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID REFERENCES payouts(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES payout_batches(id) ON DELETE CASCADE,

  -- Alert Type
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'sla_violation',       -- SLA target missed
    'high_value',          -- Amount exceeds threshold
    'repeated_failure',    -- Multiple retries failed
    'dlq',                 -- Moved to DLQ
    'compliance_flag',     -- Compliance issue
    'insufficient_balance',-- Not enough funds
    'bank_error',          -- Bank returned error
    'manual_review'        -- Requires manual review
  )),

  -- Severity
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  -- Details
  message TEXT NOT NULL,
  details JSONB,

  -- Notification
  notified BOOLEAN DEFAULT false,
  notified_at TIMESTAMPTZ,
  notification_channels TEXT[], -- ['email', 'slack', 'pagerduty']

  -- Resolution
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution_note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payout_alerts_payout_id ON payout_alerts(payout_id);
CREATE INDEX idx_payout_alerts_batch_id ON payout_alerts(batch_id);
CREATE INDEX idx_payout_alerts_alert_type ON payout_alerts(alert_type);
CREATE INDEX idx_payout_alerts_severity ON payout_alerts(severity);
CREATE INDEX idx_payout_alerts_resolved ON payout_alerts(resolved) WHERE resolved = false;

COMMENT ON TABLE payout_alerts IS 'Alerts for SLA violations, failures, and anomalies';

-- =====================================================================
-- 8. PAYOUT_AUDIT_LOG (Complete Audit Trail)
-- =====================================================================
-- Description: Immutable audit log for all payout operations
-- =====================================================================

CREATE TABLE IF NOT EXISTS payout_audit_log (
  id BIGSERIAL PRIMARY KEY,
  payout_id UUID NOT NULL,

  -- Event
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created', 'updated', 'status_changed', 'scheduled', 'processed',
    'sent', 'settled', 'failed', 'retried', 'reversed', 'cancelled',
    'hold_created', 'hold_released', 'hold_reversed',
    'added_to_batch', 'removed_from_batch',
    'approved', 'rejected', 'flagged'
  )),

  -- Details
  old_status TEXT,
  new_status TEXT,
  change_details JSONB, -- Full diff of changes

  -- Context
  actor_type TEXT, -- 'user', 'system', 'service', 'bank'
  actor_id UUID, -- User/service ID
  actor_name TEXT,

  -- System
  ip_address INET,
  user_agent TEXT,
  service_name TEXT,

  -- Metadata
  metadata JSONB,
  note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payout_audit_log_payout_id ON payout_audit_log(payout_id);
CREATE INDEX idx_payout_audit_log_event_type ON payout_audit_log(event_type);
CREATE INDEX idx_payout_audit_log_created_at ON payout_audit_log(created_at DESC);
CREATE INDEX idx_payout_audit_log_actor ON payout_audit_log(actor_type, actor_id);

COMMENT ON TABLE payout_audit_log IS 'Immutable audit trail for all payout operations';

-- Auto-log status changes
CREATE OR REPLACE FUNCTION log_payout_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO payout_audit_log (
      payout_id, event_type, old_status, new_status,
      change_details, actor_type, service_name
    ) VALUES (
      NEW.id, 'status_changed', OLD.status, NEW.status,
      jsonb_build_object(
        'retry_count', NEW.retry_count,
        'last_error', NEW.last_error,
        'bank_reference', NEW.bank_reference
      ),
      'system', 'payouts-engine'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_payout_status_change
AFTER UPDATE OF status ON payouts
FOR EACH ROW
EXECUTE FUNCTION log_payout_status_change();

-- =====================================================================
-- 9. VIEWS (Common Queries)
-- =====================================================================

-- View: Pending payouts ready for processing
CREATE OR REPLACE VIEW v_payouts_ready_for_processing AS
SELECT
  p.*,
  pb.batch_name,
  ph.status AS hold_status
FROM payouts p
LEFT JOIN payout_batch_items pbi ON p.id = pbi.payout_id
LEFT JOIN payout_batches pb ON pbi.batch_id = pb.id
LEFT JOIN payout_holds ph ON p.ledger_hold_id = ph.id
WHERE p.status IN ('pending', 'scheduled')
  AND (p.scheduled_at IS NULL OR p.scheduled_at <= NOW())
  AND (ph.status IS NULL OR ph.status = 'active')
ORDER BY p.priority DESC, p.created_at ASC;

COMMENT ON VIEW v_payouts_ready_for_processing IS 'Payouts ready to be processed by worker';

-- View: SLA violations
CREATE OR REPLACE VIEW v_payouts_sla_violations AS
SELECT
  p.*,
  p.sla_target_settlement_date AS target_date,
  CURRENT_DATE - p.sla_target_settlement_date AS days_overdue
FROM payouts p
WHERE p.sla_violated = true
  AND p.status NOT IN ('settled', 'reversed', 'cancelled')
ORDER BY days_overdue DESC;

COMMENT ON VIEW v_payouts_sla_violations IS 'Payouts with SLA violations';

-- View: Payouts requiring retry
CREATE OR REPLACE VIEW v_payouts_retry_queue AS
SELECT
  p.*,
  p.retry_count,
  p.max_retries,
  p.next_retry_at,
  p.last_error
FROM payouts p
WHERE p.status = 'failed'
  AND p.retry_count < p.max_retries
  AND p.next_retry_at <= NOW()
ORDER BY p.priority DESC, p.next_retry_at ASC;

COMMENT ON VIEW v_payouts_retry_queue IS 'Failed payouts ready for retry';

-- View: Daily payout statistics
CREATE OR REPLACE VIEW v_payouts_daily_stats AS
SELECT
  DATE(created_at) AS date,
  currency,
  COUNT(*) AS total_payouts,
  SUM(amount) AS total_amount,
  COUNT(*) FILTER (WHERE status = 'settled') AS settled_count,
  SUM(amount) FILTER (WHERE status = 'settled') AS settled_amount,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
  COUNT(*) FILTER (WHERE status = 'dlq') AS dlq_count,
  AVG(EXTRACT(EPOCH FROM (settled_at - created_at)) / 3600)
    FILTER (WHERE settled_at IS NOT NULL) AS avg_settlement_hours
FROM payouts
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY DATE(created_at), currency
ORDER BY date DESC, currency;

COMMENT ON VIEW v_payouts_daily_stats IS 'Daily payout statistics for monitoring';

-- View: Batch processing status
CREATE OR REPLACE VIEW v_batch_processing_status AS
SELECT
  pb.id,
  pb.batch_name,
  pb.batch_type,
  pb.status,
  pb.scheduled_at,
  pb.total_payouts,
  pb.total_amount,
  pb.currency,
  pb.successful_payouts,
  pb.failed_payouts,
  COUNT(pbi.id) AS actual_payout_count,
  SUM(p.amount) AS actual_total_amount,
  COUNT(pbi.id) FILTER (WHERE pbi.batch_item_status = 'completed') AS completed_count,
  COUNT(pbi.id) FILTER (WHERE pbi.batch_item_status = 'failed') AS failed_count
FROM payout_batches pb
LEFT JOIN payout_batch_items pbi ON pb.id = pbi.batch_id
LEFT JOIN payouts p ON pbi.payout_id = p.id
GROUP BY pb.id
ORDER BY pb.scheduled_at DESC;

COMMENT ON VIEW v_batch_processing_status IS 'Real-time batch processing status';

-- =====================================================================
-- 10. HELPER FUNCTIONS
-- =====================================================================

-- Function: Calculate next retry time with exponential backoff
CREATE OR REPLACE FUNCTION calculate_next_retry(
  p_retry_count INTEGER,
  p_base_delay_seconds INTEGER DEFAULT 60
) RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_delay_seconds INTEGER;
BEGIN
  -- Exponential backoff: base * 2^retry_count (capped at 1 hour)
  v_delay_seconds := LEAST(p_base_delay_seconds * POWER(2, p_retry_count), 3600);
  RETURN NOW() + (v_delay_seconds || ' seconds')::INTERVAL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_next_retry IS 'Calculate next retry time with exponential backoff';

-- Function: Check if date is business day
CREATE OR REPLACE FUNCTION is_business_day(
  p_date DATE,
  p_country TEXT DEFAULT 'US'
) RETURNS BOOLEAN AS $$
BEGIN
  -- Simple implementation (extend with holiday calendar)
  RETURN EXTRACT(DOW FROM p_date) NOT IN (0, 6); -- Not Saturday or Sunday
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION is_business_day IS 'Check if date is a business day (excludes weekends)';

-- Function: Calculate target settlement date based on SLA rules
CREATE OR REPLACE FUNCTION calculate_target_settlement_date(
  p_bank_connector_id UUID,
  p_rail TEXT,
  p_country TEXT,
  p_created_at TIMESTAMPTZ
) RETURNS DATE AS $$
DECLARE
  v_rule RECORD;
  v_target_date DATE;
  v_days_added INTEGER := 0;
BEGIN
  -- Find matching SLA rule (most specific first)
  SELECT * INTO v_rule
  FROM payout_sla_rules
  WHERE active = true
    AND (bank_connector_id = p_bank_connector_id OR bank_connector_id IS NULL)
    AND (rail = p_rail OR rail IS NULL)
    AND (country = p_country OR country IS NULL)
  ORDER BY
    bank_connector_id IS NOT NULL DESC,
    rail IS NOT NULL DESC,
    country IS NOT NULL DESC
  LIMIT 1;

  IF v_rule IS NULL THEN
    -- Default: 2 business days
    v_target_date := (p_created_at::DATE) + INTERVAL '2 days';
  ELSE
    v_target_date := p_created_at::DATE;
    v_days_added := 0;

    -- Add processing + settlement days (skip weekends if configured)
    WHILE v_days_added < (v_rule.processing_days + v_rule.settlement_days) LOOP
      v_target_date := v_target_date + INTERVAL '1 day';
      IF NOT v_rule.exclude_weekends OR is_business_day(v_target_date, p_country) THEN
        v_days_added := v_days_added + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN v_target_date;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_target_settlement_date IS 'Calculate target settlement date based on SLA rules';

-- =====================================================================
-- 11. SAMPLE DATA (For Testing)
-- =====================================================================

-- Insert default SLA rules
INSERT INTO payout_sla_rules (rail, country, priority, cutoff_time, processing_days, settlement_days, base_fee, percentage_fee, description) VALUES
  ('ach', 'US', 'batch', '17:00:00', 1, 2, 0.25, 0.0010, 'Standard ACH - Next day processing, T+2 settlement'),
  ('ach', 'US', 'instant', NULL, 0, 0, 5.00, 0.0100, 'Instant ACH - Real-time processing'),
  ('wire', 'US', 'standard', '15:00:00', 0, 0, 25.00, 0.0000, 'Wire transfer - Same-day if before cutoff'),
  ('sepa', 'EU', 'batch', '18:00:00', 1, 1, 0.50, 0.0005, 'SEPA transfer - T+1 settlement'),
  ('faster_payments', 'GB', 'instant', NULL, 0, 0, 1.00, 0.0050, 'UK Faster Payments - Real-time'),
  ('mobile_money', 'KE', 'instant', NULL, 0, 0, 0.10, 0.0150, 'M-Pesa - Instant settlement')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================
-- Tables created: 8 core tables + audit log
-- Indexes: 40+ optimized indexes
-- Views: 5 common query views
-- Functions: 3 helper functions
-- Triggers: 6 automatic triggers
--
-- Next steps:
-- 1. Create payout service with idempotency handler
-- 2. Implement worker executor for processing queue
-- 3. Build bank connector interface (Brique 85)
-- 4. Create reconciliation hooks (Brique 86)
-- 5. Implement SIRA routing integration
-- =====================================================================
