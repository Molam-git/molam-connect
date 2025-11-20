-- =====================================================================
-- Brique 120ter: Smart Marketplace Flow (Disruptive)
-- =====================================================================

-- Table: seller_escrows
CREATE TABLE IF NOT EXISTS seller_escrows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    seller_id UUID NOT NULL REFERENCES marketplace_sellers(id) ON DELETE CASCADE,

    amount NUMERIC(20,6) NOT NULL,
    currency VARCHAR(3) NOT NULL,

    reason TEXT,
    risk_score NUMERIC(5,2),

    status VARCHAR(20) DEFAULT 'held' CHECK (status IN ('held', 'released', 'used', 'expired')),

    held_at TIMESTAMPTZ DEFAULT now(),
    released_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,

    created_by UUID,
    released_by UUID,

    metadata JSONB,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_seller_escrows_seller ON seller_escrows(seller_id, status);
CREATE INDEX idx_seller_escrows_status ON seller_escrows(status) WHERE status = 'held';

-- Table: seller_advances
CREATE TABLE IF NOT EXISTS seller_advances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    seller_id UUID NOT NULL REFERENCES marketplace_sellers(id) ON DELETE CASCADE,
    external_id TEXT UNIQUE NOT NULL,

    advance_amount NUMERIC(20,6) NOT NULL,
    currency VARCHAR(3) NOT NULL,

    fee_percent NUMERIC(6,4) NOT NULL,
    fee_amount NUMERIC(20,6) GENERATED ALWAYS AS (advance_amount * fee_percent) STORED,
    total_due NUMERIC(20,6) GENERATED ALWAYS AS (advance_amount + (advance_amount * fee_percent)) STORED,

    status VARCHAR(20) DEFAULT 'requested' CHECK (status IN (
        'requested', 'approved', 'rejected', 'disbursed', 'repaid', 'defaulted'
    )),

    approval_score NUMERIC(5,2),
    sira_recommendation TEXT,

    requested_at TIMESTAMPTZ DEFAULT now(),
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    disbursed_at TIMESTAMPTZ,

    repaid_amount NUMERIC(20,6) DEFAULT 0,
    repayment_schedule VARCHAR(20), -- 'immediate', 'future_sales', 'installments'

    approved_by UUID,
    rejected_by UUID,

    metadata JSONB,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_seller_advances_seller ON seller_advances(seller_id, status);
CREATE INDEX idx_seller_advances_status ON seller_advances(status);
CREATE INDEX idx_seller_advances_external ON seller_advances(external_id);

-- Table: payout_slices (multi-bank split)
CREATE TABLE IF NOT EXISTS payout_slices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    parent_payout_id UUID NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,
    treasury_account_id UUID, -- REFERENCES treasury_accounts(id) if Brique 119 exists

    slice_amount NUMERIC(20,6) NOT NULL,
    currency VARCHAR(3) NOT NULL,

    slice_order INT DEFAULT 1, -- Order of execution

    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'sent', 'settled', 'failed', 'cancelled'
    )),

    provider_ref TEXT,
    provider_response JSONB,

    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 6,
    last_error TEXT,

    sent_at TIMESTAMPTZ,
    settled_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_payout_slices_parent ON payout_slices(parent_payout_id);
CREATE INDEX idx_payout_slices_status ON payout_slices(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_payout_slices_treasury ON payout_slices(treasury_account_id);

-- Table: sira_payout_recommendations
CREATE TABLE IF NOT EXISTS sira_payout_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    seller_id UUID REFERENCES marketplace_sellers(id) ON DELETE CASCADE,
    parent_payout_id UUID REFERENCES payouts(id) ON DELETE CASCADE,

    priority_score NUMERIC(5,2), -- 0-100
    risk_score NUMERIC(5,2), -- 0-100

    multi_bank BOOLEAN DEFAULT false,
    recommended_slices JSONB, -- [{treasury_account_id, amount, order}]

    recommended_action VARCHAR(20), -- 'instant', 'batch', 'hold', 'advance', 'escrow'
    recommended_treasury_id UUID,

    reasons JSONB, -- Explainability
    features_used JSONB,

    model_version VARCHAR(50),

    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sira_payout_seller ON sira_payout_recommendations(seller_id);
CREATE INDEX idx_sira_payout_parent ON sira_payout_recommendations(parent_payout_id);
CREATE INDEX idx_sira_payout_created ON sira_payout_recommendations(created_at DESC);

-- Table: advance_repayments (tracking auto-repayment)
CREATE TABLE IF NOT EXISTS advance_repayments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    advance_id UUID NOT NULL REFERENCES seller_advances(id) ON DELETE CASCADE,
    seller_payout_id UUID REFERENCES seller_payouts(id),

    repayment_amount NUMERIC(20,6) NOT NULL,
    repayment_type VARCHAR(20) DEFAULT 'auto_deduction', -- 'auto_deduction', 'manual_payment'

    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_advance_repayments_advance ON advance_repayments(advance_id);

-- =====================================================================
-- Functions
-- =====================================================================

-- Function: calculate_seller_available_for_advance
CREATE OR REPLACE FUNCTION calculate_seller_available_for_advance(
    p_seller_id UUID
) RETURNS NUMERIC AS $$
DECLARE
    v_avg_monthly_sales NUMERIC;
    v_outstanding_advances NUMERIC;
    v_max_advance_percent NUMERIC := 0.30; -- 30% of avg monthly
    v_available NUMERIC;
BEGIN
    -- Calculate average monthly sales (last 3 months)
    SELECT COALESCE(AVG(monthly_total), 0) INTO v_avg_monthly_sales
    FROM (
        SELECT DATE_TRUNC('month', created_at) as month,
               SUM(amount) as monthly_total
        FROM seller_transactions
        WHERE marketplace_seller_id = p_seller_id
          AND transaction_type = 'sale'
          AND created_at >= now() - interval '3 months'
        GROUP BY DATE_TRUNC('month', created_at)
    ) monthly_sales;

    -- Get outstanding advances
    SELECT COALESCE(SUM(advance_amount - repaid_amount), 0) INTO v_outstanding_advances
    FROM seller_advances
    WHERE seller_id = p_seller_id
      AND status IN ('disbursed');

    v_available := (v_avg_monthly_sales * v_max_advance_percent) - v_outstanding_advances;

    RETURN GREATEST(v_available, 0);
END;
$$ LANGUAGE plpgsql;

-- Function: auto_repay_advances
CREATE OR REPLACE FUNCTION auto_repay_advances(
    p_seller_id UUID,
    p_payout_amount NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
    v_advance RECORD;
    v_remaining_amount NUMERIC := p_payout_amount;
    v_repayment_amount NUMERIC;
    v_total_repaid NUMERIC := 0;
BEGIN
    -- Get outstanding advances ordered by oldest first
    FOR v_advance IN
        SELECT *
        FROM seller_advances
        WHERE seller_id = p_seller_id
          AND status = 'disbursed'
          AND (advance_amount - repaid_amount) > 0
        ORDER BY disbursed_at ASC
    LOOP
        IF v_remaining_amount <= 0 THEN
            EXIT;
        END IF;

        -- Calculate repayment amount
        v_repayment_amount := LEAST(
            v_remaining_amount,
            (v_advance.advance_amount + (v_advance.advance_amount * v_advance.fee_percent)) - v_advance.repaid_amount
        );

        -- Update advance
        UPDATE seller_advances
        SET repaid_amount = repaid_amount + v_repayment_amount,
            status = CASE
                WHEN (repaid_amount + v_repayment_amount) >= (advance_amount + (advance_amount * fee_percent))
                THEN 'repaid'
                ELSE status
            END,
            updated_at = now()
        WHERE id = v_advance.id;

        v_remaining_amount := v_remaining_amount - v_repayment_amount;
        v_total_repaid := v_total_repaid + v_repayment_amount;
    END LOOP;

    RETURN v_total_repaid;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- Triggers
-- =====================================================================

CREATE OR REPLACE FUNCTION update_slice_timestamp()
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

CREATE TRIGGER update_payout_slices_timestamp
    BEFORE UPDATE ON payout_slices
    FOR EACH ROW
    EXECUTE FUNCTION update_slice_timestamp();

-- =====================================================================
-- Views
-- =====================================================================

-- View: seller advance eligibility
CREATE OR REPLACE VIEW seller_advance_eligibility AS
SELECT
    ms.id as seller_id,
    ms.seller_name,
    ms.marketplace_account_id,
    ms.kyc_status,
    calculate_seller_available_for_advance(ms.id) as max_advance_available,
    COALESCE(SUM(sa.advance_amount - sa.repaid_amount), 0) as outstanding_advances,
    COUNT(sa.id) FILTER (WHERE sa.status = 'disbursed') as active_advances_count
FROM marketplace_sellers ms
LEFT JOIN seller_advances sa ON ms.id = sa.seller_id AND sa.status IN ('disbursed')
GROUP BY ms.id, ms.seller_name, ms.marketplace_account_id, ms.kyc_status;

-- View: active payout slices
CREATE OR REPLACE VIEW active_payout_slices AS
SELECT
    ps.*,
    p.reference_code as parent_reference,
    p.origin_entity_id as seller_id,
    p.currency as parent_currency
FROM payout_slices ps
JOIN payouts p ON ps.parent_payout_id = p.id
WHERE ps.status IN ('pending', 'processing')
ORDER BY ps.slice_order ASC, ps.created_at ASC;

-- =====================================================================
-- Comments
-- =====================================================================

COMMENT ON TABLE seller_escrows IS 'Escrow holds for high-risk or disputed seller payouts';
COMMENT ON TABLE seller_advances IS 'Revenue advances to sellers with auto-repayment';
COMMENT ON TABLE payout_slices IS 'Multi-bank split slices for large payouts';
COMMENT ON TABLE sira_payout_recommendations IS 'SIRA ML recommendations for payout routing and risk';
