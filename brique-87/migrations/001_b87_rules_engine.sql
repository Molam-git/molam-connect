-- Brique 87: Reconciliation Rules Engine & Auto-Adjustments
-- Industrial-grade rules engine for automated reconciliation and adjustments

-- ============================================================================
-- PART 1: Rules Definition
-- ============================================================================

-- Rule definitions with DSL conditions and actions
CREATE TABLE IF NOT EXISTS recon_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  owner_user_id UUID NOT NULL, -- Molam ID of rule author
  bank_profile_id UUID, -- NULL = global rule
  currency TEXT, -- NULL = all currencies
  origin_module TEXT, -- 'payout', 'wallet', 'invoice', NULL = all
  priority INTEGER NOT NULL DEFAULT 100, -- Lower = higher priority
  condition JSONB NOT NULL, -- DSL condition tree
  actions JSONB NOT NULL, -- Array of actions
  mode TEXT NOT NULL DEFAULT 'dry_run', -- 'dry_run' | 'staging' | 'active'
  auto_execute BOOLEAN DEFAULT false, -- Auto-apply actions or just log
  approval_required BOOLEAN DEFAULT false,
  approval_threshold NUMERIC(18,2) DEFAULT 0, -- Amount above which multi-sig required
  min_approvers INTEGER DEFAULT 2, -- Minimum approvers needed
  enabled BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  activated_at TIMESTAMPTZ,
  activated_by UUID,
  version INTEGER DEFAULT 1 -- Rule versioning
);

CREATE INDEX IF NOT EXISTS idx_recon_rules_bank ON recon_rules(bank_profile_id) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_recon_rules_mode ON recon_rules(mode, priority) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_recon_rules_currency ON recon_rules(currency) WHERE enabled = true;

COMMENT ON TABLE recon_rules IS 'Reconciliation rule definitions with DSL conditions and actions';
COMMENT ON COLUMN recon_rules.condition IS 'JSON DSL condition tree (all/any/not + field comparisons)';
COMMENT ON COLUMN recon_rules.actions IS 'Array of actions: auto_match, create_adjustment, notify_ops, etc.';
COMMENT ON COLUMN recon_rules.mode IS 'dry_run (test only), staging (active but flagged), active (auto-execute)';

-- ============================================================================
-- PART 2: Rule Execution Log (Immutable)
-- ============================================================================

-- Immutable log of rule executions
CREATE TABLE IF NOT EXISTS recon_rule_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES recon_rules(id),
  bank_statement_line_id UUID REFERENCES bank_statement_lines(id),
  input_snapshot JSONB NOT NULL, -- Full line data at execution time
  matched BOOLEAN NOT NULL, -- Did condition match?
  match_score NUMERIC(5,4) DEFAULT 1.0, -- Confidence score
  actions_taken JSONB, -- Actions that were executed (if auto_execute)
  actions_would_take JSONB, -- Actions that would be taken (if dry_run)
  executed_by TEXT NOT NULL DEFAULT 'rules-engine', -- 'rules-engine' | user_id
  execution_time_ms INTEGER, -- Performance tracking
  error TEXT, -- Error message if execution failed
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rule_exec_rule ON recon_rule_executions(rule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rule_exec_line ON recon_rule_executions(bank_statement_line_id);
CREATE INDEX IF NOT EXISTS idx_rule_exec_matched ON recon_rule_executions(matched, created_at DESC);

COMMENT ON TABLE recon_rule_executions IS 'Immutable audit log of all rule executions';
COMMENT ON COLUMN recon_rule_executions.input_snapshot IS 'Complete line data at time of evaluation';

-- ============================================================================
-- PART 3: Rule Approvals (Multi-Signature)
-- ============================================================================

-- Approval workflow for high-risk rules
CREATE TABLE IF NOT EXISTS recon_rule_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES recon_rules(id),
  approver_user_id UUID NOT NULL, -- Molam ID
  approver_role TEXT NOT NULL, -- 'recon_ops', 'finance_ops', 'pay_admin'
  approved BOOLEAN NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rule_approvals_rule ON recon_rule_approvals(rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_approvals_user ON recon_rule_approvals(approver_user_id);

-- Prevent duplicate approvals from same user
CREATE UNIQUE INDEX IF NOT EXISTS idx_rule_approvals_unique ON recon_rule_approvals(rule_id, approver_user_id);

COMMENT ON TABLE recon_rule_approvals IS 'Multi-signature approval workflow for rules';

-- ============================================================================
-- PART 4: Ledger Adjustments (from B86, extended)
-- ============================================================================

-- Ensure ledger_adjustments table exists (may be from B86)
CREATE TABLE IF NOT EXISTS ledger_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_statement_line_id UUID REFERENCES bank_statement_lines(id),
  payout_id UUID, -- Related payout if applicable
  rule_id UUID REFERENCES recon_rules(id), -- Rule that created this adjustment
  adjustment_type TEXT NOT NULL, -- 'fee_withholding', 'fx_variance', 'partial_settlement', 'bank_charge'
  ledger_code TEXT NOT NULL, -- GL code for accounting
  amount NUMERIC(20, 4) NOT NULL,
  currency TEXT NOT NULL,
  expected_amount NUMERIC(20, 4), -- Expected amount before adjustment
  settled_amount NUMERIC(20, 4), -- Actual settled amount
  formula TEXT, -- Formula used to calculate adjustment
  memo TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'posted', 'reversed'
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_adj_line ON ledger_adjustments(bank_statement_line_id);
CREATE INDEX IF NOT EXISTS idx_ledger_adj_payout ON ledger_adjustments(payout_id) WHERE payout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_adj_rule ON ledger_adjustments(rule_id) WHERE rule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_adj_status ON ledger_adjustments(status) WHERE status = 'pending';

COMMENT ON TABLE ledger_adjustments IS 'Accounting adjustments created by rules engine';

-- ============================================================================
-- PART 5: Rule Performance Metrics
-- ============================================================================

-- Aggregated rule performance metrics
CREATE TABLE IF NOT EXISTS recon_rule_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES recon_rules(id),
  metric_date DATE NOT NULL,
  executions_total INTEGER DEFAULT 0,
  matches_total INTEGER DEFAULT 0,
  actions_executed INTEGER DEFAULT 0,
  errors_total INTEGER DEFAULT 0,
  avg_execution_time_ms NUMERIC(10, 2),
  match_rate_pct NUMERIC(5, 2),
  estimated_false_positive_pct NUMERIC(5, 2), -- Requires manual review
  amount_total NUMERIC(20, 4), -- Total amount processed
  currency TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rule_metrics_unique ON recon_rule_metrics(rule_id, metric_date, currency);
CREATE INDEX IF NOT EXISTS idx_rule_metrics_date ON recon_rule_metrics(metric_date DESC);

COMMENT ON TABLE recon_rule_metrics IS 'Daily aggregated performance metrics per rule';

-- ============================================================================
-- PART 6: System Notifications (for Ops alerts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL, -- 'treasury', 'ops', 'fraud', 'compliance'
  severity TEXT NOT NULL DEFAULT 'info', -- 'info', 'warning', 'error', 'critical'
  title TEXT NOT NULL,
  message TEXT,
  payload JSONB,
  read BOOLEAN DEFAULT false,
  read_by UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_channel ON system_notifications(channel, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_severity ON system_notifications(severity, created_at DESC);

COMMENT ON TABLE system_notifications IS 'System notifications for Ops team';

-- ============================================================================
-- PART 7: Rule Templates (Pre-built rules)
-- ============================================================================

-- Library of pre-built rule templates
CREATE TABLE IF NOT EXISTS recon_rule_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT NOT NULL, -- 'fee_adjustment', 'auto_match', 'fraud_detection', 'escalation'
  condition_template JSONB NOT NULL,
  actions_template JSONB NOT NULL,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rule_templates_category ON recon_rule_templates(category);

COMMENT ON TABLE recon_rule_templates IS 'Library of pre-built rule templates';

-- ============================================================================
-- PART 8: Triggers & Functions
-- ============================================================================

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_recon_rules_updated_at BEFORE UPDATE ON recon_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ledger_adjustments_updated_at BEFORE UPDATE ON ledger_adjustments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recon_rule_metrics_updated_at BEFORE UPDATE ON recon_rule_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to check if rule has sufficient approvals
CREATE OR REPLACE FUNCTION check_rule_approvals(rule_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  required_approvals INTEGER;
  current_approvals INTEGER;
BEGIN
  SELECT min_approvers INTO required_approvals
  FROM recon_rules
  WHERE id = rule_uuid;

  SELECT COUNT(*) INTO current_approvals
  FROM recon_rule_approvals
  WHERE rule_id = rule_uuid AND approved = true;

  RETURN current_approvals >= required_approvals;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_rule_approvals IS 'Check if rule has sufficient approvals to activate';

-- ============================================================================
-- PART 9: Seed Data - Rule Templates
-- ============================================================================

INSERT INTO recon_rule_templates (name, description, category, condition_template, actions_template)
VALUES
  (
    'Bank Fee Auto-Adjustment',
    'Automatically create adjustment for bank fees withheld',
    'fee_adjustment',
    '{
      "all": [
        {"field": "amount", "op": "between", "value": [100, 1000000]},
        {"field": "description", "op": "regex", "value": "FRAIS|FEE|COMMISSION"}
      ]
    }',
    '[
      {"type": "create_adjustment", "ledger_code": "ADJ-BANK-FEE", "amount_formula": "expected - settled", "memo": "Auto adjustment for bank fee"},
      {"type": "notify_ops", "channel": "treasury", "severity": "info"}
    ]'
  ),
  (
    'Partial Settlement Handler',
    'Handle partial settlements with tolerance',
    'fee_adjustment',
    '{
      "all": [
        {"field": "amount", "op": "lt", "value": "__expected_amount__"},
        {"field": "amount", "op": "gt", "value": "__expected_amount_minus_tolerance__"}
      ]
    }',
    '[
      {"type": "mark_payout_partial", "create_adjustment": true},
      {"type": "notify_ops", "channel": "treasury", "severity": "warning"}
    ]'
  ),
  (
    'Reference Regex Auto-Match',
    'Extract reference from description and auto-match payout',
    'auto_match',
    '{
      "all": [
        {"field": "description", "op": "regex", "value": "REF:([A-Z0-9\\-]+)"},
        {"field": "reconciliation_status", "op": "equals", "value": "unmatched"}
      ]
    }',
    '[
      {"type": "auto_match_payout", "use_ref_group": 1, "set_payout_status": "settled"},
      {"type": "release_ledger_hold"}
    ]'
  ),
  (
    'Low Value Auto-Ignore',
    'Automatically ignore micro-transactions below threshold',
    'escalation',
    '{
      "all": [
        {"field": "amount", "op": "lt", "value": 1.00},
        {"field": "transaction_type", "op": "equals", "value": "credit"}
      ]
    }',
    '[
      {"type": "mark_ignored", "reason": "low_value_threshold"},
      {"type": "log_audit", "message": "Auto-ignored low-value transaction"}
    ]'
  ),
  (
    'High Value Escalation',
    'Escalate high-value unmatched transactions to Ops',
    'escalation',
    '{
      "all": [
        {"field": "amount", "op": "gt", "value": 100000},
        {"field": "reconciliation_status", "op": "equals", "value": "unmatched"}
      ]
    }',
    '[
      {"type": "escalate_to_ops", "severity": "high", "assign_to_role": "finance_ops"},
      {"type": "notify_ops", "channel": "treasury", "severity": "critical"}
    ]'
  )
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- PART 10: RBAC Grants (Example)
-- ============================================================================

-- Grant permissions to roles (adjust based on your RBAC system)
-- GRANT SELECT ON recon_rules TO ops_role;
-- GRANT INSERT, UPDATE ON recon_rules TO recon_ops_role, finance_ops_role;
-- GRANT SELECT ON recon_rule_executions TO ops_role;
-- GRANT INSERT ON recon_rule_approvals TO recon_ops_role, finance_ops_role, pay_admin_role;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
