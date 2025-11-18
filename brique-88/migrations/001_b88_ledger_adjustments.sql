-- Brique 88: Auto-Adjustments Ledger Integration & Compensation Flows
-- Industrial-grade accounting integration for reconciliation adjustments

-- ============================================================================
-- PART 1: Ledger Adjustments (from Reconciliation)
-- ============================================================================

-- Main adjustments table (already exists in B87 but extended here)
CREATE TABLE IF NOT EXISTS ledger_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL, -- 'bank_statement', 'payout', 'invoice', 'manual'
  source_id UUID, -- FK to source entity
  recon_exec_id UUID, -- Link to B87 recon_rule_executions
  rule_id UUID, -- Link to B87 recon_rules
  external_ref TEXT UNIQUE, -- Idempotency key
  reason TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount NUMERIC(20, 4) NOT NULL, -- Amount (positive = credit to beneficiary)
  fx_rate NUMERIC(12, 6), -- FX rate if cross-currency
  base_currency_amount NUMERIC(20, 4), -- Amount in base currency
  adjustment_type TEXT NOT NULL, -- 'bank_fee', 'fx_variance', 'partial_settlement', etc.
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'applied', 'failed', 'awaiting_approval', 'reverted'
  actions JSONB, -- Planned compensation actions
  gl_mapping JSONB, -- Pre-computed GL mapping
  created_by UUID, -- Molam ID (system or user)
  approved_by UUID[], -- Array of approver IDs
  approval_count INTEGER DEFAULT 0,
  approval_required INTEGER DEFAULT 0, -- How many approvals needed
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  applied_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_ledger_adj_status ON ledger_adjustments(status) WHERE status IN ('pending', 'awaiting_approval');
CREATE INDEX IF NOT EXISTS idx_ledger_adj_recon ON ledger_adjustments(recon_exec_id) WHERE recon_exec_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_adj_source ON ledger_adjustments(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_ledger_adj_created ON ledger_adjustments(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_adj_ext_ref ON ledger_adjustments(external_ref) WHERE external_ref IS NOT NULL;

COMMENT ON TABLE ledger_adjustments IS 'Financial adjustments from reconciliation with GL mapping';
COMMENT ON COLUMN ledger_adjustments.external_ref IS 'Idempotency key to prevent duplicate adjustments';
COMMENT ON COLUMN ledger_adjustments.actions IS 'Compensation actions: wallet credit, credit note, payout reduction, etc.';

-- ============================================================================
-- PART 2: Double-Entry Journal System
-- ============================================================================

-- Journal entries (header)
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_ref TEXT UNIQUE NOT NULL, -- Idempotency ref (e.g., ADJ-{adjustment_id})
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  posted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'posted', 'reversed'
  source_adjustment_id UUID REFERENCES ledger_adjustments(id),
  reversal_of UUID REFERENCES journal_entries(id), -- Link to original if this is a reversal
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journal_entry_ref ON journal_entries(entry_ref);
CREATE INDEX IF NOT EXISTS idx_journal_posted ON journal_entries(posted_at DESC) WHERE status = 'posted';
CREATE INDEX IF NOT EXISTS idx_journal_adj ON journal_entries(source_adjustment_id);

COMMENT ON TABLE journal_entries IS 'Journal entry headers for double-entry bookkeeping';

-- Journal lines (detail - debit/credit)
CREATE TABLE IF NOT EXISTS journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL, -- Sequence within entry
  gl_code TEXT NOT NULL, -- General ledger account code
  debit NUMERIC(20, 4) DEFAULT 0,
  credit NUMERIC(20, 4) DEFAULT 0,
  currency TEXT NOT NULL,
  fx_rate NUMERIC(12, 6),
  base_currency_debit NUMERIC(20, 4),
  base_currency_credit NUMERIC(20, 4),
  description TEXT,
  entity_type TEXT, -- 'payout', 'wallet', 'invoice' (for subledger tracking)
  entity_id UUID, -- ID of entity for subledger
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_gl ON journal_lines(gl_code);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entity ON journal_lines(entity_type, entity_id);

COMMENT ON TABLE journal_lines IS 'Journal entry lines with debit/credit for double-entry';

-- Constraint: Ensure balanced entries
CREATE OR REPLACE FUNCTION check_balanced_entry()
RETURNS TRIGGER AS $$
DECLARE
  total_debit NUMERIC;
  total_credit NUMERIC;
BEGIN
  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
  INTO total_debit, total_credit
  FROM journal_lines
  WHERE journal_entry_id = NEW.journal_entry_id;

  IF ABS(total_debit - total_credit) > 0.01 THEN
    RAISE EXCEPTION 'Journal entry % is not balanced: debit=%, credit=%',
      NEW.journal_entry_id, total_debit, total_credit;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on journal posting
CREATE TRIGGER ensure_balanced_before_post
  BEFORE UPDATE OF status ON journal_entries
  FOR EACH ROW
  WHEN (NEW.status = 'posted' AND OLD.status != 'posted')
  EXECUTE FUNCTION check_balanced_entry();

-- ============================================================================
-- PART 3: Compensation Actions Queue
-- ============================================================================

-- Compensation actions to be executed (wallet credit, credit note, payout adjustment)
CREATE TABLE IF NOT EXISTS compensation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID NOT NULL REFERENCES ledger_adjustments(id),
  action_type TEXT NOT NULL, -- 'wallet_credit', 'wallet_debit', 'create_credit_note', 'payout_reduce', 'refund'
  params JSONB NOT NULL, -- Action-specific parameters
  status TEXT NOT NULL DEFAULT 'queued', -- 'queued', 'processing', 'done', 'failed', 'reverted'
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  last_error TEXT,
  external_id TEXT, -- ID from external system (e.g., wallet transaction ID)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  executed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_comp_status ON compensation_actions(status) WHERE status IN ('queued', 'failed');
CREATE INDEX IF NOT EXISTS idx_comp_adj ON compensation_actions(adjustment_id);
CREATE INDEX IF NOT EXISTS idx_comp_created ON compensation_actions(created_at);

COMMENT ON TABLE compensation_actions IS 'Queue of compensation actions to execute (wallet, billing, etc.)';

-- ============================================================================
-- PART 4: Adjustment Reversals
-- ============================================================================

-- Reversal requests and tracking
CREATE TABLE IF NOT EXISTS adjustment_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID NOT NULL REFERENCES ledger_adjustments(id),
  requested_by UUID NOT NULL, -- Molam ID
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested', -- 'requested', 'approved', 'executed', 'rejected', 'failed'
  approvers JSONB DEFAULT '[]', -- [{user_id, approved_at, comment}]
  approval_count INTEGER DEFAULT 0,
  approval_required INTEGER DEFAULT 2, -- Multi-sig
  reversal_journal_entry_id UUID REFERENCES journal_entries(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  executed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reversal_adj ON adjustment_reversals(adjustment_id);
CREATE INDEX IF NOT EXISTS idx_reversal_status ON adjustment_reversals(status) WHERE status IN ('requested', 'approved');

COMMENT ON TABLE adjustment_reversals IS 'Reversal requests for adjustments with approval workflow';

-- ============================================================================
-- PART 5: Configuration
-- ============================================================================

-- Global configuration for adjustment processing
CREATE TABLE IF NOT EXISTS adjustment_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE adjustment_config IS 'Configuration for adjustment processing (thresholds, policies)';

-- Seed default config
INSERT INTO adjustment_config (key, value, description)
VALUES
  ('ops_auto_threshold', '{"USD": 1000, "EUR": 900, "GBP": 800, "XOF": 500000}', 'Auto-apply threshold by currency'),
  ('approval_quorum', '2', 'Number of approvals required for high-value adjustments'),
  ('max_auto_amount_per_day', '{"USD": 50000, "EUR": 45000}', 'Maximum auto-applied amount per day per currency'),
  ('gl_codes', '{"bank_fee": {"debit": "EXP:BANK_FEES", "credit": "LIA:ADJUSTMENTS_PAYABLE"}}', 'GL code mappings'),
  ('base_currency', '"USD"', 'Base currency for reporting'),
  ('fx_rate_source', '"ecb"', 'FX rate data source')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- PART 6: FX Rates (for multi-currency)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fx_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate NUMERIC(12, 6) NOT NULL,
  rate_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT, -- 'ecb', 'manual', 'api'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fx_rate_unique ON fx_rates(from_currency, to_currency, rate_date);
CREATE INDEX IF NOT EXISTS idx_fx_rate_date ON fx_rates(rate_date DESC);

COMMENT ON TABLE fx_rates IS 'FX exchange rates for multi-currency adjustments';

-- ============================================================================
-- PART 7: Audit Trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS adjustment_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID REFERENCES ledger_adjustments(id),
  action TEXT NOT NULL, -- 'created', 'approved', 'applied', 'reversed', 'failed'
  actor_id UUID, -- Molam ID
  actor_type TEXT, -- 'user', 'system'
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adj_audit_adj ON adjustment_audit_logs(adjustment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adj_audit_action ON adjustment_audit_logs(action, created_at DESC);

COMMENT ON TABLE adjustment_audit_logs IS 'Immutable audit trail for all adjustment actions';

-- ============================================================================
-- PART 8: Triggers
-- ============================================================================

-- Update updated_at timestamps
CREATE TRIGGER update_ledger_adj_updated_at BEFORE UPDATE ON ledger_adjustments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comp_actions_updated_at BEFORE UPDATE ON compensation_actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reversals_updated_at BEFORE UPDATE ON adjustment_reversals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Audit log trigger
CREATE OR REPLACE FUNCTION log_adjustment_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    INSERT INTO adjustment_audit_logs (adjustment_id, action, actor_type, details)
    VALUES (NEW.id, 'status_changed', 'system', jsonb_build_object(
      'old_status', OLD.status,
      'new_status', NEW.status
    ));
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO adjustment_audit_logs (adjustment_id, action, actor_id, actor_type, details)
    VALUES (NEW.id, 'created', NEW.created_by, 'system', jsonb_build_object(
      'amount', NEW.amount,
      'currency', NEW.currency,
      'type', NEW.adjustment_type
    ));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_adjustment_changes
  AFTER INSERT OR UPDATE ON ledger_adjustments
  FOR EACH ROW EXECUTE FUNCTION log_adjustment_change();

-- ============================================================================
-- PART 9: Helper Functions
-- ============================================================================

-- Get FX rate for a date
CREATE OR REPLACE FUNCTION get_fx_rate(from_curr TEXT, to_curr TEXT, rate_date DATE DEFAULT CURRENT_DATE)
RETURNS NUMERIC AS $$
DECLARE
  rate_value NUMERIC;
BEGIN
  IF from_curr = to_curr THEN
    RETURN 1.0;
  END IF;

  SELECT rate INTO rate_value
  FROM fx_rates
  WHERE from_currency = from_curr
  AND to_currency = to_curr
  AND fx_rates.rate_date <= rate_date
  ORDER BY fx_rates.rate_date DESC
  LIMIT 1;

  IF rate_value IS NULL THEN
    RAISE EXCEPTION 'No FX rate found for % to % on %', from_curr, to_curr, rate_date;
  END IF;

  RETURN rate_value;
END;
$$ LANGUAGE plpgsql;

-- Check if adjustment has sufficient approvals
CREATE OR REPLACE FUNCTION has_sufficient_approvals(adj_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  required INTEGER;
  current INTEGER;
BEGIN
  SELECT approval_required, approval_count
  INTO required, current
  FROM ledger_adjustments
  WHERE id = adj_id;

  RETURN current >= required;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
