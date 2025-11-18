-- Brique 86: Statement Ingestion & Reconciliation Worker
-- Handles bank statement parsing, normalization, and automatic reconciliation with payouts/transactions

-- ============================================================================
-- PART 1: Raw Statements Storage (Immutable Source)
-- ============================================================================

-- Raw bank statement files (MT940, CAMT, API feeds)
CREATE TABLE IF NOT EXISTS bank_statements_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_profile_id UUID NOT NULL, -- References B34 bank profiles
  external_file_id TEXT NOT NULL UNIQUE, -- Idempotency key (hash or provider ID)
  file_s3_key TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'mt940', 'camt', 'api_json', etc.
  file_size_bytes BIGINT,
  uploaded_by UUID, -- Molam ID of uploader (user or system)
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'uploaded', -- 'uploaded', 'parsing', 'parsed', 'parse_failed'
  parsed_at TIMESTAMPTZ,
  parsed_error TEXT,
  metadata JSONB DEFAULT '{}', -- Bank-specific metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_statements_raw_status ON bank_statements_raw(status) WHERE status IN ('uploaded', 'parsing');
CREATE INDEX IF NOT EXISTS idx_bank_statements_raw_bank ON bank_statements_raw(bank_profile_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_raw_imported ON bank_statements_raw(imported_at DESC);

COMMENT ON TABLE bank_statements_raw IS 'Immutable storage for raw bank statement files (MT940, CAMT, etc.)';
COMMENT ON COLUMN bank_statements_raw.external_file_id IS 'Unique identifier for idempotency (SHA256 hash or provider file ID)';

-- ============================================================================
-- PART 2: Normalized Statement Lines
-- ============================================================================

-- Normalized bank statement transaction lines
CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_statement_id UUID REFERENCES bank_statements_raw(id),
  bank_profile_id UUID NOT NULL, -- For multi-bank queries
  statement_date DATE NOT NULL, -- Statement issue date
  value_date DATE NOT NULL, -- Transaction value date
  booking_date DATE, -- Transaction booking date (if different)
  amount NUMERIC(20, 4) NOT NULL,
  currency TEXT NOT NULL,
  description TEXT, -- Free-text description from bank
  reference TEXT, -- Extracted reference code (e.g., payment reference)
  provider_ref TEXT, -- Provider-specific reference (e.g., Stripe transfer ID)
  beneficiary_name TEXT, -- Counterparty name
  beneficiary_account TEXT, -- Counterparty account/IBAN (redacted in UI)
  transaction_type TEXT, -- 'credit', 'debit', 'fee', 'reversal'
  reconciliation_status TEXT NOT NULL DEFAULT 'unmatched', -- 'unmatched', 'matched', 'suspicious', 'manual_review'
  matched_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}', -- Parser-specific fields
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_lines_status ON bank_statement_lines(reconciliation_status) WHERE reconciliation_status = 'unmatched';
CREATE INDEX IF NOT EXISTS idx_bank_lines_bank ON bank_statement_lines(bank_profile_id);
CREATE INDEX IF NOT EXISTS idx_bank_lines_value_date ON bank_statement_lines(value_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_lines_reference ON bank_statement_lines(reference) WHERE reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_lines_provider_ref ON bank_statement_lines(provider_ref) WHERE provider_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_lines_amount_currency ON bank_statement_lines(currency, amount);

COMMENT ON TABLE bank_statement_lines IS 'Normalized bank statement transaction lines for reconciliation';
COMMENT ON COLUMN bank_statement_lines.reference IS 'Extracted payment reference (e.g., payout.reference_code)';
COMMENT ON COLUMN bank_statement_lines.provider_ref IS 'Provider-specific reference (e.g., Stripe po_xxx)';

-- ============================================================================
-- PART 3: Reconciliation Matches
-- ============================================================================

-- Successful reconciliation matches between statement lines and entities
CREATE TABLE IF NOT EXISTS reconciliation_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_statement_line_id UUID NOT NULL REFERENCES bank_statement_lines(id),
  matched_type TEXT NOT NULL, -- 'payout', 'wallet_txn', 'invoice_payment', 'adjustment', 'fee'
  matched_entity_id UUID, -- ID of matched entity (payout.id, wallet_txn.id, etc.)
  match_score NUMERIC(5,4) NOT NULL DEFAULT 1.0, -- Confidence score 0.0-1.0
  match_rule TEXT NOT NULL, -- 'exact_ref', 'provider_ref', 'fuzzy_amount_date', 'manual'
  matched_by UUID, -- User ID if manual match (Molam ID)
  reconciled_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT, -- Manual match notes
  metadata JSONB DEFAULT '{}', -- Additional match metadata
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recon_line ON reconciliation_matches(bank_statement_line_id);
CREATE INDEX IF NOT EXISTS idx_recon_entity ON reconciliation_matches(matched_entity_id);
CREATE INDEX IF NOT EXISTS idx_recon_type ON reconciliation_matches(matched_type);
CREATE INDEX IF NOT EXISTS idx_recon_score ON reconciliation_matches(match_score) WHERE match_score < 0.9;

COMMENT ON TABLE reconciliation_matches IS 'Successful reconciliation matches between statement lines and payouts/transactions';
COMMENT ON COLUMN reconciliation_matches.match_score IS 'Confidence score: 1.0 = exact match, <0.9 = requires verification';

-- ============================================================================
-- PART 4: Reconciliation Queue (Manual Review)
-- ============================================================================

-- Queue for manual reconciliation review
CREATE TABLE IF NOT EXISTS reconciliation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_statement_line_id UUID NOT NULL REFERENCES bank_statement_lines(id),
  reason TEXT NOT NULL, -- 'no_candidate', 'multiple_candidates', 'amount_mismatch', 'suspicious_pattern'
  severity TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  candidate_entities JSONB DEFAULT '[]', -- Array of potential matches with scores
  assigned_to UUID, -- User ID (Molam ID)
  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'in_review', 'resolved', 'ignored'
  resolution TEXT, -- 'matched', 'adjustment_created', 'fraud_flagged', 'duplicate_ignored'
  resolved_at TIMESTAMPTZ,
  resolved_by UUID, -- User ID (Molam ID)
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recq_status ON reconciliation_queue(status) WHERE status IN ('open', 'in_review');
CREATE INDEX IF NOT EXISTS idx_recq_severity ON reconciliation_queue(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recq_assigned ON reconciliation_queue(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recq_line ON reconciliation_queue(bank_statement_line_id);

COMMENT ON TABLE reconciliation_queue IS 'Manual review queue for unmatched or suspicious statement lines';
COMMENT ON COLUMN reconciliation_queue.candidate_entities IS 'JSON array of potential matches: [{type, id, score, reason}]';

-- ============================================================================
-- PART 5: Reconciliation Configuration
-- ============================================================================

-- Bank-specific reconciliation rules and tolerances
CREATE TABLE IF NOT EXISTS reconciliation_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_profile_id UUID NOT NULL UNIQUE,
  tolerance_pct NUMERIC(6,5) DEFAULT 0.00500, -- 0.5% default tolerance
  tolerance_cents INTEGER DEFAULT 100, -- 100 cents = $1.00 tolerance
  date_window_days INTEGER DEFAULT 2, -- ±2 days for date matching
  auto_match_threshold NUMERIC(5,4) DEFAULT 0.85, -- Min score for auto-match
  reference_patterns JSONB DEFAULT '[]', -- Regex patterns for extracting references
  provider_fee_patterns JSONB DEFAULT '[]', -- Known fee patterns to auto-adjust
  enabled BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recon_config_bank ON reconciliation_config(bank_profile_id);

COMMENT ON TABLE reconciliation_config IS 'Bank-specific reconciliation rules and tolerance thresholds';
COMMENT ON COLUMN reconciliation_config.reference_patterns IS 'Array of regex patterns to extract payment references from descriptions';

-- ============================================================================
-- PART 6: Reconciliation Audit Log (Immutable)
-- ============================================================================

-- Immutable audit trail of all reconciliation actions
CREATE TABLE IF NOT EXISTS reconciliation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_statement_line_id UUID,
  match_id UUID,
  queue_id UUID,
  actor UUID, -- User ID (Molam ID) or 'system'
  actor_type TEXT NOT NULL DEFAULT 'system', -- 'system', 'user', 'api'
  action TEXT NOT NULL, -- 'auto_matched', 'manual_matched', 'queued', 'adjusted', 'flagged', 'ignored'
  details JSONB NOT NULL, -- Action-specific details
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recon_logs_line ON reconciliation_logs(bank_statement_line_id);
CREATE INDEX IF NOT EXISTS idx_recon_logs_actor ON reconciliation_logs(actor);
CREATE INDEX IF NOT EXISTS idx_recon_logs_action ON reconciliation_logs(action, created_at DESC);

COMMENT ON TABLE reconciliation_logs IS 'Immutable audit trail of all reconciliation actions';

-- ============================================================================
-- PART 7: Adjustments & Corrections
-- ============================================================================

-- Financial adjustments for reconciliation discrepancies
CREATE TABLE IF NOT EXISTS reconciliation_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_statement_line_id UUID NOT NULL REFERENCES bank_statement_lines(id),
  payout_id UUID, -- Related payout if applicable
  adjustment_type TEXT NOT NULL, -- 'fee_withholding', 'fx_variance', 'partial_settlement', 'reversal'
  original_amount NUMERIC(20, 4) NOT NULL,
  adjusted_amount NUMERIC(20, 4) NOT NULL,
  difference_amount NUMERIC(20, 4) NOT NULL,
  currency TEXT NOT NULL,
  reason TEXT NOT NULL,
  ledger_entries JSONB, -- Generated GL entries
  approved_by UUID, -- User ID (Molam ID)
  approved_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'posted'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adjust_line ON reconciliation_adjustments(bank_statement_line_id);
CREATE INDEX IF NOT EXISTS idx_adjust_payout ON reconciliation_adjustments(payout_id) WHERE payout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_adjust_status ON reconciliation_adjustments(status) WHERE status = 'pending';

COMMENT ON TABLE reconciliation_adjustments IS 'Financial adjustments for reconciliation discrepancies (fees, FX variance, etc.)';

-- ============================================================================
-- PART 8: Metrics & Performance Views
-- ============================================================================

-- Materialized view for reconciliation performance metrics (refreshed periodically)
CREATE MATERIALIZED VIEW IF NOT EXISTS reconciliation_metrics AS
SELECT
  DATE_TRUNC('day', created_at) AS metric_date,
  bank_profile_id,
  COUNT(*) AS total_lines,
  COUNT(*) FILTER (WHERE reconciliation_status = 'matched') AS matched_count,
  COUNT(*) FILTER (WHERE reconciliation_status = 'unmatched') AS unmatched_count,
  COUNT(*) FILTER (WHERE reconciliation_status = 'suspicious') AS suspicious_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE reconciliation_status = 'matched') / NULLIF(COUNT(*), 0), 2) AS match_rate_pct,
  SUM(amount) FILTER (WHERE reconciliation_status = 'matched') AS matched_amount,
  SUM(amount) FILTER (WHERE reconciliation_status = 'unmatched') AS unmatched_amount,
  currency
FROM bank_statement_lines
GROUP BY DATE_TRUNC('day', created_at), bank_profile_id, currency;

CREATE UNIQUE INDEX IF NOT EXISTS idx_recon_metrics_date_bank ON reconciliation_metrics(metric_date, bank_profile_id, currency);

COMMENT ON MATERIALIZED VIEW reconciliation_metrics IS 'Daily reconciliation performance metrics (refresh with: REFRESH MATERIALIZED VIEW CONCURRENTLY reconciliation_metrics)';

-- ============================================================================
-- PART 9: Triggers & Automation
-- ============================================================================

-- Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bank_statements_raw_updated_at BEFORE UPDATE ON bank_statements_raw
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bank_statement_lines_updated_at BEFORE UPDATE ON bank_statement_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reconciliation_queue_updated_at BEFORE UPDATE ON reconciliation_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reconciliation_config_updated_at BEFORE UPDATE ON reconciliation_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reconciliation_adjustments_updated_at BEFORE UPDATE ON reconciliation_adjustments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 10: Sample Data & Seed Configuration
-- ============================================================================

-- Insert default reconciliation configuration for testing
-- (In production, this would be populated per bank during onboarding)
INSERT INTO reconciliation_config (bank_profile_id, tolerance_pct, tolerance_cents, date_window_days, auto_match_threshold)
VALUES
  ('00000000-0000-0000-0000-000000000001', 0.005, 100, 2, 0.85), -- Example bank A
  ('00000000-0000-0000-0000-000000000002', 0.010, 200, 3, 0.80)  -- Example bank B (higher tolerance)
ON CONFLICT (bank_profile_id) DO NOTHING;

-- ============================================================================
-- PART 11: RBAC Grants (Example)
-- ============================================================================

-- Grant permissions to ops role for manual reconciliation
-- GRANT SELECT, UPDATE ON reconciliation_queue TO ops_role;
-- GRANT SELECT ON bank_statement_lines, reconciliation_matches TO ops_role;
-- GRANT INSERT ON reconciliation_logs TO ops_role;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
