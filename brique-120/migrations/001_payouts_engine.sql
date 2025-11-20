-- =====================================================================
-- Brique 120: Payouts Engine & Scheduling
-- =====================================================================
-- Moteur de payouts industriel avec:
-- - Scheduling (instant, daily, weekly, monthly)
-- - Batch processing et netting
-- - Priority routing (instant/priority/normal/low)
-- - Retries, backoff, DLQ
-- - Ledger integration
-- - Audit trail et approvals
-- =====================================================================

-- Table: payouts
CREATE TABLE IF NOT EXISTS payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id TEXT UNIQUE NOT NULL, -- Idempotency key

    -- Origin
    origin_module VARCHAR(50) NOT NULL, -- 'connect', 'wallet', 'ops'
    origin_entity_id UUID NOT NULL, -- merchant_id / agent_id / user_id

    -- Amount & Currency
    currency VARCHAR(3) NOT NULL,
    amount NUMERIC(20,6) NOT NULL CHECK (amount > 0),
    net_amount NUMERIC(20,6), -- amount minus fees
    molam_fee NUMERIC(12,6) DEFAULT 0,
    bank_fee NUMERIC(12,6) DEFAULT 0,
    total_deducted NUMERIC(20,6) GENERATED ALWAYS AS (molam_fee + bank_fee) STORED,

    -- Beneficiary
    beneficiary JSONB NOT NULL, -- { account_number, account_name, bank_code, etc }

    -- Routing
    bank_profile_id UUID, -- REFERENCES bank_profiles(id) if Brique 119 exists
    treasury_account_id UUID, -- REFERENCES treasury_accounts(id) if Brique 119 exists

    -- Priority & Scheduling
    priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('instant', 'priority', 'normal', 'low')),
    scheduled_run TIMESTAMPTZ, -- When to execute (NULL = ASAP)

    -- Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
        'pending', 'queued', 'processing', 'sent', 'settled', 'failed', 'cancelled', 'reversed'
    )),

    -- Reference & Provider
    reference_code TEXT UNIQUE NOT NULL,
    provider_ref TEXT, -- Provider transaction ID
    provider_response JSONB, -- Full provider response

    -- Retries
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 6,
    next_retry_at TIMESTAMPTZ,
    last_error TEXT,

    -- Reconciliation
    reconciled_at TIMESTAMPTZ,
    reconciliation_ref TEXT,

    -- Metadata
    metadata JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    sent_at TIMESTAMPTZ,
    settled_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,

    -- Audit
    created_by UUID,
    approved_by UUID,
    approved_at TIMESTAMPTZ
);

CREATE INDEX idx_payouts_status_sched ON payouts(status, scheduled_run) WHERE status IN ('pending', 'queued');
CREATE INDEX idx_payouts_origin ON payouts(origin_module, origin_entity_id);
CREATE INDEX idx_payouts_priority ON payouts(priority, created_at) WHERE status = 'pending';
CREATE INDEX idx_payouts_reference ON payouts(reference_code);
CREATE INDEX idx_payouts_provider_ref ON payouts(provider_ref) WHERE provider_ref IS NOT NULL;
CREATE INDEX idx_payouts_created_at ON payouts(created_at DESC);
CREATE INDEX idx_payouts_retry ON payouts(next_retry_at) WHERE status = 'failed' AND attempts < max_attempts;

-- Table: ledger_holds
CREATE TABLE IF NOT EXISTS ledger_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Entity
    origin_entity_id UUID NOT NULL,
    currency VARCHAR(3) NOT NULL,

    -- Amount
    amount NUMERIC(20,6) NOT NULL CHECK (amount > 0),
    released_amount NUMERIC(20,6) DEFAULT 0,
    remaining_amount NUMERIC(20,6) GENERATED ALWAYS AS (amount - released_amount) STORED,

    -- Reference
    reason TEXT NOT NULL,
    ref_type VARCHAR(50), -- 'payout', 'settlement', 'reserve'
    ref_id UUID, -- linked payout id or other entity

    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'released', 'expired', 'cancelled')),

    -- Expiry
    expires_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    released_at TIMESTAMPTZ
);

CREATE INDEX idx_ledger_holds_entity ON ledger_holds(origin_entity_id, currency, status);
CREATE INDEX idx_ledger_holds_ref ON ledger_holds(ref_type, ref_id);
CREATE INDEX idx_ledger_holds_status ON ledger_holds(status) WHERE status = 'active';

-- Table: payout_batches
CREATE TABLE IF NOT EXISTS payout_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Routing
    bank_profile_id UUID,
    treasury_account_id UUID,
    currency VARCHAR(3) NOT NULL,

    -- Batch Info
    batch_date TIMESTAMPTZ DEFAULT now(),
    batch_reference TEXT UNIQUE NOT NULL,

    -- Status
    status VARCHAR(20) DEFAULT 'created' CHECK (status IN (
        'created', 'processing', 'sent', 'settled', 'failed', 'partial'
    )),

    -- Aggregates
    total_amount NUMERIC(20,6) DEFAULT 0,
    payouts_count INT DEFAULT 0,
    successful_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,

    -- Provider
    provider_batch_ref TEXT,
    provider_response JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    sent_at TIMESTAMPTZ,
    settled_at TIMESTAMPTZ,

    -- Audit
    created_by UUID,
    executed_by UUID
);

CREATE INDEX idx_payout_batches_status ON payout_batches(status, batch_date);
CREATE INDEX idx_payout_batches_bank ON payout_batches(bank_profile_id, currency);
CREATE INDEX idx_payout_batches_created_at ON payout_batches(created_at DESC);

-- Table: payout_batch_lines
CREATE TABLE IF NOT EXISTS payout_batch_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    batch_id UUID NOT NULL REFERENCES payout_batches(id) ON DELETE CASCADE,
    payout_id UUID NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,

    amount NUMERIC(20,6) NOT NULL,

    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'sent', 'settled', 'failed'
    )),

    error_message TEXT,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_payout_batch_lines_batch ON payout_batch_lines(batch_id);
CREATE INDEX idx_payout_batch_lines_payout ON payout_batch_lines(payout_id);
CREATE INDEX idx_payout_batch_lines_status ON payout_batch_lines(status);

-- Table: payout_approvals (multi-sig for high-value payouts)
CREATE TABLE IF NOT EXISTS payout_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    payout_id UUID NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,

    -- Approval threshold
    required_approvals INT DEFAULT 2,
    current_approvals INT DEFAULT 0,

    -- Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
        'pending', 'approved', 'rejected', 'expired'
    )),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ
);

CREATE INDEX idx_payout_approvals_payout ON payout_approvals(payout_id);
CREATE INDEX idx_payout_approvals_status ON payout_approvals(status);

-- Table: payout_approval_signatures
CREATE TABLE IF NOT EXISTS payout_approval_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    approval_id UUID NOT NULL REFERENCES payout_approvals(id) ON DELETE CASCADE,

    user_id UUID NOT NULL,
    user_role VARCHAR(50) NOT NULL, -- 'pay_admin', 'finance_ops', 'treasury_ops'

    action VARCHAR(20) NOT NULL CHECK (action IN ('approve', 'reject')),
    comment TEXT,

    signed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_payout_approval_sigs_approval ON payout_approval_signatures(approval_id);
CREATE INDEX idx_payout_approval_sigs_user ON payout_approval_signatures(user_id);

-- Table: payout_events (audit trail)
CREATE TABLE IF NOT EXISTS payout_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    payout_id UUID REFERENCES payouts(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES payout_batches(id) ON DELETE CASCADE,

    event_type VARCHAR(50) NOT NULL, -- 'created', 'queued', 'sent', 'failed', 'settled', 'cancelled', 'approved', 'reversed'
    event_category VARCHAR(30) DEFAULT 'operational', -- 'operational', 'financial', 'compliance', 'technical'
    severity VARCHAR(20) DEFAULT 'info', -- 'info', 'warning', 'error', 'critical'

    description TEXT,
    metadata JSONB,

    triggered_by UUID,

    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_payout_events_payout ON payout_events(payout_id, created_at DESC);
CREATE INDEX idx_payout_events_batch ON payout_events(batch_id, created_at DESC);
CREATE INDEX idx_payout_events_type ON payout_events(event_type, created_at DESC);
CREATE INDEX idx_payout_events_created_at ON payout_events(created_at DESC);

-- Table: payout_routing_rules (SIRA integration)
CREATE TABLE IF NOT EXISTS payout_routing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Criteria
    currency VARCHAR(3),
    min_amount NUMERIC(20,6),
    max_amount NUMERIC(20,6),
    priority VARCHAR(10),
    origin_module VARCHAR(50),

    -- Routing
    preferred_bank_id UUID,
    fallback_bank_id UUID,

    -- Fees
    molam_fee_percent NUMERIC(5,4), -- 0.25% = 0.0025
    molam_fee_fixed NUMERIC(12,6),
    bank_fee_percent NUMERIC(5,4),
    bank_fee_fixed NUMERIC(12,6),

    -- Settings
    auto_batch BOOLEAN DEFAULT true,
    requires_approval BOOLEAN DEFAULT false,
    approval_threshold NUMERIC(20,6),

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID
);

CREATE INDEX idx_payout_routing_rules_currency ON payout_routing_rules(currency, is_active);
CREATE INDEX idx_payout_routing_rules_priority ON payout_routing_rules(priority, is_active);

-- =====================================================================
-- Functions
-- =====================================================================

-- Function: log_payout_event
CREATE OR REPLACE FUNCTION log_payout_event(
    p_payout_id UUID,
    p_batch_id UUID,
    p_event_type VARCHAR(50),
    p_event_category VARCHAR(30),
    p_severity VARCHAR(20),
    p_description TEXT,
    p_metadata JSONB,
    p_triggered_by UUID
) RETURNS UUID AS $$
DECLARE
    v_event_id UUID;
BEGIN
    INSERT INTO payout_events (
        payout_id, batch_id, event_type, event_category, severity,
        description, metadata, triggered_by
    ) VALUES (
        p_payout_id, p_batch_id, p_event_type, p_event_category, p_severity,
        p_description, p_metadata, p_triggered_by
    ) RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function: create_ledger_hold
CREATE OR REPLACE FUNCTION create_ledger_hold(
    p_entity_id UUID,
    p_currency VARCHAR(3),
    p_amount NUMERIC(20,6),
    p_reason TEXT,
    p_ref_type VARCHAR(50),
    p_ref_id UUID
) RETURNS UUID AS $$
DECLARE
    v_hold_id UUID;
BEGIN
    INSERT INTO ledger_holds (
        origin_entity_id, currency, amount, reason, ref_type, ref_id, status
    ) VALUES (
        p_entity_id, p_currency, p_amount, p_reason, p_ref_type, p_ref_id, 'active'
    ) RETURNING id INTO v_hold_id;

    RETURN v_hold_id;
END;
$$ LANGUAGE plpgsql;

-- Function: release_ledger_hold
CREATE OR REPLACE FUNCTION release_ledger_hold(
    p_hold_id UUID,
    p_release_amount NUMERIC(20,6)
) RETURNS BOOLEAN AS $$
DECLARE
    v_remaining NUMERIC(20,6);
BEGIN
    UPDATE ledger_holds
    SET
        released_amount = released_amount + p_release_amount,
        released_at = CASE
            WHEN (amount - released_amount - p_release_amount) <= 0 THEN now()
            ELSE released_at
        END,
        status = CASE
            WHEN (amount - released_amount - p_release_amount) <= 0 THEN 'released'
            ELSE status
        END
    WHERE id = p_hold_id
    RETURNING remaining_amount INTO v_remaining;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function: calculate_payout_fees
CREATE OR REPLACE FUNCTION calculate_payout_fees(
    p_currency VARCHAR(3),
    p_amount NUMERIC(20,6),
    p_priority VARCHAR(10),
    p_origin_module VARCHAR(50)
) RETURNS TABLE(molam_fee NUMERIC, bank_fee NUMERIC, net_amount NUMERIC) AS $$
DECLARE
    v_rule RECORD;
    v_molam_fee NUMERIC := 0;
    v_bank_fee NUMERIC := 0;
BEGIN
    -- Find matching routing rule
    SELECT * INTO v_rule
    FROM payout_routing_rules
    WHERE is_active = true
        AND (currency IS NULL OR currency = p_currency)
        AND (priority IS NULL OR priority = p_priority)
        AND (origin_module IS NULL OR origin_module = p_origin_module)
        AND (min_amount IS NULL OR p_amount >= min_amount)
        AND (max_amount IS NULL OR p_amount <= max_amount)
    ORDER BY
        CASE WHEN currency IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN priority IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN origin_module IS NOT NULL THEN 1 ELSE 0 END DESC
    LIMIT 1;

    IF FOUND THEN
        v_molam_fee := COALESCE(v_rule.molam_fee_fixed, 0) +
                      (p_amount * COALESCE(v_rule.molam_fee_percent, 0));
        v_bank_fee := COALESCE(v_rule.bank_fee_fixed, 0) +
                     (p_amount * COALESCE(v_rule.bank_fee_percent, 0));
    ELSE
        -- Default fees (instant has higher fees)
        IF p_priority = 'instant' THEN
            v_molam_fee := p_amount * 0.005; -- 0.5%
            v_bank_fee := 2.00;
        ELSE
            v_molam_fee := p_amount * 0.0025; -- 0.25%
            v_bank_fee := 0.50;
        END IF;
    END IF;

    RETURN QUERY SELECT v_molam_fee, v_bank_fee, (p_amount - v_molam_fee - v_bank_fee);
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- Triggers
-- =====================================================================

-- Trigger: update payouts timestamp
CREATE OR REPLACE FUNCTION update_payout_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();

    -- Set specific timestamps based on status changes
    IF NEW.status = 'sent' AND OLD.status != 'sent' THEN
        NEW.sent_at = now();
    END IF;

    IF NEW.status = 'settled' AND OLD.status != 'settled' THEN
        NEW.settled_at = now();
    END IF;

    IF NEW.status = 'failed' AND OLD.status != 'failed' THEN
        NEW.failed_at = now();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_payouts_timestamp
    BEFORE UPDATE ON payouts
    FOR EACH ROW
    EXECUTE FUNCTION update_payout_timestamp();

-- Trigger: update batch timestamp
CREATE OR REPLACE FUNCTION update_batch_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();

    IF NEW.status = 'sent' AND OLD.status != 'sent' THEN
        NEW.sent_at = now();
    END IF;

    IF NEW.status = 'settled' AND OLD.status != 'settled' THEN
        NEW.settled_at = now();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_batches_timestamp
    BEFORE UPDATE ON payout_batches
    FOR EACH ROW
    EXECUTE FUNCTION update_batch_timestamp();

-- =====================================================================
-- Views
-- =====================================================================

-- View: pending payouts summary
CREATE OR REPLACE VIEW pending_payouts_summary AS
SELECT
    currency,
    priority,
    origin_module,
    COUNT(*) as total_count,
    SUM(amount) as total_amount,
    SUM(net_amount) as total_net_amount,
    MIN(created_at) as oldest_payout,
    MAX(created_at) as newest_payout
FROM payouts
WHERE status IN ('pending', 'queued')
GROUP BY currency, priority, origin_module;

-- View: failed payouts requiring attention
CREATE OR REPLACE VIEW failed_payouts_dlq AS
SELECT
    p.*,
    (p.attempts >= p.max_attempts) as in_dlq,
    CASE
        WHEN p.attempts >= p.max_attempts THEN 'manual_intervention_required'
        WHEN p.next_retry_at <= now() THEN 'ready_for_retry'
        ELSE 'awaiting_retry'
    END as retry_status
FROM payouts p
WHERE p.status = 'failed'
ORDER BY p.failed_at DESC;

-- View: batch execution summary
CREATE OR REPLACE VIEW batch_execution_summary AS
SELECT
    pb.id,
    pb.batch_reference,
    pb.currency,
    pb.status,
    pb.payouts_count,
    pb.successful_count,
    pb.failed_count,
    pb.total_amount,
    pb.created_at,
    pb.sent_at,
    pb.settled_at,
    (pb.settled_at - pb.created_at) as execution_duration,
    ROUND((pb.successful_count::NUMERIC / NULLIF(pb.payouts_count, 0) * 100), 2) as success_rate
FROM payout_batches pb
ORDER BY pb.created_at DESC;

-- =====================================================================
-- Initial Data: Default routing rules
-- =====================================================================

INSERT INTO payout_routing_rules (
    currency, priority, molam_fee_percent, molam_fee_fixed, bank_fee_fixed,
    auto_batch, requires_approval, approval_threshold
) VALUES
    -- Instant payouts (higher fees)
    (NULL, 'instant', 0.0050, 0, 2.00, false, false, NULL),
    -- Priority payouts
    (NULL, 'priority', 0.0035, 0, 1.00, true, false, NULL),
    -- Normal payouts
    (NULL, 'normal', 0.0025, 0, 0.50, true, false, 10000.00),
    -- Low priority (cheapest)
    (NULL, 'low', 0.0015, 0, 0.25, true, false, 50000.00)
ON CONFLICT DO NOTHING;

-- =====================================================================
-- Comments
-- =====================================================================

COMMENT ON TABLE payouts IS 'Payouts engine - disbursements to merchants, agents, users';
COMMENT ON TABLE ledger_holds IS 'Ledger holds for pending payouts (double-entry accounting)';
COMMENT ON TABLE payout_batches IS 'Batch processing groups for efficient bank transfers';
COMMENT ON TABLE payout_approvals IS 'Multi-signature approvals for high-value payouts';
COMMENT ON TABLE payout_routing_rules IS 'Routing and fee calculation rules (SIRA-integrated)';

-- =====================================================================
-- End of Brique 120 Migration
-- =====================================================================
