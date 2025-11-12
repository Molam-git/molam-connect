/**
 * Brique 70nonies - Refund & Cancellation AI Rules Engine
 * Industrial-grade refund management with SIRA ML integration
 */

-- 1) Main refund requests table
CREATE TABLE IF NOT EXISTS refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL,                    -- reference to payments/charges table
  origin_module TEXT NOT NULL,                 -- 'connect', 'wallet', 'shop', 'eats'
  requester_user_id UUID NOT NULL,             -- who requested (buyer/merchant/ops)
  requester_role TEXT NOT NULL,                -- 'buyer', 'merchant', 'ops'
  requested_amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  original_payment_amount NUMERIC(18,2),       -- for partial refund validation
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',      -- pending, auto_approved, manual_review, approved, rejected, processing, refunded, failed, reversed
  sira_score NUMERIC(6,4),                     -- ML risk score (0.0000 to 1.0000)
  decision JSONB,                              -- SIRA decision trace & reasoning
  evidence JSONB,                              -- pointers to evidence files (S3 keys)
  refund_method TEXT,                          -- wallet, card, bank, payout_reversal
  merchant_id UUID,
  processing_fee NUMERIC(18,2) DEFAULT 0,
  fee_bearer TEXT DEFAULT 'merchant',          -- merchant or molam
  kyc_check_required BOOLEAN DEFAULT FALSE,
  kyc_passed BOOLEAN,
  approved_by UUID,                            -- Ops/merchant who approved
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  idempotency_key TEXT,                        -- unique per payment for deduplication
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refund_payment ON refund_requests(payment_id);
CREATE INDEX idx_refund_status ON refund_requests(status);
CREATE INDEX idx_refund_requester ON refund_requests(requester_user_id);
CREATE INDEX idx_refund_merchant ON refund_requests(merchant_id);
CREATE INDEX idx_refund_idempotency ON refund_requests(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_refund_created ON refund_requests(created_at DESC);

COMMENT ON TABLE refund_requests IS 'Main refund request tracking with SIRA decisions';
COMMENT ON COLUMN refund_requests.sira_score IS 'ML-based risk score: 0=safe, 1=very risky';
COMMENT ON COLUMN refund_requests.decision IS 'SIRA decision JSON: {action, confidence, reasons[]}';

-- 2) Immutable audit trail for refunds
CREATE TABLE IF NOT EXISTS refund_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id UUID NOT NULL REFERENCES refund_requests(id) ON DELETE CASCADE,
  actor_id UUID,
  actor_role TEXT,                             -- buyer, merchant, ops, system
  action TEXT NOT NULL,                        -- initiate, sira_decision, approve, reject, execute, rollback, evidence_upload
  payload JSONB,                               -- action-specific data
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refund_audit_refund ON refund_audit(refund_id);
CREATE INDEX idx_refund_audit_created ON refund_audit(created_at DESC);
CREATE INDEX idx_refund_audit_actor ON refund_audit(actor_id);

COMMENT ON TABLE refund_audit IS 'Immutable audit log for all refund operations';

-- 3) Evidence storage metadata
CREATE TABLE IF NOT EXISTS refund_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id UUID NOT NULL REFERENCES refund_requests(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL,
  uploader_role TEXT NOT NULL,                 -- merchant, ops, buyer
  file_type TEXT NOT NULL,                     -- receipt, screenshot, email, chat_log
  s3_key TEXT NOT NULL,                        -- encrypted storage location
  s3_bucket TEXT,
  mime_type TEXT,
  file_size BIGINT,
  description TEXT,
  encrypted BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_evidence_refund ON refund_evidence(refund_id);

COMMENT ON TABLE refund_evidence IS 'Metadata for encrypted evidence files stored in S3';

-- 4) Daily metrics aggregation
CREATE TABLE IF NOT EXISTS refund_metrics_daily (
  day DATE NOT NULL,
  merchant_id UUID,
  origin_module TEXT,
  currency TEXT DEFAULT 'USD',
  total_requested NUMERIC(18,2) DEFAULT 0,
  total_refunded NUMERIC(18,2) DEFAULT 0,
  total_rejected NUMERIC(18,2) DEFAULT 0,
  count_requests BIGINT DEFAULT 0,
  count_auto_approved BIGINT DEFAULT 0,
  count_manual_review BIGINT DEFAULT 0,
  count_refunded BIGINT DEFAULT 0,
  count_rejected BIGINT DEFAULT 0,
  count_failed BIGINT DEFAULT 0,
  avg_sira_score NUMERIC(6,4),
  avg_processing_time_seconds BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (day, merchant_id, origin_module, currency)
);

CREATE INDEX idx_metrics_day ON refund_metrics_daily(day DESC);
CREATE INDEX idx_metrics_merchant ON refund_metrics_daily(merchant_id);

COMMENT ON TABLE refund_metrics_daily IS 'Daily aggregated refund metrics for analytics';

-- 5) Merchant refund configuration
CREATE TABLE IF NOT EXISTS merchant_refund_config (
  merchant_id UUID PRIMARY KEY,
  auto_refund_enabled BOOLEAN DEFAULT TRUE,
  auto_refund_limit NUMERIC(18,2) DEFAULT 500.00,  -- max amount for auto-refund
  refund_window_days INT DEFAULT 30,               -- days after purchase for auto-refund
  partial_refunds_allowed BOOLEAN DEFAULT TRUE,
  merchant_pays_fee BOOLEAN DEFAULT TRUE,
  require_kyc_above_amount NUMERIC(18,2) DEFAULT 5000.00,
  max_refunds_per_user_per_day INT DEFAULT 5,
  sira_auto_approve_threshold NUMERIC(6,4) DEFAULT 0.3000,  -- SIRA score threshold
  multi_sig_required_above NUMERIC(18,2) DEFAULT 10000.00,
  allowed_modules TEXT[] DEFAULT ARRAY['shop', 'eats', 'connect'],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE merchant_refund_config IS 'Per-merchant refund policy configuration';

-- 6) User refund rate limits (anti-abuse)
CREATE TABLE IF NOT EXISTS user_refund_limits (
  user_id UUID PRIMARY KEY,
  refunds_today INT DEFAULT 0,
  refunds_this_week INT DEFAULT 0,
  refunds_this_month INT DEFAULT 0,
  total_refunded_amount_30d NUMERIC(18,2) DEFAULT 0,
  is_blocked BOOLEAN DEFAULT FALSE,
  block_reason TEXT,
  last_refund_at TIMESTAMPTZ,
  reset_at TIMESTAMPTZ DEFAULT (CURRENT_DATE + INTERVAL '1 day'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_limits_reset ON user_refund_limits(reset_at);

COMMENT ON TABLE user_refund_limits IS 'Per-user rate limits to prevent refund abuse';

-- 7) SIRA feedback for ML training
CREATE TABLE IF NOT EXISTS refund_sira_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id UUID NOT NULL REFERENCES refund_requests(id),
  payment_id UUID NOT NULL,
  user_id UUID NOT NULL,
  features JSONB NOT NULL,                     -- input features for SIRA model
  prediction JSONB NOT NULL,                   -- SIRA output (score, action)
  actual_outcome TEXT,                         -- refunded, rejected, chargeback
  outcome_at TIMESTAMPTZ,
  model_version TEXT DEFAULT 'sira-refund-v1.0',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sira_feedback_model ON refund_sira_feedback(model_version, created_at DESC);
CREATE INDEX idx_sira_feedback_outcome ON refund_sira_feedback(actual_outcome);

COMMENT ON TABLE refund_sira_feedback IS 'Training data for SIRA refund risk models';

-- 8) Multi-signature approvals for high-value refunds
CREATE TABLE IF NOT EXISTS refund_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id UUID NOT NULL REFERENCES refund_requests(id) ON DELETE CASCADE,
  required_approvers TEXT[] NOT NULL,          -- ['ops_refunds', 'finance_ops']
  approvals JSONB DEFAULT '[]',                -- [{role, user_id, approved_at}]
  status TEXT DEFAULT 'pending',               -- pending, approved, rejected
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_approval_refund ON refund_approvals(refund_id);
CREATE INDEX idx_approval_status ON refund_approvals(status);

COMMENT ON TABLE refund_approvals IS 'Multi-sig approval workflow for high-value refunds';

-- Trigger: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_refund_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_refund_updated
  BEFORE UPDATE ON refund_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_refund_updated_at();

-- Function: Increment daily metrics
CREATE OR REPLACE FUNCTION increment_refund_metrics()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO refund_metrics_daily (day, merchant_id, origin_module, currency, count_requests, total_requested)
  VALUES (CURRENT_DATE, NEW.merchant_id, NEW.origin_module, NEW.currency, 1, NEW.requested_amount)
  ON CONFLICT (day, merchant_id, origin_module, currency)
  DO UPDATE SET
    count_requests = refund_metrics_daily.count_requests + 1,
    total_requested = refund_metrics_daily.total_requested + EXCLUDED.total_requested,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_metrics
  AFTER INSERT ON refund_requests
  FOR EACH ROW
  EXECUTE FUNCTION increment_refund_metrics();

-- Function: Check user rate limits
CREATE OR REPLACE FUNCTION check_user_refund_limits()
RETURNS TRIGGER AS $$
DECLARE
  limits RECORD;
  config RECORD;
BEGIN
  -- Get user limits
  SELECT * INTO limits FROM user_refund_limits WHERE user_id = NEW.requester_user_id FOR UPDATE;

  -- Get merchant config
  SELECT * INTO config FROM merchant_refund_config WHERE merchant_id = NEW.merchant_id;

  -- Check if user is blocked
  IF limits.is_blocked THEN
    RAISE EXCEPTION 'User is blocked from refund requests: %', limits.block_reason;
  END IF;

  -- Check daily limit
  IF config.max_refunds_per_user_per_day IS NOT NULL AND limits.refunds_today >= config.max_refunds_per_user_per_day THEN
    RAISE EXCEPTION 'User has exceeded daily refund limit (%)', config.max_refunds_per_user_per_day;
  END IF;

  -- Update counters
  IF limits.user_id IS NULL THEN
    INSERT INTO user_refund_limits (user_id, refunds_today, refunds_this_week, refunds_this_month, last_refund_at)
    VALUES (NEW.requester_user_id, 1, 1, 1, NOW());
  ELSE
    UPDATE user_refund_limits
    SET refunds_today = refunds_today + 1,
        refunds_this_week = refunds_this_week + 1,
        refunds_this_month = refunds_this_month + 1,
        last_refund_at = NOW(),
        updated_at = NOW()
    WHERE user_id = NEW.requester_user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_user_limits
  BEFORE INSERT ON refund_requests
  FOR EACH ROW
  WHEN (NEW.requester_role = 'buyer')
  EXECUTE FUNCTION check_user_refund_limits();

-- Insert default merchant config for testing
INSERT INTO merchant_refund_config (merchant_id, auto_refund_enabled)
VALUES ('00000000-0000-0000-0000-000000000001', TRUE)
ON CONFLICT (merchant_id) DO NOTHING;

-- Comments on key columns
COMMENT ON COLUMN refund_requests.status IS 'Lifecycle: pending → auto_approved/manual_review/rejected → processing → refunded/failed → reversed (optional)';
COMMENT ON COLUMN merchant_refund_config.sira_auto_approve_threshold IS 'SIRA scores below this threshold qualify for auto-approval';
