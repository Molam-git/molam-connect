-- Brique 91 — Statement Ingestion, Reconciliation & Treasury Operations
-- Comprehensive SQL schema for treasury management

-- ============================================================================
-- 1. BANK STATEMENT LINES (Normalized ingestion)
-- ============================================================================

CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source tracking
  bank_profile_id UUID NOT NULL, -- REFERENCES bank_profiles(id)
  statement_id UUID NOT NULL, -- REFERENCES bank_statements_raw(id)
  treasury_account_id UUID, -- REFERENCES treasury_accounts(id)

  -- Transaction details
  statement_date DATE NOT NULL,
  value_date TIMESTAMPTZ NOT NULL,
  transaction_date TIMESTAMPTZ,
  booking_date TIMESTAMPTZ,

  -- Amounts
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,

  -- Counterparty
  beneficiary_json JSONB, -- {name, account, bank_code, etc.}
  counterparty_reference TEXT,

  -- Description & references
  raw_description TEXT,
  reference TEXT, -- Extracted reference code
  bank_reference TEXT, -- Bank's internal reference

  -- Reconciliation
  reconciliation_status TEXT DEFAULT 'unmatched',
  -- unmatched|matched|partial|suspicious|ignored
  matched_payout_id UUID, -- REFERENCES payouts(id)
  matched_ledger_txn_id UUID,
  match_confidence NUMERIC(5,2), -- 0-100
  match_method TEXT, -- 'exact_reference','amount_date','fuzzy','manual'

  -- Processing
  parsed_at TIMESTAMPTZ DEFAULT now(),
  reconciled_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  CONSTRAINT valid_recon_status CHECK (reconciliation_status IN ('unmatched','matched','partial','suspicious','ignored'))
);

CREATE INDEX IF NOT EXISTS idx_bsl_bank_profile ON bank_statement_lines(bank_profile_id);
CREATE INDEX IF NOT EXISTS idx_bsl_reference ON bank_statement_lines(reference) WHERE reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bsl_amount_date ON bank_statement_lines(amount, value_date);
CREATE INDEX IF NOT EXISTS idx_bsl_status ON bank_statement_lines(reconciliation_status) WHERE reconciliation_status != 'matched';
CREATE INDEX IF NOT EXISTS idx_bsl_matched_payout ON bank_statement_lines(matched_payout_id) WHERE matched_payout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bsl_value_date ON bank_statement_lines(value_date DESC);

COMMENT ON TABLE bank_statement_lines IS 'Normalized bank statement transactions for reconciliation';

-- ============================================================================
-- 2. RECONCILIATION ISSUES (Manual review queue)
-- ============================================================================

CREATE TABLE IF NOT EXISTS reconciliation_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source
  bank_statement_line_id UUID REFERENCES bank_statement_lines(id) ON DELETE CASCADE,

  -- Issue classification
  issue_type TEXT NOT NULL, -- 'multiple_matches','no_match','amount_mismatch','date_mismatch','other'
  reason TEXT,

  -- Candidates
  candidate_payouts JSONB, -- Array of possible payout matches
  candidate_count INT DEFAULT 0,

  -- Resolution
  status TEXT DEFAULT 'open', -- 'open','resolved','ignored','escalated'
  resolution TEXT,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,

  -- Priority
  priority INT DEFAULT 50, -- 0-100
  sla_due_at TIMESTAMPTZ,

  -- Assignment
  assigned_to UUID,
  assigned_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,

  CONSTRAINT valid_issue_status CHECK (status IN ('open','resolved','ignored','escalated'))
);

CREATE INDEX IF NOT EXISTS idx_recon_issues_status ON reconciliation_issues(status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_recon_issues_assigned ON reconciliation_issues(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recon_issues_priority ON reconciliation_issues(priority DESC, created_at ASC);

COMMENT ON TABLE reconciliation_issues IS 'Queue for manual reconciliation review';

-- ============================================================================
-- 3. TREASURY FLOAT SNAPSHOTS (Balance tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS treasury_float_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Account
  treasury_account_id UUID NOT NULL, -- REFERENCES treasury_accounts(id)
  bank_profile_id UUID NOT NULL,

  -- Timing
  snapshot_ts TIMESTAMPTZ DEFAULT now(),
  snapshot_type TEXT DEFAULT 'scheduled', -- 'scheduled','manual','trigger'

  -- Balances
  balance NUMERIC(18,6) NOT NULL,
  reserved NUMERIC(18,6) DEFAULT 0,
  available NUMERIC(18,6) NOT NULL,
  pending_in NUMERIC(18,6) DEFAULT 0,
  pending_out NUMERIC(18,6) DEFAULT 0,

  -- Currency
  currency TEXT NOT NULL,

  -- Calculated fields
  utilization_pct NUMERIC(5,2), -- (reserved / balance) * 100
  days_runway NUMERIC(10,2), -- Estimated days until depleted

  -- Metadata
  notes JSONB DEFAULT '{}'::jsonb,

  -- Constraints
  CONSTRAINT positive_balance CHECK (balance >= 0)
);

CREATE INDEX IF NOT EXISTS idx_tfs_account_ts ON treasury_float_snapshots(treasury_account_id, snapshot_ts DESC);
CREATE INDEX IF NOT EXISTS idx_tfs_snapshot_ts ON treasury_float_snapshots(snapshot_ts DESC);
CREATE INDEX IF NOT EXISTS idx_tfs_currency ON treasury_float_snapshots(currency);

COMMENT ON TABLE treasury_float_snapshots IS 'Historical snapshots of treasury account balances';

-- ============================================================================
-- 4. SWEEP RULES (Auto-balance management)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sweep_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Rule identification
  rule_name TEXT UNIQUE NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  priority INT DEFAULT 100,

  -- Scope
  treasury_account_id UUID NOT NULL, -- REFERENCES treasury_accounts(id)
  currency TEXT NOT NULL,

  -- Thresholds
  min_threshold NUMERIC(18,6) NOT NULL, -- Topup if below
  max_threshold NUMERIC(18,6) NOT NULL, -- Sweep if above
  target_balance NUMERIC(18,6), -- Ideal balance to maintain

  -- Source/Destination
  preferred_source JSONB, -- {type:'settlement'|'reserve', account_id:...}
  preferred_destination JSONB,

  -- Execution
  auto_execute BOOLEAN DEFAULT FALSE, -- If true, execute without approval
  requires_approval_above NUMERIC(18,6), -- Amount threshold for approval

  -- Throttling
  max_sweeps_per_day INT DEFAULT 10,
  min_sweep_amount NUMERIC(18,6) DEFAULT 0,
  cooldown_minutes INT DEFAULT 60,

  -- Schedule
  schedule_cron TEXT, -- Cron expression for sweep checks
  last_executed_at TIMESTAMPTZ,
  next_execution_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID,
  metadata JSONB DEFAULT '{}'::jsonb,

  CONSTRAINT valid_thresholds CHECK (min_threshold < max_threshold)
);

CREATE INDEX IF NOT EXISTS idx_sweep_rules_active ON sweep_rules(active, priority DESC);
CREATE INDEX IF NOT EXISTS idx_sweep_rules_account ON sweep_rules(treasury_account_id);
CREATE INDEX IF NOT EXISTS idx_sweep_rules_next_exec ON sweep_rules(next_execution_at) WHERE active = TRUE;

COMMENT ON TABLE sweep_rules IS 'Automated treasury balance sweep rules';

-- ============================================================================
-- 5. TREASURY PLANS (Execution plans)
-- ============================================================================

CREATE TABLE IF NOT EXISTS treasury_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Plan identification
  plan_reference TEXT UNIQUE NOT NULL,
  plan_type TEXT NOT NULL, -- 'manual','sweep','rebalance','emergency','scheduled'

  -- Generation
  generated_by UUID, -- User or 'system'
  generated_at TIMESTAMPTZ DEFAULT now(),
  generation_method TEXT, -- 'manual','sira','rule_based'

  -- Summary
  summary JSONB, -- {total_cost, fx_impact, actions_count, estimated_duration}
  total_estimated_cost NUMERIC(18,6),
  affected_currencies TEXT[],

  -- Status
  status TEXT DEFAULT 'draft',
  -- draft|ready|pending_approval|approved|executing|executed|failed|cancelled|rolledback

  -- Execution
  execution_mode TEXT DEFAULT 'automatic', -- 'automatic','manual','dry_run'
  executed_by UUID,
  executed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Approval
  requires_approval BOOLEAN DEFAULT FALSE,
  approval_count INT DEFAULT 0,
  approval_required INT DEFAULT 0,
  approved_by UUID[] DEFAULT ARRAY[]::UUID[],

  -- Rollback
  rollback_plan_id UUID REFERENCES treasury_plans(id),
  rolled_back_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  CONSTRAINT valid_plan_status CHECK (status IN ('draft','ready','pending_approval','approved','executing','executed','failed','cancelled','rolledback'))
);

CREATE INDEX IF NOT EXISTS idx_treasury_plans_status ON treasury_plans(status);
CREATE INDEX IF NOT EXISTS idx_treasury_plans_generated ON treasury_plans(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_treasury_plans_pending_approval ON treasury_plans(status) WHERE status = 'pending_approval';

COMMENT ON TABLE treasury_plans IS 'Treasury execution plans with multi-sig approval';

-- ============================================================================
-- 6. TREASURY PLAN ACTIONS (Individual operations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS treasury_plan_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Plan linkage
  plan_id UUID NOT NULL REFERENCES treasury_plans(id) ON DELETE CASCADE,
  action_order INT NOT NULL, -- Execution order

  -- Action details
  action_type TEXT NOT NULL,
  -- 'payout_send','sweep_in','sweep_out','fx_trade','failover','internal_transfer'
  payload JSONB NOT NULL, -- Bank connector payload or internal params

  -- Cost estimation
  estimated_cost NUMERIC(18,6),
  estimated_fx_cost NUMERIC(18,6),
  estimated_fees NUMERIC(18,6),

  -- Execution
  executed BOOLEAN DEFAULT FALSE,
  executed_at TIMESTAMPTZ,
  execution_duration_ms INT,

  -- Result
  success BOOLEAN,
  result JSONB, -- Response from connector or system
  error_message TEXT,

  -- Rollback
  rollback_action_id UUID REFERENCES treasury_plan_actions(id),
  rolled_back BOOLEAN DEFAULT FALSE,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  CONSTRAINT valid_action_type CHECK (action_type IN ('payout_send','sweep_in','sweep_out','fx_trade','failover','internal_transfer','rebalance'))
);

CREATE INDEX IF NOT EXISTS idx_tpa_plan ON treasury_plan_actions(plan_id, action_order);
CREATE INDEX IF NOT EXISTS idx_tpa_executed ON treasury_plan_actions(executed, executed_at DESC);

COMMENT ON TABLE treasury_plan_actions IS 'Individual actions within treasury plans';

-- ============================================================================
-- 7. FX QUOTES (Foreign exchange rates)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fx_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provider
  provider TEXT NOT NULL, -- 'bank','internal_pool','external_broker'
  provider_id TEXT, -- Bank profile ID or broker ID
  quote_reference TEXT,

  -- Pair
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,

  -- Rate
  rate NUMERIC(18,8) NOT NULL,
  inverse_rate NUMERIC(18,8) NOT NULL,

  -- Costs
  fixed_fee NUMERIC(10,2) DEFAULT 0,
  percentage_fee NUMERIC(5,4) DEFAULT 0,
  min_amount NUMERIC(18,2),
  max_amount NUMERIC(18,2),

  -- Validity
  quoted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  valid BOOLEAN DEFAULT TRUE,

  -- Quality
  sira_score NUMERIC(5,2), -- SIRA evaluation score
  rank INT, -- Ranking among quotes

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_fx_quotes_pair ON fx_quotes(from_currency, to_currency, expires_at) WHERE valid = TRUE;
CREATE INDEX IF NOT EXISTS idx_fx_quotes_expires ON fx_quotes(expires_at);

COMMENT ON TABLE fx_quotes IS 'FX rate quotes from multiple providers';

-- ============================================================================
-- 8. FX TRADES (Executed conversions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fx_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Trade reference
  trade_reference TEXT UNIQUE NOT NULL,

  -- Quote used
  fx_quote_id UUID REFERENCES fx_quotes(id),

  -- Trade details
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  from_amount NUMERIC(18,6) NOT NULL,
  to_amount NUMERIC(18,6) NOT NULL,

  -- Rate used
  applied_rate NUMERIC(18,8) NOT NULL,

  -- Costs
  total_cost NUMERIC(18,6),
  fx_spread NUMERIC(18,6),
  fees NUMERIC(18,6),

  -- Execution
  executed_at TIMESTAMPTZ DEFAULT now(),
  executed_by UUID,
  provider TEXT NOT NULL,

  -- Ledger integration
  ledger_entry_id UUID, -- REFERENCES journal_entries(id)

  -- Settlement
  settled BOOLEAN DEFAULT FALSE,
  settled_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_fx_trades_executed ON fx_trades(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_fx_trades_currencies ON fx_trades(from_currency, to_currency);

COMMENT ON TABLE fx_trades IS 'Executed FX trades with cost tracking';

-- ============================================================================
-- 9. TREASURY SLA METRICS (Performance tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS treasury_sla_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  bank_profile_id UUID,
  metric_date DATE NOT NULL,
  metric_type TEXT NOT NULL, -- 'daily','weekly','monthly'

  -- Statement ingestion metrics
  statements_ingested INT DEFAULT 0,
  statement_ingest_latency_ms NUMERIC(10,2),
  statement_parse_errors INT DEFAULT 0,

  -- Reconciliation metrics
  lines_processed INT DEFAULT 0,
  lines_matched INT DEFAULT 0,
  lines_unmatched INT DEFAULT 0,
  match_rate_percent NUMERIC(5,2),
  avg_match_time_ms NUMERIC(10,2),

  -- Settlement metrics
  payouts_settled INT DEFAULT 0,
  avg_settlement_latency_hours NUMERIC(10,2),
  p95_settlement_latency_hours NUMERIC(10,2),
  settlement_sla_breaches INT DEFAULT 0,

  -- Issues
  reconciliation_issues_created INT DEFAULT 0,
  reconciliation_issues_resolved INT DEFAULT 0,
  incidents_count INT DEFAULT 0,

  -- Float metrics
  avg_balance NUMERIC(18,6),
  min_balance NUMERIC(18,6),
  max_balance NUMERIC(18,6),
  avg_utilization_pct NUMERIC(5,2),

  -- Sweep metrics
  sweeps_executed INT DEFAULT 0,
  sweeps_failed INT DEFAULT 0,
  total_swept_amount NUMERIC(18,6),

  -- FX metrics
  fx_trades INT DEFAULT 0,
  avg_fx_cost NUMERIC(18,6),
  total_fx_volume NUMERIC(18,6),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,

  CONSTRAINT unique_metric CHECK (1=1) -- Placeholder
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sla_metrics_unique
ON treasury_sla_metrics(bank_profile_id, metric_date, metric_type);

CREATE INDEX IF NOT EXISTS idx_sla_metrics_date ON treasury_sla_metrics(metric_date DESC);

COMMENT ON TABLE treasury_sla_metrics IS 'Historical SLA and performance metrics';

-- ============================================================================
-- 10. BANK HEALTH STATUS (Routing & failover)
-- ============================================================================

CREATE TABLE IF NOT EXISTS bank_health_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Bank
  bank_profile_id UUID NOT NULL, -- REFERENCES bank_profiles(id)

  -- Health indicators
  status TEXT NOT NULL DEFAULT 'healthy',
  -- healthy|degraded|down|maintenance

  -- Metrics (rolling window)
  success_rate_pct NUMERIC(5,2),
  avg_response_time_ms NUMERIC(10,2),
  error_count_24h INT DEFAULT 0,
  timeout_count_24h INT DEFAULT 0,

  -- Availability
  last_successful_call TIMESTAMPTZ,
  last_failed_call TIMESTAMPTZ,
  consecutive_failures INT DEFAULT 0,

  -- Circuit breaker
  circuit_breaker_open BOOLEAN DEFAULT FALSE,
  circuit_breaker_opened_at TIMESTAMPTZ,
  circuit_breaker_reset_at TIMESTAMPTZ,

  -- Routing
  routing_enabled BOOLEAN DEFAULT TRUE,
  routing_weight INT DEFAULT 100, -- 0-100, affects selection probability

  -- Metadata
  checked_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,

  CONSTRAINT valid_health_status CHECK (status IN ('healthy','degraded','down','maintenance'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_health_unique ON bank_health_status(bank_profile_id);
CREATE INDEX IF NOT EXISTS idx_bank_health_routing ON bank_health_status(routing_enabled) WHERE routing_enabled = TRUE;

COMMENT ON TABLE bank_health_status IS 'Real-time bank connector health tracking';

-- ============================================================================
-- 11. REGULATORY EXPORTS (Compliance reporting)
-- ============================================================================

CREATE TABLE IF NOT EXISTS regulatory_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Export identification
  export_reference TEXT UNIQUE NOT NULL,
  region TEXT NOT NULL, -- 'BCEAO','ECB','FED','FinCEN', etc.
  report_type TEXT NOT NULL, -- 'daily','monthly','quarterly','annual','ad_hoc'

  -- Period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Generation
  generated_by UUID,
  generated_at TIMESTAMPTZ DEFAULT now(),

  -- File details
  file_format TEXT NOT NULL, -- 'csv','json','xml','iso20022'
  file_s3_key TEXT,
  file_hash TEXT, -- SHA256
  file_size_bytes BIGINT,

  -- Signing
  signed BOOLEAN DEFAULT FALSE,
  signature TEXT,
  signing_algorithm TEXT,

  -- Status
  status TEXT DEFAULT 'generating',
  -- generating|ready|submitted|acknowledged|error

  -- Submission
  submitted_at TIMESTAMPTZ,
  submitted_to TEXT, -- Endpoint or authority
  acknowledgment_ref TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  CONSTRAINT valid_export_status CHECK (status IN ('generating','ready','submitted','acknowledged','error'))
);

CREATE INDEX IF NOT EXISTS idx_reg_exports_region ON regulatory_exports(region, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_reg_exports_status ON regulatory_exports(status);

COMMENT ON TABLE regulatory_exports IS 'Regulatory export bundles for compliance';

-- ============================================================================
-- 12. RECONCILIATION LOGS (Audit trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS reconciliation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context
  bank_statement_line_id UUID,
  payout_id UUID,
  issue_id UUID,

  -- Actor
  actor_id UUID,
  actor_type TEXT, -- 'system','user','sira'

  -- Action
  action TEXT NOT NULL,
  -- 'matched','unmatched','issue_created','issue_resolved','manual_match','override'

  -- Details
  previous_status TEXT,
  new_status TEXT,
  match_confidence NUMERIC(5,2),
  match_method TEXT,
  details JSONB DEFAULT '{}'::jsonb,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Immutability marker
  immutable BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_recon_logs_line ON reconciliation_logs(bank_statement_line_id);
CREATE INDEX IF NOT EXISTS idx_recon_logs_payout ON reconciliation_logs(payout_id);
CREATE INDEX IF NOT EXISTS idx_recon_logs_created ON reconciliation_logs(created_at DESC);

COMMENT ON TABLE reconciliation_logs IS 'Immutable audit trail for reconciliation operations';

-- ============================================================================
-- 13. HELPER FUNCTIONS
-- ============================================================================

-- Calculate match rate for a period
CREATE OR REPLACE FUNCTION calculate_match_rate(
  p_bank_profile_id UUID,
  p_start_date DATE,
  p_end_date DATE
) RETURNS NUMERIC AS $$
DECLARE
  v_total INT;
  v_matched INT;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM bank_statement_lines
  WHERE bank_profile_id = p_bank_profile_id
    AND statement_date BETWEEN p_start_date AND p_end_date;

  SELECT COUNT(*) INTO v_matched
  FROM bank_statement_lines
  WHERE bank_profile_id = p_bank_profile_id
    AND statement_date BETWEEN p_start_date AND p_end_date
    AND reconciliation_status = 'matched';

  IF v_total = 0 THEN
    RETURN 0;
  END IF;

  RETURN ROUND((v_matched::NUMERIC / v_total::NUMERIC) * 100, 2);
END;
$$ LANGUAGE plpgsql;

-- Auto-expire old FX quotes
CREATE OR REPLACE FUNCTION expire_fx_quotes()
RETURNS void AS $$
BEGIN
  UPDATE fx_quotes
  SET valid = FALSE
  WHERE expires_at < now() AND valid = TRUE;
END;
$$ LANGUAGE plpgsql;

-- Update bank health status
CREATE OR REPLACE FUNCTION update_bank_health(
  p_bank_profile_id UUID,
  p_success BOOLEAN,
  p_response_time_ms INT
) RETURNS void AS $$
DECLARE
  v_health RECORD;
BEGIN
  SELECT * INTO v_health
  FROM bank_health_status
  WHERE bank_profile_id = p_bank_profile_id
  FOR UPDATE;

  IF v_health IS NULL THEN
    -- Create new health record
    INSERT INTO bank_health_status (bank_profile_id, status)
    VALUES (p_bank_profile_id, 'healthy');
    RETURN;
  END IF;

  IF p_success THEN
    UPDATE bank_health_status
    SET consecutive_failures = 0,
        last_successful_call = now(),
        checked_at = now()
    WHERE bank_profile_id = p_bank_profile_id;

    -- Reset circuit breaker if open
    IF v_health.circuit_breaker_open THEN
      UPDATE bank_health_status
      SET circuit_breaker_open = FALSE,
          circuit_breaker_reset_at = now(),
          status = 'healthy'
      WHERE bank_profile_id = p_bank_profile_id;
    END IF;
  ELSE
    UPDATE bank_health_status
    SET consecutive_failures = consecutive_failures + 1,
        last_failed_call = now(),
        error_count_24h = error_count_24h + 1,
        checked_at = now()
    WHERE bank_profile_id = p_bank_profile_id;

    -- Open circuit breaker after 5 consecutive failures
    IF v_health.consecutive_failures + 1 >= 5 THEN
      UPDATE bank_health_status
      SET circuit_breaker_open = TRUE,
          circuit_breaker_opened_at = now(),
          status = 'down',
          routing_enabled = FALSE
      WHERE bank_profile_id = p_bank_profile_id;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 14. TRIGGERS
-- ============================================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_treasury_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reconciliation_issues_updated_at
BEFORE UPDATE ON reconciliation_issues
FOR EACH ROW
EXECUTE FUNCTION update_treasury_updated_at();

CREATE TRIGGER sweep_rules_updated_at
BEFORE UPDATE ON sweep_rules
FOR EACH ROW
EXECUTE FUNCTION update_treasury_updated_at();

-- ============================================================================
-- 15. MATERIALIZED VIEWS
-- ============================================================================

-- Daily reconciliation summary
CREATE MATERIALIZED VIEW IF NOT EXISTS reconciliation_summary AS
SELECT
  DATE(parsed_at) as summary_date,
  bank_profile_id,
  currency,
  reconciliation_status,
  COUNT(*) as line_count,
  SUM(amount) as total_amount,
  AVG(match_confidence) as avg_match_confidence,
  COUNT(*) FILTER (WHERE match_method = 'exact_reference') as exact_matches,
  COUNT(*) FILTER (WHERE match_method = 'fuzzy') as fuzzy_matches
FROM bank_statement_lines
GROUP BY DATE(parsed_at), bank_profile_id, currency, reconciliation_status;

CREATE UNIQUE INDEX IF NOT EXISTS idx_recon_summary_unique
ON reconciliation_summary(summary_date, bank_profile_id, currency, reconciliation_status);

COMMENT ON MATERIALIZED VIEW reconciliation_summary IS 'Daily reconciliation performance summary';

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_reconciliation_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY reconciliation_summary;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMPLETION
-- ============================================================================

COMMENT ON SCHEMA public IS 'Brique 91 - Statement Ingestion, Reconciliation & Treasury Operations - Schema v1.0';
