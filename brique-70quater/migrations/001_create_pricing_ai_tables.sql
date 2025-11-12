-- =====================================================
-- Sous-Brique 70quater — Predictive Pricing Engine (IA)
-- Migration: AI pricing recommendations and results
-- =====================================================

-- Table: AI pricing recommendations per product
CREATE TABLE IF NOT EXISTS pricing_ai_recommendations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    current_price   NUMERIC(12,2) NOT NULL,
    -- Current selling price

    suggested_price NUMERIC(12,2) NOT NULL,
    -- AI-recommended optimal price

    price_change    NUMERIC(12,2) NOT NULL,
    -- Difference: suggested_price - current_price

    price_change_pct NUMERIC(5,2) NOT NULL,
    -- Percentage change: (suggested - current) / current * 100

    confidence      NUMERIC(5,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    -- AI confidence score 0-1

    reason          TEXT NOT NULL,
    -- Human-readable explanation:
    -- "Seasonal demand increase (+35%)"
    -- "Competitor pricing analysis"
    -- "Low stock → price surge opportunity"
    -- "Churn risk mitigation"

    reasoning_data  JSONB,
    -- Detailed reasoning:
    -- {
    --   "factors": [
    --     {"type": "seasonality", "weight": 0.4, "impact": "+15%"},
    --     {"type": "demand", "weight": 0.3, "impact": "+10%"},
    --     {"type": "competition", "weight": 0.3, "impact": "-5%"}
    --   ],
    --   "historical_data": {...},
    --   "market_conditions": {...}
    -- }

    predicted_impact JSONB NOT NULL,
    -- Expected business impact:
    -- {
    --   "revenue_uplift_pct": 12.5,
    --   "revenue_uplift_amount": 5234.50,
    --   "volume_change_pct": -3.2,
    --   "churn_risk_pct": 1.5,
    --   "margin_improvement_pct": 8.3
    -- }

    zone            TEXT,
    -- Geographic zone if applicable (e.g., "CEDEAO", "EU", "US")

    time_window     JSONB,
    -- Time-based pricing (happy hours, peak hours):
    -- {"start": "18:00", "end": "22:00", "days": ["friday", "saturday"]}

    status          TEXT NOT NULL DEFAULT 'pending',
    -- pending: Generated, awaiting review
    -- accepted: Merchant accepted
    -- rejected: Merchant rejected
    -- applied: Price updated in system
    -- expired: No longer relevant

    expires_at      TIMESTAMPTZ,
    -- Recommendation validity period

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pricing_recs_merchant ON pricing_ai_recommendations(merchant_id);
CREATE INDEX idx_pricing_recs_product ON pricing_ai_recommendations(product_id);
CREATE INDEX idx_pricing_recs_status ON pricing_ai_recommendations(status);
CREATE INDEX idx_pricing_recs_created ON pricing_ai_recommendations(created_at DESC);
CREATE INDEX idx_pricing_recs_expires ON pricing_ai_recommendations(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE pricing_ai_recommendations IS 'AI-generated dynamic pricing recommendations with impact predictions';


-- Table: Results tracking for applied pricing recommendations
CREATE TABLE IF NOT EXISTS pricing_ai_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID NOT NULL REFERENCES pricing_ai_recommendations(id) ON DELETE CASCADE,

    accepted        BOOLEAN NOT NULL,
    -- Did merchant accept the recommendation?

    applied_price   NUMERIC(12,2),
    -- Actual price applied (might differ from suggestion)

    -- Actual measured impact (after applying for period)
    actual_impact   JSONB,
    -- {
    --   "revenue_uplift_pct": 11.8,
    --   "revenue_uplift_amount": 4892.30,
    --   "volume_change_pct": -2.8,
    --   "churn_observed_pct": 1.2,
    --   "margin_improvement_pct": 7.9
    -- }

    measurement_period JSONB,
    -- {"start": "2025-01-10", "end": "2025-01-17", "days": 7}

    accuracy        NUMERIC(5,2),
    -- How accurate was the prediction?
    -- accuracy = 1 - abs(predicted_uplift - actual_uplift) / predicted_uplift

    applied_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    measured_at     TIMESTAMPTZ,
    -- When was the actual impact measured?

    notes           TEXT,
    -- Merchant or system notes

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pricing_results_reco ON pricing_ai_results(recommendation_id);
CREATE INDEX idx_pricing_results_applied ON pricing_ai_results(applied_at DESC);
CREATE INDEX idx_pricing_results_measured ON pricing_ai_results(measured_at) WHERE measured_at IS NOT NULL;

COMMENT ON TABLE pricing_ai_results IS 'Performance tracking of applied pricing recommendations';


-- Table: Price elasticity data per product
CREATE TABLE IF NOT EXISTS pricing_elasticity (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    elasticity_coefficient NUMERIC(5,2) NOT NULL,
    -- Price elasticity of demand: % change in quantity / % change in price
    -- < -1: Elastic (demand very sensitive to price)
    -- -1 to 0: Inelastic (demand not very sensitive)
    -- Example: -1.5 means 10% price increase → 15% demand decrease

    optimal_price_range JSONB NOT NULL,
    -- {"min": 95.00, "optimal": 120.00, "max": 150.00}

    calculated_from JSONB NOT NULL,
    -- Data sources used:
    -- {
    --   "sales_records": 450,
    --   "date_range": {"start": "2024-10-01", "end": "2025-01-15"},
    --   "price_points_tested": 8
    -- }

    confidence      NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    -- Statistical confidence in elasticity estimate

    last_updated    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_elasticity_merchant ON pricing_elasticity(merchant_id);
CREATE INDEX idx_elasticity_product ON pricing_elasticity(product_id);
CREATE UNIQUE INDEX idx_elasticity_merchant_product ON pricing_elasticity(merchant_id, product_id);

COMMENT ON TABLE pricing_elasticity IS 'Price elasticity of demand per product for optimization';


-- Table: Competitor pricing intelligence
CREATE TABLE IF NOT EXISTS pricing_competitor_data (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

    product_category TEXT NOT NULL,
    -- Category being tracked (e.g., "electronics", "fashion", "food")

    competitor_id   TEXT,
    -- Anonymous competitor ID

    competitor_price NUMERIC(12,2) NOT NULL,

    competitor_features JSONB,
    -- {
    --   "shipping": "free",
    --   "delivery_time": "24h",
    --   "warranty": "2 years",
    --   "promotion": "15% off"
    -- }

    market_position TEXT,
    -- premium, mid-range, budget

    data_source     TEXT NOT NULL,
    -- crawler, api, manual, benchmark

    zone            TEXT,
    -- Geographic zone

    collected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE INDEX idx_competitor_merchant ON pricing_competitor_data(merchant_id);
CREATE INDEX idx_competitor_category ON pricing_competitor_data(product_category);
CREATE INDEX idx_competitor_collected ON pricing_competitor_data(collected_at DESC);
CREATE INDEX idx_competitor_expires ON pricing_competitor_data(expires_at);

COMMENT ON TABLE pricing_competitor_data IS 'Competitive pricing intelligence for benchmarking';


-- Table: Dynamic pricing rules (happy hours, peak pricing)
CREATE TABLE IF NOT EXISTS pricing_dynamic_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

    rule_name       TEXT NOT NULL,
    rule_type       TEXT NOT NULL,
    -- happy_hour, peak_pricing, flash_sale, inventory_clearance, demand_surge

    target          JSONB NOT NULL,
    -- What to apply to:
    -- {"products": ["uuid1", "uuid2"], "categories": ["electronics"], "all": false}

    price_adjustment JSONB NOT NULL,
    -- {"type": "percentage", "value": -15} → -15% discount
    -- {"type": "fixed", "value": -500} → 500 FCFA off

    schedule        JSONB NOT NULL,
    -- When to apply:
    -- {
    --   "days": ["monday", "friday"],
    --   "start_time": "18:00",
    --   "end_time": "22:00",
    --   "timezone": "Africa/Dakar"
    -- }

    conditions      JSONB,
    -- Additional conditions:
    -- {
    --   "min_stock": 10,
    --   "max_orders_per_hour": 5,
    --   "customer_segment": "premium"
    -- }

    status          TEXT NOT NULL DEFAULT 'active',
    -- active, paused, expired

    priority        INTEGER DEFAULT 5,
    -- 1 (highest) to 10 (lowest) for conflicting rules

    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dynamic_rules_merchant ON pricing_dynamic_rules(merchant_id);
CREATE INDEX idx_dynamic_rules_status ON pricing_dynamic_rules(status);
CREATE INDEX idx_dynamic_rules_type ON pricing_dynamic_rules(rule_type);

COMMENT ON TABLE pricing_dynamic_rules IS 'Dynamic pricing rules for time-based and condition-based adjustments';


-- Update trigger
CREATE OR REPLACE FUNCTION update_pricing_ai_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pricing_ai_recommendations_updated_at
    BEFORE UPDATE ON pricing_ai_recommendations
    FOR EACH ROW
    EXECUTE FUNCTION update_pricing_ai_updated_at();

CREATE TRIGGER pricing_dynamic_rules_updated_at
    BEFORE UPDATE ON pricing_dynamic_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_pricing_ai_updated_at();
