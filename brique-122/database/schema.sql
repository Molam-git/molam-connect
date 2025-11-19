-- ============================================================================
-- Brique 122 — Statement Ingestion & Reconciliation Schema
-- ============================================================================
-- Purpose: Enhanced schema for automated statement reconciliation
-- Features: Multi-level matching, anomaly detection, audit trail
-- ============================================================================

-- Extend bank_statement_lines from B121 with reconciliation fields
CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_statement_id UUID REFERENCES bank_statements_raw(id) ON DELETE CASCADE,
  bank_profile_id UUID NOT NULL REFERENCES bank_profiles(id),

  -- Transaction details
  statement_date DATE NOT NULL,
  value_date DATE,
  booking_date DATE,
  amount NUMERIC(20,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  debit_credit TEXT CHECK (debit_credit IN ('debit', 'credit')),

  -- Description & references
  description TEXT,
  reference TEXT, -- Our reference / transaction ID
  bank_reference TEXT, -- Bank's internal reference
  counterparty_name TEXT,
  counterparty_account TEXT,
  counterparty_bank TEXT,
  transaction_code TEXT,

  -- Reconciliation status
  reconciliation_status TEXT DEFAULT 'unmatched' CHECK (
    reconciliation_status IN ('unmatched', 'matched', 'partial_match', 'duplicate', 'anomaly', 'manual_review', 'ignored', 'error')
  ),

  -- Matching results
  matched_payout_slice_id UUID REFERENCES payout_slices(id),
  matched_payout_id UUID, -- parent payout
  matched_ledger_entry_id UUID, -- if using ledger
  match_confidence NUMERIC(5,2), -- 0-100 score
  match_method TEXT, -- 'exact', 'fuzzy', 'probabilistic', 'manual'
  match_timestamp TIMESTAMPTZ,
  matched_by TEXT, -- user_id or 'system'

  -- Anomaly detection
  anomaly_score NUMERIC(5,2), -- 0-100 from SIRA
  anomaly_type TEXT, -- 'amount_mismatch', 'currency_mismatch', 'duplicate', 'missing_reference', 'unexpected_payment'
  anomaly_details JSONB,
  requires_manual_review BOOLEAN DEFAULT FALSE,

  -- Reconciliation attempts
  reconciliation_attempts INT DEFAULT 0,
  last_reconciliation_attempt TIMESTAMPTZ,
  reconciliation_error TEXT,

  -- Duplicate detection
  duplicate_of UUID REFERENCES bank_statement_lines(id),
  is_duplicate BOOLEAN DEFAULT FALSE,

  -- Metadata
  raw JSONB, -- original parsed data
  metadata JSONB DEFAULT '{}',
  notes TEXT, -- manual notes from Ops

  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  reconciled_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bsl_bank_profile_date ON bank_statement_lines(bank_profile_id, statement_date);
CREATE INDEX IF NOT EXISTS idx_bsl_value_date ON bank_statement_lines(value_date);
CREATE INDEX IF NOT EXISTS idx_bsl_reconciliation_status ON bank_statement_lines(reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_bsl_reference ON bank_statement_lines(reference) WHERE reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bsl_bank_reference ON bank_statement_lines(bank_reference) WHERE bank_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bsl_amount_currency ON bank_statement_lines(amount, currency);
CREATE INDEX IF NOT EXISTS idx_bsl_matched_slice ON bank_statement_lines(matched_payout_slice_id);
CREATE INDEX IF NOT EXISTS idx_bsl_anomaly ON bank_statement_lines(reconciliation_status) WHERE reconciliation_status IN ('anomaly', 'manual_review');
CREATE INDEX IF NOT EXISTS idx_bsl_unmatched ON bank_statement_lines(reconciliation_status, statement_date) WHERE reconciliation_status = 'unmatched';
CREATE INDEX IF NOT EXISTS idx_bsl_counterparty ON bank_statement_lines(counterparty_account) WHERE counterparty_account IS NOT NULL;

-- Reconciliation rules (configurable matching logic)
CREATE TABLE IF NOT EXISTS reconciliation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_profile_id UUID REFERENCES bank_profiles(id),
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('exact', 'fuzzy', 'pattern', 'ml')),
  priority INT DEFAULT 100, -- lower = higher priority
  conditions JSONB NOT NULL, -- match conditions (amount tolerance, reference patterns, etc.)
  actions JSONB NOT NULL, -- what to do on match
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rr_bank_profile ON reconciliation_rules(bank_profile_id);
CREATE INDEX IF NOT EXISTS idx_rr_enabled ON reconciliation_rules(enabled) WHERE enabled = TRUE;

-- Reconciliation audit trail
CREATE TABLE IF NOT EXISTS reconciliation_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_line_id UUID NOT NULL REFERENCES bank_statement_lines(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'matched', 'unmatched', 'corrected', 'ignored'
  previous_status TEXT,
  new_status TEXT,
  previous_matched_slice_id UUID,
  new_matched_slice_id UUID,
  match_confidence NUMERIC(5,2),
  match_method TEXT,
  reason TEXT,
  performed_by TEXT, -- user_id or 'system'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ra_statement_line ON reconciliation_audit(statement_line_id);
CREATE INDEX IF NOT EXISTS idx_ra_created ON reconciliation_audit(created_at);

-- Reconciliation exceptions (for manual review queue)
CREATE TABLE IF NOT EXISTS reconciliation_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_line_id UUID NOT NULL REFERENCES bank_statement_lines(id) ON DELETE CASCADE,
  exception_type TEXT NOT NULL CHECK (
    exception_type IN ('amount_mismatch', 'currency_mismatch', 'duplicate', 'missing_reference',
                       'multiple_matches', 'no_match', 'anomaly', 'other')
  ),
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,
  suggested_action TEXT,
  suggested_match_id UUID, -- suggested payout_slice_id
  suggested_match_confidence NUMERIC(5,2),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'ignored')),
  assigned_to TEXT, -- user_id
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_re_statement_line ON reconciliation_exceptions(statement_line_id);
CREATE INDEX IF NOT EXISTS idx_re_status ON reconciliation_exceptions(status);
CREATE INDEX IF NOT EXISTS idx_re_severity ON reconciliation_exceptions(severity);
CREATE INDEX IF NOT EXISTS idx_re_type ON reconciliation_exceptions(exception_type);
CREATE INDEX IF NOT EXISTS idx_re_assigned ON reconciliation_exceptions(assigned_to) WHERE assigned_to IS NOT NULL;

-- Reconciliation metrics (daily aggregates)
CREATE TABLE IF NOT EXISTS reconciliation_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_profile_id UUID NOT NULL REFERENCES bank_profiles(id),
  metric_date DATE NOT NULL,

  -- Volume metrics
  total_lines_ingested INT DEFAULT 0,
  total_lines_matched INT DEFAULT 0,
  total_lines_unmatched INT DEFAULT 0,
  total_lines_anomaly INT DEFAULT 0,
  total_lines_duplicate INT DEFAULT 0,

  -- Amount metrics
  total_amount_matched NUMERIC(20,2) DEFAULT 0,
  total_amount_unmatched NUMERIC(20,2) DEFAULT 0,

  -- Performance metrics
  avg_reconciliation_time_ms INT,
  avg_match_confidence NUMERIC(5,2),

  -- Match method breakdown
  matches_exact INT DEFAULT 0,
  matches_fuzzy INT DEFAULT 0,
  matches_probabilistic INT DEFAULT 0,
  matches_manual INT DEFAULT 0,

  -- Anomaly breakdown
  anomalies_amount INT DEFAULT 0,
  anomalies_currency INT DEFAULT 0,
  anomalies_duplicate INT DEFAULT 0,
  anomalies_missing_ref INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(bank_profile_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_rm_bank_profile_date ON reconciliation_metrics(bank_profile_id, metric_date);

-- Webhook deliveries (for reconciliation events)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  webhook_url TEXT NOT NULL,
  http_method TEXT DEFAULT 'POST',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'retrying')),
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,
  response_status INT,
  response_body TEXT,
  error_message TEXT,
  next_retry_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wd_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_wd_next_retry ON webhook_deliveries(next_retry_at) WHERE status = 'retrying';
CREATE INDEX IF NOT EXISTS idx_wd_event_type ON webhook_deliveries(event_type);

-- Triggers for auto-updating updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_bsl_updated_at BEFORE UPDATE ON bank_statement_lines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_rr_updated_at BEFORE UPDATE ON reconciliation_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_re_updated_at BEFORE UPDATE ON reconciliation_exceptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_rm_updated_at BEFORE UPDATE ON reconciliation_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to increment reconciliation metrics
CREATE OR REPLACE FUNCTION increment_reconciliation_metric(
  p_bank_profile_id UUID,
  p_metric_date DATE,
  p_metric_name TEXT,
  p_increment INT DEFAULT 1
) RETURNS VOID AS $$
BEGIN
  INSERT INTO reconciliation_metrics (
    bank_profile_id,
    metric_date
  ) VALUES (
    p_bank_profile_id,
    p_metric_date
  )
  ON CONFLICT (bank_profile_id, metric_date) DO NOTHING;

  EXECUTE format(
    'UPDATE reconciliation_metrics SET %I = %I + $3 WHERE bank_profile_id = $1 AND metric_date = $2',
    p_metric_name, p_metric_name
  ) USING p_bank_profile_id, p_metric_date, p_increment;
END;
$$ LANGUAGE plpgsql;

-- Sample reconciliation rules
INSERT INTO reconciliation_rules (bank_profile_id, rule_name, rule_type, priority, conditions, actions)
SELECT
  id as bank_profile_id,
  'Exact amount and reference match',
  'exact',
  10,
  '{"amount_tolerance": 0.01, "require_reference": true, "currency_match": true}'::jsonb,
  '{"auto_match": true, "confidence": 100}'::jsonb
FROM bank_profiles
ON CONFLICT DO NOTHING;

-- ============================================================================
-- End of schema
-- ============================================================================
