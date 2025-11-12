-- =====================================================
-- Sous-Brique 70quinquies — AI Campaign Generator
-- Migration: AI-generated marketing campaigns
-- =====================================================

-- Table: AI-generated marketing campaigns
CREATE TABLE IF NOT EXISTS ai_campaigns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

    channel         TEXT NOT NULL,
    -- email, sms, push, social_facebook, social_instagram, social_twitter, checkout_banner, in_app

    language        TEXT NOT NULL DEFAULT 'fr',
    -- fr, en, wo, ar, pt, etc.

    title           TEXT NOT NULL,
    -- Campaign title/subject line

    body            TEXT NOT NULL,
    -- Main campaign content

    call_to_action  TEXT,
    -- CTA text: "Acheter maintenant", "Profitez de l'offre", etc.

    content_data    JSONB,
    -- Additional content:
    -- {
    --   "slogan": "Qualité garantie",
    --   "images": ["url1", "url2"],
    --   "promo_code": "SIRA15",
    --   "discount": "15%"
    -- }

    audience        JSONB NOT NULL,
    -- Targeting criteria:
    -- {
    --   "segment": "vip" | "new_customers" | "inactive" | "all" | "churn_risk",
    --   "countries": ["SN", "CI", "FR"],
    --   "min_ltv": 10000,
    --   "max_churn_risk": 0.7,
    --   "purchase_frequency": "high"
    -- }

    estimated_reach INTEGER,
    -- Estimated audience size

    schedule        JSONB,
    -- Scheduling:
    -- {
    --   "start_date": "2025-01-20T10:00:00Z",
    --   "end_date": "2025-01-27T23:59:59Z",
    --   "send_time": "10:00",
    --   "timezone": "Africa/Dakar"
    -- }

    status          TEXT NOT NULL DEFAULT 'draft',
    -- draft, scheduled, running, paused, completed, cancelled

    performance     JSONB DEFAULT '{}',
    -- Performance metrics:
    -- {
    --   "sent": 1234,
    --   "delivered": 1200,
    --   "opened": 876,
    --   "clicked": 321,
    --   "converted": 45,
    --   "revenue": 125000,
    --   "open_rate": 73.0,
    --   "click_rate": 26.0,
    --   "conversion_rate": 3.6,
    --   "roi": 2.5
    -- }

    optimization_notes TEXT,
    -- SIRA optimization notes

    generated_by    TEXT DEFAULT 'sira_ai',
    -- sira_ai, user, hybrid

    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_campaigns_merchant ON ai_campaigns(merchant_id);
CREATE INDEX idx_ai_campaigns_status ON ai_campaigns(status);
CREATE INDEX idx_ai_campaigns_channel ON ai_campaigns(channel);
CREATE INDEX idx_ai_campaigns_created ON ai_campaigns(created_at DESC);

COMMENT ON TABLE ai_campaigns IS 'SIRA-generated marketing campaigns with multilingual and multichannel support';


-- Table: Campaign execution logs
CREATE TABLE IF NOT EXISTS ai_campaign_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     UUID NOT NULL REFERENCES ai_campaigns(id) ON DELETE CASCADE,

    event           TEXT NOT NULL,
    -- sent, delivered, opened, clicked, purchased, bounced, unsubscribed

    customer_id     UUID,
    -- Which customer (if applicable)

    metadata        JSONB,
    -- Event-specific data:
    -- {
    --   "email": "customer@example.com",
    --   "device": "mobile",
    --   "location": "Dakar",
    --   "order_id": "uuid",
    --   "revenue": 5000
    -- }

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_logs_campaign ON ai_campaign_logs(campaign_id);
CREATE INDEX idx_campaign_logs_event ON ai_campaign_logs(event);
CREATE INDEX idx_campaign_logs_customer ON ai_campaign_logs(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_campaign_logs_created ON ai_campaign_logs(created_at DESC);

COMMENT ON TABLE ai_campaign_logs IS 'Execution logs and event tracking for AI campaigns';


-- Table: Campaign templates (for content generation)
CREATE TABLE IF NOT EXISTS ai_campaign_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    template_type   TEXT NOT NULL,
    -- welcome, abandoned_cart, reactivation, promotion, loyalty, seasonal

    language        TEXT NOT NULL,

    channel         TEXT NOT NULL,

    title_template  TEXT NOT NULL,
    -- Template with variables: "{{merchant_name}} vous offre {{discount}}% de réduction!"

    body_template   TEXT NOT NULL,

    variables       TEXT[],
    -- ["merchant_name", "discount", "product_name", "customer_name"]

    performance_score NUMERIC(3,2) DEFAULT 0,
    -- Historical performance 0-1

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_templates_type_lang ON ai_campaign_templates(template_type, language);
CREATE INDEX idx_templates_channel ON ai_campaign_templates(channel);

COMMENT ON TABLE ai_campaign_templates IS 'Reusable campaign templates for content generation';


-- Table: Audience segments (pre-computed for performance)
CREATE TABLE IF NOT EXISTS ai_audience_segments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

    segment_name    TEXT NOT NULL,
    -- vip, high_value, new_customers, inactive_30d, churn_risk_high, frequent_buyers

    segment_criteria JSONB NOT NULL,
    -- Criteria used to define this segment

    customer_count  INTEGER NOT NULL,
    -- Number of customers in this segment

    avg_ltv         NUMERIC(12,2),
    -- Average lifetime value

    avg_order_frequency NUMERIC(5,2),
    -- Average orders per month

    last_computed   TIMESTAMPTZ NOT NULL DEFAULT now(),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_segments_merchant ON ai_audience_segments(merchant_id);
CREATE INDEX idx_segments_name ON ai_audience_segments(segment_name);
CREATE UNIQUE INDEX idx_segments_merchant_name ON ai_audience_segments(merchant_id, segment_name);

COMMENT ON TABLE ai_audience_segments IS 'Pre-computed audience segments for campaign targeting';


-- Update trigger
CREATE OR REPLACE FUNCTION update_ai_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_campaigns_updated_at
    BEFORE UPDATE ON ai_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_campaigns_updated_at();
