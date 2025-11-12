-- Brique 70 - Marketing Tools
-- Migration 001: Marketing campaigns, promo codes, coupons, subscriptions

-- ============================================================================
-- 1. Marketing Campaigns Table (parent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS marketing_campaigns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    type            TEXT NOT NULL CHECK (type IN ('promo_code', 'coupon', 'subscription_plan')),
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'expired', 'archived')),

    -- Targeting & rules
    min_purchase_amount NUMERIC(12,2),
    max_discount_amount NUMERIC(12,2),
    applicable_products TEXT[], -- Product IDs
    applicable_categories TEXT[],
    excluded_products TEXT[],

    -- Usage limits
    total_usage_limit   INT,
    total_usage_count   INT NOT NULL DEFAULT 0,
    per_user_limit      INT,

    -- Dates
    starts_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at         TIMESTAMPTZ,

    -- Metadata
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_dates CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_merchant ON marketing_campaigns(merchant_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status ON marketing_campaigns(status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_type ON marketing_campaigns(type);

COMMENT ON TABLE marketing_campaigns IS 'Marketing campaigns - parent table for promos, coupons, subscriptions';

-- ============================================================================
-- 2. Promo Codes Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS promo_codes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     UUID NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,

    -- Code details
    code            TEXT NOT NULL UNIQUE,
    discount_type   TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed', 'free_shipping')),
    discount_value  NUMERIC(10,2) NOT NULL,
    currency        TEXT, -- Required for 'fixed' type

    -- Usage limits (can override campaign limits)
    usage_limit     INT,
    used_count      INT NOT NULL DEFAULT 0,
    per_user_limit  INT,

    -- Validity period (can be more restrictive than campaign)
    valid_from      TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_to        TIMESTAMPTZ,

    -- Status
    is_active       BOOLEAN NOT NULL DEFAULT true,

    -- Metadata
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT chk_promo_dates CHECK (valid_to IS NULL OR valid_to > valid_from),
    CONSTRAINT chk_promo_value CHECK (discount_value >= 0),
    CONSTRAINT chk_percentage_value CHECK (
        discount_type != 'percentage' OR (discount_value >= 0 AND discount_value <= 100)
    )
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_campaign ON promo_codes(campaign_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(UPPER(code)); -- Case-insensitive lookup
CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes(is_active, valid_from, valid_to);

COMMENT ON TABLE promo_codes IS 'Promotional codes with usage limits and expiration';

-- ============================================================================
-- 3. Coupons Table (for recurring discounts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS coupons (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     UUID NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,

    -- Coupon details
    name            TEXT NOT NULL,
    code            TEXT UNIQUE, -- Optional: can be system-assigned to customers
    discount_type   TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value  NUMERIC(10,2) NOT NULL,
    currency        TEXT,

    -- Duration
    duration        TEXT NOT NULL CHECK (duration IN ('once', 'repeating', 'forever')),
    duration_months INT, -- For 'repeating' type

    -- Applicability
    applies_to      TEXT DEFAULT 'all' CHECK (applies_to IN ('all', 'specific_products', 'specific_plans')),
    product_ids     TEXT[],

    -- Status
    is_active       BOOLEAN NOT NULL DEFAULT true,

    -- Metadata
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT chk_coupon_duration CHECK (
        duration != 'repeating' OR duration_months IS NOT NULL
    ),
    CONSTRAINT chk_coupon_value CHECK (discount_value >= 0),
    CONSTRAINT chk_coupon_percentage CHECK (
        discount_type != 'percentage' OR (discount_value >= 0 AND discount_value <= 100)
    )
);

CREATE INDEX IF NOT EXISTS idx_coupons_campaign ON coupons(campaign_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active);

COMMENT ON TABLE coupons IS 'Coupons for recurring discounts on subscriptions or products';

-- ============================================================================
-- 4. Subscription Plans Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
    merchant_id     UUID NOT NULL,

    -- Plan details
    name            TEXT NOT NULL,
    description     TEXT,
    product_id      TEXT, -- Optional: link to specific product

    -- Pricing
    amount          NUMERIC(12,2) NOT NULL,
    currency        TEXT NOT NULL,

    -- Billing interval
    interval        TEXT NOT NULL CHECK (interval IN ('day', 'week', 'month', 'year')),
    interval_count  INT NOT NULL DEFAULT 1, -- e.g., 2 = bi-weekly if interval='week'

    -- Trial
    trial_period_days INT DEFAULT 0,

    -- Features
    features        JSONB, -- { "storage": "100GB", "users": 5, ... }
    metadata        JSONB,

    -- Status
    is_active       BOOLEAN NOT NULL DEFAULT true,

    -- Metadata
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT chk_plan_amount CHECK (amount >= 0),
    CONSTRAINT chk_plan_interval_count CHECK (interval_count > 0),
    CONSTRAINT chk_plan_trial CHECK (trial_period_days >= 0)
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_merchant ON subscription_plans(merchant_id);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_campaign ON subscription_plans(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active);

COMMENT ON TABLE subscription_plans IS 'Recurring subscription plans (monthly, yearly, etc.)';

-- ============================================================================
-- 5. Customer Subscriptions Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id         UUID NOT NULL REFERENCES subscription_plans(id),
    customer_id     UUID NOT NULL,
    merchant_id     UUID NOT NULL,

    -- Status
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'trialing', 'active', 'past_due', 'paused', 'canceled', 'unpaid'
    )),

    -- Billing periods
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end   TIMESTAMPTZ NOT NULL,

    -- Trial
    trial_start     TIMESTAMPTZ,
    trial_end       TIMESTAMPTZ,

    -- Cancellation
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    canceled_at     TIMESTAMPTZ,
    cancellation_reason TEXT,

    -- Payment
    latest_invoice_id UUID,
    default_payment_method_id UUID,

    -- Coupon
    coupon_id       UUID REFERENCES coupons(id) ON DELETE SET NULL,
    discount_end_at TIMESTAMPTZ, -- When coupon discount expires

    -- Metadata
    metadata        JSONB,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT chk_subscription_periods CHECK (current_period_end > current_period_start),
    CONSTRAINT chk_trial_periods CHECK (
        trial_start IS NULL OR trial_end IS NULL OR trial_end > trial_start
    )
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_merchant ON subscriptions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_renewal ON subscriptions(current_period_end) WHERE status IN ('active', 'trialing');

COMMENT ON TABLE subscriptions IS 'Customer subscriptions to recurring plans';

-- ============================================================================
-- 6. Promo Code Usage Log (for audit and fraud detection)
-- ============================================================================
CREATE TABLE IF NOT EXISTS promo_code_usage (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promo_code_id   UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
    customer_id     UUID NOT NULL,
    order_id        UUID,

    -- Discount applied
    original_amount NUMERIC(12,2) NOT NULL,
    discount_amount NUMERIC(12,2) NOT NULL,
    final_amount    NUMERIC(12,2) NOT NULL,
    currency        TEXT NOT NULL,

    -- Context
    ip_address      INET,
    user_agent      TEXT,

    -- Status
    status          TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'refunded', 'expired')),

    -- Metadata
    created_at      TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT chk_usage_amounts CHECK (
        discount_amount >= 0 AND
        final_amount >= 0 AND
        original_amount >= discount_amount
    )
);

CREATE INDEX IF NOT EXISTS idx_promo_usage_code ON promo_code_usage(promo_code_id);
CREATE INDEX IF NOT EXISTS idx_promo_usage_customer ON promo_code_usage(customer_id);
CREATE INDEX IF NOT EXISTS idx_promo_usage_order ON promo_code_usage(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_promo_usage_created ON promo_code_usage(created_at DESC);

COMMENT ON TABLE promo_code_usage IS 'Audit log of promo code usage for fraud detection';

-- ============================================================================
-- 7. Subscription Invoices Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS subscription_invoices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    customer_id     UUID NOT NULL,

    -- Invoice details
    amount          NUMERIC(12,2) NOT NULL,
    currency        TEXT NOT NULL,
    discount_amount NUMERIC(12,2) DEFAULT 0,
    tax_amount      NUMERIC(12,2) DEFAULT 0,
    total_amount    NUMERIC(12,2) NOT NULL,

    -- Period
    period_start    TIMESTAMPTZ NOT NULL,
    period_end      TIMESTAMPTZ NOT NULL,

    -- Status
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'open', 'paid', 'void', 'uncollectible'
    )),

    -- Payment
    payment_intent_id UUID,
    paid_at         TIMESTAMPTZ,

    -- Attempts
    attempt_count   INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ,

    -- Metadata
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_invoices_subscription ON subscription_invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_customer ON subscription_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_status ON subscription_invoices(status);
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_retry ON subscription_invoices(next_attempt_at) WHERE status = 'open' AND next_attempt_at IS NOT NULL;

COMMENT ON TABLE subscription_invoices IS 'Invoices generated for subscription billing';

-- ============================================================================
-- 8. Update Triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_marketing_campaigns_updated_at BEFORE UPDATE ON marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_promo_codes_updated_at BEFORE UPDATE ON promo_codes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_coupons_updated_at BEFORE UPDATE ON coupons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_invoices_updated_at BEFORE UPDATE ON subscription_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 9. Helper Functions
-- ============================================================================

-- Check if promo code is valid
CREATE OR REPLACE FUNCTION is_promo_code_valid(p_code TEXT, p_customer_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
    v_promo RECORD;
    v_customer_usage INT;
BEGIN
    -- Fetch promo code
    SELECT pc.*, mc.status as campaign_status, mc.ends_at as campaign_ends_at
    INTO v_promo
    FROM promo_codes pc
    JOIN marketing_campaigns mc ON mc.id = pc.campaign_id
    WHERE UPPER(pc.code) = UPPER(p_code)
    AND pc.is_active = true;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- Check campaign status
    IF v_promo.campaign_status != 'active' THEN
        RETURN false;
    END IF;

    -- Check dates
    IF v_promo.valid_from > now() OR (v_promo.valid_to IS NOT NULL AND v_promo.valid_to < now()) THEN
        RETURN false;
    END IF;

    IF v_promo.campaign_ends_at IS NOT NULL AND v_promo.campaign_ends_at < now() THEN
        RETURN false;
    END IF;

    -- Check total usage limit
    IF v_promo.usage_limit IS NOT NULL AND v_promo.used_count >= v_promo.usage_limit THEN
        RETURN false;
    END IF;

    -- Check per-user limit
    IF p_customer_id IS NOT NULL AND v_promo.per_user_limit IS NOT NULL THEN
        SELECT COUNT(*) INTO v_customer_usage
        FROM promo_code_usage
        WHERE promo_code_id = v_promo.id AND customer_id = p_customer_id;

        IF v_customer_usage >= v_promo.per_user_limit THEN
            RETURN false;
        END IF;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Migration Complete
-- ============================================================================
