-- =====================================================
-- Sous-Brique 70bis — AI Smart Marketing (SIRA-powered)
-- Migration: AI recommendations and A/B testing tables
-- =====================================================

-- Table: AI-generated marketing recommendations
CREATE TABLE IF NOT EXISTS marketing_ai_recommendations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    recommendation  JSONB NOT NULL,
    -- Structure of recommendation JSONB:
    -- {
    --   "type": "promo_code" | "coupon" | "subscription_plan" | "campaign",
    --   "discount_type": "percentage" | "fixed" | "free_shipping",
    --   "discount_value": number,
    --   "target": "abandoned_carts" | "inactive_customers" | "loyal_customers" | "new_customers",
    --   "message": "Human-readable description",
    --   "reasoning": "Why SIRA suggests this",
    --   "expected_impact": {"conversion_uplift": 12.5, "revenue_impact": 5000},
    --   "duration_days": number,
    --   "conditions": {...}
    -- }

    status          TEXT NOT NULL DEFAULT 'suggested',
    -- suggested: AI has generated, awaiting review
    -- applied: Merchant/Ops has accepted and applied
    -- dismissed: Rejected by merchant/ops
    -- auto_applied: Automatically applied by SIRA
    -- expired: Recommendation no longer relevant

    confidence      NUMERIC(5,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
    -- SIRA confidence score 0-100

    data_points     JSONB,
    -- Supporting data used to generate recommendation:
    -- {
    --   "abandoned_cart_rate": 0.35,
    --   "avg_order_value": 125.50,
    --   "customer_lifetime_value": 450.00,
    --   "churn_rate": 0.15,
    --   "market_benchmark": {...}
    -- }

    generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_by      UUID REFERENCES users(id),
    applied_at      TIMESTAMPTZ,
    dismissed_by    UUID REFERENCES users(id),
    dismissed_at    TIMESTAMPTZ,
    dismissal_reason TEXT,

    -- If applied, links to created entities
    created_campaign_id UUID REFERENCES marketing_campaigns(id),
    created_promo_code_id UUID REFERENCES promo_codes(id),
    created_coupon_id UUID REFERENCES coupons(id),
    created_plan_id UUID REFERENCES subscription_plans(id),

    -- Performance tracking
    actual_impact   JSONB,
    -- After application, track real performance:
    -- {
    --   "conversions": 45,
    --   "revenue": 5234.50,
    --   "roi": 2.34,
    --   "vs_predicted": {"conversion": 1.12, "revenue": 0.98}
    -- }

    expires_at      TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_recs_merchant ON marketing_ai_recommendations(merchant_id);
CREATE INDEX idx_ai_recs_status ON marketing_ai_recommendations(status);
CREATE INDEX idx_ai_recs_generated ON marketing_ai_recommendations(generated_at DESC);
CREATE INDEX idx_ai_recs_confidence ON marketing_ai_recommendations(confidence DESC);

COMMENT ON TABLE marketing_ai_recommendations IS 'SIRA-generated marketing recommendations with confidence scores and performance tracking';


-- Table: A/B Testing experiments
CREATE TABLE IF NOT EXISTS marketing_ab_tests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    campaign_id     UUID REFERENCES marketing_campaigns(id),

    name            TEXT NOT NULL,
    description     TEXT,

    variant_a       JSONB NOT NULL,
    -- Complete configuration for variant A:
    -- {
    --   "name": "Control - 10% discount",
    --   "promo_code": {...config},
    --   "message": "Save 10%",
    --   "design": {...}
    -- }

    variant_b       JSONB NOT NULL,
    -- Complete configuration for variant B:
    -- {
    --   "name": "Test - 15% discount with urgency",
    --   "promo_code": {...config},
    --   "message": "Save 15% - Limited Time!",
    --   "design": {...}
    -- }

    variant_c       JSONB,
    -- Optional third variant

    traffic_split   JSONB NOT NULL DEFAULT '{"a": 50, "b": 50}',
    -- Traffic allocation percentages: {"a": 50, "b": 50} or {"a": 33, "b": 33, "c": 34}

    start_date      TIMESTAMPTZ NOT NULL,
    end_date        TIMESTAMPTZ,

    status          TEXT NOT NULL DEFAULT 'draft',
    -- draft: Created but not started
    -- running: Currently active
    -- paused: Temporarily stopped
    -- completed: Finished and analyzed
    -- auto_stopped: SIRA stopped due to clear winner

    -- Results tracking
    metrics_a       JSONB DEFAULT '{}',
    -- {"impressions": 1000, "clicks": 120, "conversions": 45, "revenue": 2250.50, "ctr": 12.0, "cvr": 37.5}

    metrics_b       JSONB DEFAULT '{}',
    metrics_c       JSONB DEFAULT '{}',

    result          JSONB,
    -- Final analysis:
    -- {
    --   "winner": "variant_b",
    --   "confidence": 95.5,
    --   "uplift": 12.5,
    --   "statistical_significance": true,
    --   "recommendation": "Deploy variant B permanently",
    --   "insights": "Urgency messaging increased conversions by 12.5%"
    -- }

    auto_deploy_winner BOOLEAN DEFAULT false,
    -- If true, SIRA automatically deploys winning variant

    deployed_variant TEXT,
    -- Which variant was deployed: "variant_a", "variant_b", "variant_c"

    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ab_tests_merchant ON marketing_ab_tests(merchant_id);
CREATE INDEX idx_ab_tests_campaign ON marketing_ab_tests(campaign_id);
CREATE INDEX idx_ab_tests_status ON marketing_ab_tests(status);
CREATE INDEX idx_ab_tests_dates ON marketing_ab_tests(start_date, end_date);

COMMENT ON TABLE marketing_ab_tests IS 'A/B testing experiments with automatic winner selection and deployment';


-- Table: SIRA market benchmarks and insights
CREATE TABLE IF NOT EXISTS marketing_benchmarks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

    industry        TEXT NOT NULL,
    -- e.g., "e-commerce", "saas", "fintech", "marketplace"

    country         TEXT NOT NULL,
    -- ISO country code

    benchmark_data  JSONB NOT NULL,
    -- Market intelligence from SIRA profiling:
    -- {
    --   "avg_discount_rate": 15.5,
    --   "most_common_promo_type": "percentage",
    --   "seasonal_patterns": {...},
    --   "competitor_offers": [
    --     {"competitor": "anonymous_1", "offer": "20% off annual", "engagement": "high"},
    --     {"competitor": "anonymous_2", "offer": "15% + free shipping", "engagement": "medium"}
    --   ],
    --   "churn_benchmarks": {"low": 5, "avg": 12, "high": 25},
    --   "ltv_benchmarks": {"low": 150, "avg": 450, "high": 1200}
    -- }

    merchant_comparison JSONB,
    -- How merchant compares to market:
    -- {
    --   "discount_rate": {"merchant": 10, "market": 15.5, "position": "below_market"},
    --   "churn": {"merchant": 8, "market": 12, "position": "better"},
    --   "ltv": {"merchant": 520, "market": 450, "position": "better"}
    -- }

    recommendations JSONB,
    -- Strategic recommendations based on benchmarking:
    -- [
    --   {"action": "increase_discount", "from": 10, "to": 15, "reason": "Market competitive pressure"},
    --   {"action": "add_free_shipping", "reason": "60% of competitors offer it"}
    -- ]

    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    -- Benchmarks refresh weekly

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_benchmarks_merchant ON marketing_benchmarks(merchant_id);
CREATE INDEX idx_benchmarks_industry ON marketing_benchmarks(industry);
CREATE INDEX idx_benchmarks_country ON marketing_benchmarks(country);
CREATE INDEX idx_benchmarks_expires ON marketing_benchmarks(expires_at);

COMMENT ON TABLE marketing_benchmarks IS 'SIRA-powered market benchmarking and competitive intelligence';


-- Table: Marketing anomaly detection logs
CREATE TABLE IF NOT EXISTS marketing_anomalies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

    anomaly_type    TEXT NOT NULL,
    -- suspicious_usage: Promo code abuse
    -- sudden_spike: Unexpected usage surge
    -- low_performance: Campaign underperforming expectations
    -- fraud_pattern: Potential fraudulent activity
    -- market_shift: Significant market change detected

    severity        TEXT NOT NULL,
    -- low, medium, high, critical

    entity_type     TEXT,
    -- promo_code, campaign, subscription, customer

    entity_id       UUID,
    -- ID of affected entity

    description     TEXT NOT NULL,
    -- Human-readable description

    details         JSONB NOT NULL,
    -- Detailed anomaly data:
    -- {
    --   "expected_range": [10, 50],
    --   "actual_value": 250,
    --   "deviation": 5.0,
    --   "contributing_factors": [...],
    --   "affected_customers": [...]
    -- }

    suggested_action TEXT,
    -- What SIRA recommends to do

    status          TEXT NOT NULL DEFAULT 'detected',
    -- detected: Found but not reviewed
    -- investigating: Under review
    -- resolved: Issue resolved
    -- false_positive: Not actually an issue

    resolved_by     UUID REFERENCES users(id),
    resolved_at     TIMESTAMPTZ,
    resolution_notes TEXT,

    detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_anomalies_merchant ON marketing_anomalies(merchant_id);
CREATE INDEX idx_anomalies_type ON marketing_anomalies(anomaly_type);
CREATE INDEX idx_anomalies_severity ON marketing_anomalies(severity);
CREATE INDEX idx_anomalies_status ON marketing_anomalies(status);
CREATE INDEX idx_anomalies_detected ON marketing_anomalies(detected_at DESC);

COMMENT ON TABLE marketing_anomalies IS 'SIRA-detected anomalies in marketing campaigns and promo usage';


-- Table: Auto-tuning history
CREATE TABLE IF NOT EXISTS marketing_auto_tuning (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

    entity_type     TEXT NOT NULL,
    -- campaign, promo_code, subscription_plan

    entity_id       UUID NOT NULL,

    adjustment_type TEXT NOT NULL,
    -- extend_duration, increase_discount, decrease_discount, pause, resume, target_adjustment

    previous_config JSONB NOT NULL,
    -- Configuration before adjustment

    new_config      JSONB NOT NULL,
    -- Configuration after adjustment

    reason          TEXT NOT NULL,
    -- Why SIRA made this adjustment

    performance_before JSONB,
    -- Metrics before tuning

    performance_after JSONB,
    -- Metrics after tuning (tracked over time)

    impact          JSONB,
    -- Measured impact:
    -- {
    --   "conversion_change": 8.5,
    --   "revenue_change": 1250.00,
    --   "roi_change": 0.34
    -- }

    applied_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auto_tuning_merchant ON marketing_auto_tuning(merchant_id);
CREATE INDEX idx_auto_tuning_entity ON marketing_auto_tuning(entity_type, entity_id);
CREATE INDEX idx_auto_tuning_applied ON marketing_auto_tuning(applied_at DESC);

COMMENT ON TABLE marketing_auto_tuning IS 'History of SIRA automatic campaign optimizations';


-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_marketing_ai_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marketing_ai_recommendations_updated_at
    BEFORE UPDATE ON marketing_ai_recommendations
    FOR EACH ROW
    EXECUTE FUNCTION update_marketing_ai_updated_at();

CREATE TRIGGER marketing_ab_tests_updated_at
    BEFORE UPDATE ON marketing_ab_tests
    FOR EACH ROW
    EXECUTE FUNCTION update_marketing_ai_updated_at();
