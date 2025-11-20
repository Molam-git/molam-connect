-- =====================================================================
-- Sous-Brique 120bis: Multi-Seller Payout Orchestrator (Marketplaces)
-- =====================================================================

-- Table: marketplace_sellers
CREATE TABLE IF NOT EXISTS marketplace_sellers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Marketplace reference
    marketplace_account_id UUID NOT NULL,

    -- Seller info
    seller_name TEXT NOT NULL,
    seller_email TEXT,

    -- KYC & Compliance
    kyc_status VARCHAR(20) DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'verified', 'blocked', 'suspended')),
    kyc_verified_at TIMESTAMPTZ,

    -- Commission & Fees
    commission_rate NUMERIC(6,4) DEFAULT 0.1000, -- 10% default
    commission_type VARCHAR(20) DEFAULT 'percentage' CHECK (commission_type IN ('percentage', 'fixed', 'tiered')),

    -- Settlement
    settlement_schedule VARCHAR(20) DEFAULT 'weekly' CHECK (settlement_schedule IN ('instant', 'daily', 'weekly', 'monthly', 'custom')),
    settlement_day INT DEFAULT 1, -- Day of week (1-7) or month (1-31)
    min_payout_amount NUMERIC(20,6) DEFAULT 10.00,

    -- Financial
    currency VARCHAR(3) NOT NULL,

    -- Priority
    is_vip BOOLEAN DEFAULT false,
    priority_level INT DEFAULT 0, -- Higher = more priority

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Beneficiary
    beneficiary_details JSONB,

    -- Metadata
    metadata JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    updated_by UUID
);

CREATE INDEX idx_marketplace_sellers_marketplace ON marketplace_sellers(marketplace_account_id);
CREATE INDEX idx_marketplace_sellers_kyc ON marketplace_sellers(kyc_status) WHERE kyc_status = 'verified';
CREATE INDEX idx_marketplace_sellers_active ON marketplace_sellers(is_active, settlement_schedule);
CREATE INDEX idx_marketplace_sellers_vip ON marketplace_sellers(is_vip, priority_level) WHERE is_vip = true;

-- Table: seller_payouts
CREATE TABLE IF NOT EXISTS seller_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    marketplace_seller_id UUID NOT NULL REFERENCES marketplace_sellers(id) ON DELETE CASCADE,
    parent_payout_id UUID REFERENCES payouts(id) ON DELETE SET NULL,

    -- Amounts
    gross_amount NUMERIC(20,6) NOT NULL,
    commission NUMERIC(20,6) DEFAULT 0,
    refunds NUMERIC(20,6) DEFAULT 0,
    adjustments NUMERIC(20,6) DEFAULT 0,
    net_amount NUMERIC(20,6) NOT NULL,

    -- Netting details
    sales_count INT DEFAULT 0,
    refunds_count INT DEFAULT 0,

    -- Period
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,

    -- Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'failed', 'on_hold', 'cancelled')),
    hold_reason TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    settled_at TIMESTAMPTZ
);

CREATE INDEX idx_seller_payouts_seller ON seller_payouts(marketplace_seller_id, status);
CREATE INDEX idx_seller_payouts_parent ON seller_payouts(parent_payout_id);
CREATE INDEX idx_seller_payouts_status ON seller_payouts(status, created_at DESC);
CREATE INDEX idx_seller_payouts_period ON seller_payouts(period_start, period_end);

-- Table: seller_transactions (for netting calculation)
CREATE TABLE IF NOT EXISTS seller_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    marketplace_seller_id UUID NOT NULL REFERENCES marketplace_sellers(id) ON DELETE CASCADE,

    -- Transaction details
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('sale', 'refund', 'commission', 'adjustment', 'fee')),
    amount NUMERIC(20,6) NOT NULL,
    currency VARCHAR(3) NOT NULL,

    -- Reference
    reference_type VARCHAR(50), -- 'payment', 'refund', 'manual'
    reference_id UUID,

    -- Settlement
    is_settled BOOLEAN DEFAULT false,
    settled_in_payout_id UUID REFERENCES seller_payouts(id),

    -- Metadata
    description TEXT,
    metadata JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_seller_txns_seller ON seller_transactions(marketplace_seller_id, is_settled);
CREATE INDEX idx_seller_txns_type ON seller_transactions(transaction_type, created_at DESC);
CREATE INDEX idx_seller_txns_settled ON seller_transactions(is_settled, marketplace_seller_id);
CREATE INDEX idx_seller_txns_payout ON seller_transactions(settled_in_payout_id);

-- Table: seller_holds (KYC failures, compliance holds)
CREATE TABLE IF NOT EXISTS seller_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    marketplace_seller_id UUID NOT NULL REFERENCES marketplace_sellers(id) ON DELETE CASCADE,

    hold_type VARCHAR(50) NOT NULL, -- 'kyc_pending', 'compliance_review', 'ops_freeze', 'dispute'
    reason TEXT NOT NULL,
    amount NUMERIC(20,6),

    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'released', 'escalated')),

    created_at TIMESTAMPTZ DEFAULT now(),
    released_at TIMESTAMPTZ,
    created_by UUID,
    released_by UUID
);

CREATE INDEX idx_seller_holds_seller ON seller_holds(marketplace_seller_id, status);
CREATE INDEX idx_seller_holds_type ON seller_holds(hold_type, status);

-- =====================================================================
-- Functions
-- =====================================================================

-- Function: calculate_seller_balance
CREATE OR REPLACE FUNCTION calculate_seller_balance(
    p_seller_id UUID
) RETURNS TABLE(gross NUMERIC, refunds NUMERIC, commission NUMERIC, net NUMERIC) AS $$
DECLARE
    v_gross NUMERIC := 0;
    v_refunds NUMERIC := 0;
    v_commission NUMERIC := 0;
BEGIN
    -- Sum sales
    SELECT COALESCE(SUM(amount), 0) INTO v_gross
    FROM seller_transactions
    WHERE marketplace_seller_id = p_seller_id
      AND transaction_type = 'sale'
      AND is_settled = false;

    -- Sum refunds
    SELECT COALESCE(SUM(amount), 0) INTO v_refunds
    FROM seller_transactions
    WHERE marketplace_seller_id = p_seller_id
      AND transaction_type = 'refund'
      AND is_settled = false;

    -- Get commission rate
    SELECT (v_gross - v_refunds) * commission_rate INTO v_commission
    FROM marketplace_sellers
    WHERE id = p_seller_id;

    RETURN QUERY SELECT v_gross, v_refunds, v_commission, (v_gross - v_refunds - v_commission);
END;
$$ LANGUAGE plpgsql;

-- Function: settle_seller_transactions
CREATE OR REPLACE FUNCTION settle_seller_transactions(
    p_seller_id UUID,
    p_payout_id UUID
) RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE seller_transactions
    SET is_settled = true,
        settled_in_payout_id = p_payout_id
    WHERE marketplace_seller_id = p_seller_id
      AND is_settled = false;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- Triggers
-- =====================================================================

CREATE OR REPLACE FUNCTION update_marketplace_seller_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_marketplace_sellers_timestamp
    BEFORE UPDATE ON marketplace_sellers
    FOR EACH ROW
    EXECUTE FUNCTION update_marketplace_seller_timestamp();

CREATE TRIGGER update_seller_payouts_timestamp
    BEFORE UPDATE ON seller_payouts
    FOR EACH ROW
    EXECUTE FUNCTION update_marketplace_seller_timestamp();

-- =====================================================================
-- Views
-- =====================================================================

-- View: seller balances
CREATE OR REPLACE VIEW seller_balances AS
SELECT
    ms.id as seller_id,
    ms.seller_name,
    ms.marketplace_account_id,
    ms.currency,
    ms.kyc_status,
    COALESCE(SUM(CASE WHEN st.transaction_type = 'sale' AND NOT st.is_settled THEN st.amount ELSE 0 END), 0) as pending_sales,
    COALESCE(SUM(CASE WHEN st.transaction_type = 'refund' AND NOT st.is_settled THEN st.amount ELSE 0 END), 0) as pending_refunds,
    COALESCE(SUM(CASE WHEN st.transaction_type = 'sale' AND NOT st.is_settled THEN st.amount ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN st.transaction_type = 'refund' AND NOT st.is_settled THEN st.amount ELSE 0 END), 0) as net_pending,
    COUNT(CASE WHEN NOT st.is_settled THEN 1 END) as pending_transactions
FROM marketplace_sellers ms
LEFT JOIN seller_transactions st ON ms.id = st.marketplace_seller_id
GROUP BY ms.id, ms.seller_name, ms.marketplace_account_id, ms.currency, ms.kyc_status;

-- View: sellers ready for settlement
CREATE OR REPLACE VIEW sellers_ready_for_settlement AS
SELECT
    ms.*,
    sb.net_pending,
    sb.pending_transactions
FROM marketplace_sellers ms
JOIN seller_balances sb ON ms.id = sb.seller_id
WHERE ms.is_active = true
  AND ms.kyc_status = 'verified'
  AND sb.net_pending >= ms.min_payout_amount
  AND NOT EXISTS (
      SELECT 1 FROM seller_holds sh
      WHERE sh.marketplace_seller_id = ms.id
        AND sh.status = 'active'
  );

-- =====================================================================
-- Comments
-- =====================================================================

COMMENT ON TABLE marketplace_sellers IS 'Sub-accounts for marketplace sellers with settlement schedules';
COMMENT ON TABLE seller_payouts IS 'Individual seller payouts linked to parent payouts';
COMMENT ON TABLE seller_transactions IS 'Transaction ledger for netting calculation';
COMMENT ON TABLE seller_holds IS 'Compliance and operational holds on seller payouts';
