/**
 * Brique 70octies - AI Loyalty Engine (Sira)
 * Database Schema for Universal Loyalty & Rewards System
 *
 * Features:
 * - Dynamic points calculation
 * - Intelligent cashback
 * - Tier-based rewards (Basic, Silver, Gold, Platinum)
 * - Cross-module loyalty (Shop, Eats, Talk, Free, etc.)
 * - AI-driven campaigns
 * - Ops control with Sira copilot
 */

-- Table: loyalty_programs
-- Merchant-specific loyalty programs
CREATE TABLE IF NOT EXISTS loyalty_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL,

    -- Program configuration
    name TEXT NOT NULL,
    description TEXT,
    currency TEXT NOT NULL DEFAULT 'points', -- points, USD, XOF, EUR, cashback

    -- Point earning rules
    earn_rate NUMERIC(8,4) DEFAULT 0.02, -- Default 2% of purchase
    min_purchase_amount NUMERIC(12,2) DEFAULT 0,
    max_points_per_transaction NUMERIC(12,2),

    -- Redemption rules
    redemption_rate NUMERIC(8,4) DEFAULT 1.00, -- 1 point = $1 by default
    min_redeem_amount NUMERIC(12,2) DEFAULT 10,
    max_redeem_per_transaction NUMERIC(12,2),

    -- Tiers configuration
    enable_tiers BOOLEAN DEFAULT TRUE,
    tier_thresholds JSONB DEFAULT '{
        "silver": {"points": 1000, "spend": 500},
        "gold": {"points": 5000, "spend": 2500},
        "platinum": {"points": 20000, "spend": 10000}
    }',
    tier_multipliers JSONB DEFAULT '{
        "basic": 1.0,
        "silver": 1.25,
        "gold": 1.5,
        "platinum": 2.0
    }',

    -- Cashback settings
    enable_cashback BOOLEAN DEFAULT FALSE,
    cashback_rate NUMERIC(8,4) DEFAULT 0.01, -- 1%

    -- AI settings
    ai_enabled BOOLEAN DEFAULT TRUE,
    ai_optimization_level TEXT DEFAULT 'medium', -- low, medium, high, max

    -- Cross-module settings
    cross_module_enabled BOOLEAN DEFAULT TRUE,
    allowed_modules JSONB DEFAULT '["shop", "eats", "talk", "free"]',

    -- Expiration
    points_expiry_days INTEGER, -- NULL = no expiry

    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_loyalty_programs_merchant ON loyalty_programs(merchant_id);
CREATE INDEX idx_loyalty_programs_status ON loyalty_programs(status);

-- Table: loyalty_balances
-- User point balances per program
CREATE TABLE IF NOT EXISTS loyalty_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,

    -- Balance
    points_balance NUMERIC(18,2) DEFAULT 0,
    cashback_balance NUMERIC(18,2) DEFAULT 0,

    -- Tier
    current_tier TEXT DEFAULT 'basic' CHECK (current_tier IN ('basic', 'silver', 'gold', 'platinum')),
    tier_progress NUMERIC(5,2) DEFAULT 0, -- Progress to next tier (0-100%)

    -- Lifetime stats
    lifetime_points_earned NUMERIC(18,2) DEFAULT 0,
    lifetime_points_redeemed NUMERIC(18,2) DEFAULT 0,
    lifetime_spend NUMERIC(18,2) DEFAULT 0,
    total_transactions INTEGER DEFAULT 0,

    -- Activity
    last_earned_at TIMESTAMPTZ,
    last_redeemed_at TIMESTAMPTZ,

    -- AI insights
    churn_risk_score NUMERIC(3,2), -- 0.00 to 1.00
    engagement_score NUMERIC(3,2), -- 0.00 to 1.00
    predicted_next_purchase_days INTEGER,

    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(program_id, user_id)
);

CREATE INDEX idx_loyalty_balances_program ON loyalty_balances(program_id);
CREATE INDEX idx_loyalty_balances_user ON loyalty_balances(user_id);
CREATE INDEX idx_loyalty_balances_tier ON loyalty_balances(current_tier);
CREATE INDEX idx_loyalty_balances_churn ON loyalty_balances(churn_risk_score DESC);

-- Table: loyalty_transactions
-- All point earning/redemption transactions
CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    balance_id UUID NOT NULL REFERENCES loyalty_balances(id) ON DELETE CASCADE,

    -- Transaction details
    txn_type TEXT NOT NULL CHECK (txn_type IN ('earn', 'redeem', 'adjust', 'expire', 'bonus', 'referral', 'cashback')),
    amount NUMERIC(18,2) NOT NULL,
    description TEXT,

    -- Origin
    origin_module TEXT, -- shop, eats, talk, free, etc.
    origin_txn_id UUID, -- Link to original transaction
    origin_amount NUMERIC(18,2), -- Original purchase amount

    -- AI calculation
    base_amount NUMERIC(18,2), -- Base points before multipliers
    multiplier NUMERIC(8,4) DEFAULT 1.0, -- Tier + campaign multipliers
    ai_bonus NUMERIC(18,2) DEFAULT 0, -- AI-recommended bonus
    ai_reason TEXT, -- Why AI gave bonus

    -- Expiration (for earned points)
    expires_at TIMESTAMPTZ,
    expired BOOLEAN DEFAULT FALSE,

    -- Campaign link
    campaign_id UUID,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_loyalty_txns_balance ON loyalty_transactions(balance_id);
CREATE INDEX idx_loyalty_txns_type ON loyalty_transactions(txn_type);
CREATE INDEX idx_loyalty_txns_origin ON loyalty_transactions(origin_module, origin_txn_id);
CREATE INDEX idx_loyalty_txns_created ON loyalty_transactions(created_at DESC);
CREATE INDEX idx_loyalty_txns_expires ON loyalty_transactions(expires_at) WHERE expired = FALSE;

-- Table: loyalty_tiers
-- Tier definitions and benefits
CREATE TABLE IF NOT EXISTS loyalty_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,

    -- Tier info
    tier_name TEXT NOT NULL, -- basic, silver, gold, platinum
    display_name TEXT NOT NULL,
    tier_order INTEGER NOT NULL, -- 1=basic, 2=silver, 3=gold, 4=platinum

    -- Requirements
    min_points NUMERIC(18,2) DEFAULT 0,
    min_spend NUMERIC(18,2) DEFAULT 0,
    min_transactions INTEGER DEFAULT 0,

    -- Benefits
    point_multiplier NUMERIC(8,4) DEFAULT 1.0,
    cashback_bonus NUMERIC(8,4) DEFAULT 0,
    perks JSONB, -- {"free_shipping": true, "priority_support": true, "exclusive_deals": true}

    -- Visual
    color_hex TEXT,
    icon_url TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_loyalty_tiers_program ON loyalty_tiers(program_id);
CREATE UNIQUE INDEX idx_loyalty_tiers_unique ON loyalty_tiers(program_id, tier_name);

-- Table: loyalty_rewards
-- Redeemable rewards catalog
CREATE TABLE IF NOT EXISTS loyalty_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,

    -- Reward details
    name TEXT NOT NULL,
    description TEXT,
    reward_type TEXT NOT NULL CHECK (reward_type IN ('discount', 'free_product', 'free_shipping', 'cashback', 'gift_card', 'custom')),

    -- Cost
    points_cost NUMERIC(18,2) NOT NULL,
    monetary_value NUMERIC(12,2), -- Actual value in currency

    -- Availability
    stock INTEGER, -- NULL = unlimited
    max_redemptions_per_user INTEGER,

    -- Eligibility
    min_tier TEXT CHECK (min_tier IN ('basic', 'silver', 'gold', 'platinum')),

    -- Visual
    image_url TEXT,

    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'out_of_stock')),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_loyalty_rewards_program ON loyalty_rewards(program_id);
CREATE INDEX idx_loyalty_rewards_status ON loyalty_rewards(status);

-- Table: loyalty_redemptions
-- Redemption history
CREATE TABLE IF NOT EXISTS loyalty_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    balance_id UUID NOT NULL REFERENCES loyalty_balances(id) ON DELETE CASCADE,
    reward_id UUID REFERENCES loyalty_rewards(id) ON DELETE SET NULL,

    -- Redemption details
    points_spent NUMERIC(18,2) NOT NULL,
    reward_name TEXT NOT NULL,
    reward_type TEXT NOT NULL,

    -- Fulfillment
    fulfillment_status TEXT DEFAULT 'pending' CHECK (fulfillment_status IN ('pending', 'processing', 'completed', 'cancelled', 'refunded')),
    fulfilled_at TIMESTAMPTZ,

    -- Usage
    redemption_code TEXT, -- Generated code for discount/voucher
    used_at TIMESTAMPTZ,

    -- Link to transaction
    transaction_id UUID,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_loyalty_redemptions_balance ON loyalty_redemptions(balance_id);
CREATE INDEX idx_loyalty_redemptions_reward ON loyalty_redemptions(reward_id);
CREATE INDEX idx_loyalty_redemptions_status ON loyalty_redemptions(fulfillment_status);

-- Table: loyalty_campaigns
-- AI-driven loyalty campaigns
CREATE TABLE IF NOT EXISTS loyalty_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL,

    -- Campaign details
    name TEXT NOT NULL,
    description TEXT,
    campaign_type TEXT NOT NULL CHECK (campaign_type IN ('bonus_points', 'tier_upgrade', 'cashback_boost', 'double_points', 'referral', 'birthday', 'custom')),

    -- Targeting
    target_tier TEXT[], -- NULL = all tiers
    target_segment TEXT, -- high_value, at_risk, inactive, new, etc.
    min_lifetime_spend NUMERIC(12,2),
    max_lifetime_spend NUMERIC(12,2),

    -- Reward
    bonus_multiplier NUMERIC(8,4) DEFAULT 1.0, -- 2.0 = double points
    fixed_bonus NUMERIC(18,2), -- Fixed point bonus
    cashback_boost NUMERIC(8,4), -- Additional cashback %

    -- Duration
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,

    -- AI recommendations
    ai_generated BOOLEAN DEFAULT FALSE,
    ai_confidence_score NUMERIC(3,2),
    expected_participation_rate NUMERIC(5,2),
    expected_revenue_impact NUMERIC(12,2),

    -- Performance
    participants_count INTEGER DEFAULT 0,
    points_awarded NUMERIC(18,2) DEFAULT 0,
    revenue_generated NUMERIC(18,2) DEFAULT 0,

    -- Status
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'completed', 'paused')),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_loyalty_campaigns_program ON loyalty_campaigns(program_id);
CREATE INDEX idx_loyalty_campaigns_merchant ON loyalty_campaigns(merchant_id);
CREATE INDEX idx_loyalty_campaigns_status ON loyalty_campaigns(status);
CREATE INDEX idx_loyalty_campaigns_dates ON loyalty_campaigns(start_date, end_date);

-- Table: loyalty_campaign_participants
-- Track who participated in campaigns
CREATE TABLE IF NOT EXISTS loyalty_campaign_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES loyalty_campaigns(id) ON DELETE CASCADE,
    balance_id UUID NOT NULL REFERENCES loyalty_balances(id) ON DELETE CASCADE,

    -- Participation
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    points_earned NUMERIC(18,2) DEFAULT 0,
    transactions_count INTEGER DEFAULT 0,

    UNIQUE(campaign_id, balance_id)
);

CREATE INDEX idx_campaign_participants_campaign ON loyalty_campaign_participants(campaign_id);
CREATE INDEX idx_campaign_participants_balance ON loyalty_campaign_participants(balance_id);

-- Table: loyalty_rules
-- Custom earning/redemption rules (Ops control)
CREATE TABLE IF NOT EXISTS loyalty_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,

    -- Rule details
    rule_name TEXT NOT NULL,
    rule_type TEXT NOT NULL CHECK (rule_type IN ('earning', 'redemption', 'tier_upgrade', 'expiration')),

    -- Conditions (JSON-based for flexibility)
    conditions JSONB NOT NULL, -- {"product_category": "electronics", "min_amount": 100}

    -- Actions
    actions JSONB NOT NULL, -- {"multiply_points": 2, "add_bonus": 50}

    -- Priority
    priority INTEGER DEFAULT 100,

    -- Status
    enabled BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_loyalty_rules_program ON loyalty_rules(program_id);
CREATE INDEX idx_loyalty_rules_enabled ON loyalty_rules(enabled);
CREATE INDEX idx_loyalty_rules_priority ON loyalty_rules(priority);

-- Function: Calculate tier based on points and spend
CREATE OR REPLACE FUNCTION calculate_tier(
    p_program_id UUID,
    p_lifetime_points NUMERIC,
    p_lifetime_spend NUMERIC
) RETURNS TEXT AS $$
DECLARE
    v_thresholds JSONB;
    v_tier TEXT := 'basic';
BEGIN
    SELECT tier_thresholds INTO v_thresholds
    FROM loyalty_programs
    WHERE id = p_program_id;

    IF v_thresholds IS NULL THEN
        RETURN 'basic';
    END IF;

    -- Check Platinum
    IF p_lifetime_points >= (v_thresholds->'platinum'->>'points')::NUMERIC
       OR p_lifetime_spend >= (v_thresholds->'platinum'->>'spend')::NUMERIC THEN
        RETURN 'platinum';
    END IF;

    -- Check Gold
    IF p_lifetime_points >= (v_thresholds->'gold'->>'points')::NUMERIC
       OR p_lifetime_spend >= (v_thresholds->'gold'->>'spend')::NUMERIC THEN
        RETURN 'gold';
    END IF;

    -- Check Silver
    IF p_lifetime_points >= (v_thresholds->'silver'->>'points')::NUMERIC
       OR p_lifetime_spend >= (v_thresholds->'silver'->>'spend')::NUMERIC THEN
        RETURN 'silver';
    END IF;

    RETURN 'basic';
END;
$$ LANGUAGE plpgsql;

-- Function: Update tier automatically
CREATE OR REPLACE FUNCTION update_tier_on_transaction()
RETURNS TRIGGER AS $$
DECLARE
    v_balance RECORD;
    v_new_tier TEXT;
BEGIN
    -- Get current balance info
    SELECT * INTO v_balance
    FROM loyalty_balances
    WHERE id = NEW.balance_id;

    -- Calculate new tier
    v_new_tier := calculate_tier(
        v_balance.program_id,
        v_balance.lifetime_points_earned,
        v_balance.lifetime_spend
    );

    -- Update if tier changed
    IF v_new_tier != v_balance.current_tier THEN
        UPDATE loyalty_balances
        SET current_tier = v_new_tier,
            updated_at = NOW()
        WHERE id = v_balance.id;

        -- Log tier upgrade
        INSERT INTO loyalty_transactions (
            balance_id,
            txn_type,
            amount,
            description,
            created_at
        ) VALUES (
            v_balance.id,
            'adjust',
            0,
            'Tier upgraded to ' || v_new_tier,
            NOW()
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update tier on transaction
CREATE TRIGGER trigger_update_tier
    AFTER INSERT ON loyalty_transactions
    FOR EACH ROW
    WHEN (NEW.txn_type = 'earn')
    EXECUTE FUNCTION update_tier_on_transaction();

-- Function: Expire old points
CREATE OR REPLACE FUNCTION expire_old_points()
RETURNS INTEGER AS $$
DECLARE
    v_expired_count INTEGER := 0;
BEGIN
    -- Mark expired transactions
    UPDATE loyalty_transactions
    SET expired = TRUE
    WHERE expires_at IS NOT NULL
      AND expires_at < NOW()
      AND expired = FALSE
      AND txn_type = 'earn';

    GET DIAGNOSTICS v_expired_count = ROW_COUNT;

    -- Recalculate balances (deduct expired points)
    UPDATE loyalty_balances lb
    SET points_balance = (
        SELECT COALESCE(SUM(
            CASE
                WHEN lt.txn_type IN ('earn', 'bonus', 'referral', 'adjust') AND NOT lt.expired THEN lt.amount
                WHEN lt.txn_type IN ('redeem', 'expire') THEN -lt.amount
                ELSE 0
            END
        ), 0)
        FROM loyalty_transactions lt
        WHERE lt.balance_id = lb.id
    ),
    updated_at = NOW()
    WHERE id IN (
        SELECT DISTINCT balance_id
        FROM loyalty_transactions
        WHERE expired = TRUE
          AND expires_at >= NOW() - INTERVAL '1 hour'
    );

    RETURN v_expired_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_loyalty_programs_updated_at
    BEFORE UPDATE ON loyalty_programs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_loyalty_rewards_updated_at
    BEFORE UPDATE ON loyalty_rewards
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_loyalty_campaigns_updated_at
    BEFORE UPDATE ON loyalty_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE loyalty_programs IS 'Merchant-specific loyalty programs with AI optimization';
COMMENT ON TABLE loyalty_balances IS 'User point balances with tier tracking and AI insights';
COMMENT ON TABLE loyalty_transactions IS 'All point earning/redemption transactions with AI bonuses';
COMMENT ON TABLE loyalty_tiers IS 'Tier definitions and benefits (Basic, Silver, Gold, Platinum)';
COMMENT ON TABLE loyalty_rewards IS 'Redeemable rewards catalog';
COMMENT ON TABLE loyalty_redemptions IS 'Reward redemption history';
COMMENT ON TABLE loyalty_campaigns IS 'AI-driven loyalty campaigns';
COMMENT ON TABLE loyalty_rules IS 'Custom earning/redemption rules for Ops control';
