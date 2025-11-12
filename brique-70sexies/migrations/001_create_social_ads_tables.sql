/**
 * Brique 70sexies - AI Social Ads Generator (Sira Social Engine)
 * Database Schema for Multi-Platform Social Media Advertising
 *
 * Platforms: Facebook, Instagram, TikTok, LinkedIn, Twitter/X
 */

-- Table: ai_social_ads
-- Main table for social media ad campaigns
CREATE TABLE IF NOT EXISTS ai_social_ads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL,

    -- Platform configuration
    platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'tiktok', 'linkedin', 'twitter')),
    campaign_name TEXT NOT NULL,
    objective TEXT NOT NULL, -- awareness, traffic, engagement, conversions, app_installs, video_views

    -- Ad content
    title TEXT NOT NULL,
    copy_text TEXT NOT NULL,
    cta_button TEXT, -- shop_now, learn_more, sign_up, download, contact_us
    media_url TEXT, -- URL to generated image/video (S3/Minio)
    media_type TEXT CHECK (media_type IN ('image', 'video', 'carousel')),

    -- Targeting
    targeting JSONB NOT NULL DEFAULT '{}', -- {countries, cities, age_min, age_max, gender, interests, behaviors}
    audience_size_estimate INTEGER,

    -- Budget & Scheduling
    budget NUMERIC(12,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    budget_type TEXT DEFAULT 'daily' CHECK (budget_type IN ('daily', 'lifetime')),
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,

    -- Performance metrics
    performance JSONB DEFAULT '{}', -- {impressions, clicks, ctr, conversions, revenue, cost_per_click, cost_per_conversion, roas}

    -- Status & Metadata
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'running', 'paused', 'completed', 'rejected')),
    ai_confidence_score NUMERIC(3,2), -- 0.00 to 1.00
    generated_by TEXT DEFAULT 'sira_ai',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_social_ads_merchant ON ai_social_ads(merchant_id);
CREATE INDEX idx_social_ads_platform ON ai_social_ads(platform);
CREATE INDEX idx_social_ads_status ON ai_social_ads(status);
CREATE INDEX idx_social_ads_created ON ai_social_ads(created_at DESC);

-- Table: ai_social_ad_creatives
-- Generated visual assets for ads
CREATE TABLE IF NOT EXISTS ai_social_ad_creatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_id UUID NOT NULL REFERENCES ai_social_ads(id) ON DELETE CASCADE,

    -- Creative details
    creative_type TEXT NOT NULL CHECK (creative_type IN ('image', 'video', 'carousel_item')),
    url TEXT NOT NULL, -- S3/Minio URL
    thumbnail_url TEXT,

    -- Dimensions & Specs
    width INTEGER,
    height INTEGER,
    duration_seconds INTEGER, -- for videos
    file_size_bytes BIGINT,
    format TEXT, -- jpg, png, mp4, etc.

    -- AI Generation metadata
    generation_prompt TEXT,
    generation_model TEXT, -- dalle-3, midjourney, stable-diffusion
    generation_params JSONB,

    -- Performance
    performance_score NUMERIC(3,2), -- 0.00 to 1.00 (how well this creative performs)

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_creatives_ad ON ai_social_ad_creatives(ad_id);

-- Table: ai_social_ad_audiences
-- Pre-defined and custom audience segments
CREATE TABLE IF NOT EXISTS ai_social_ad_audiences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL,

    -- Audience definition
    name TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'tiktok', 'linkedin', 'twitter', 'universal')),
    audience_type TEXT NOT NULL CHECK (audience_type IN ('saved', 'lookalike', 'custom', 'retargeting')),

    -- Targeting criteria
    criteria JSONB NOT NULL, -- Platform-specific targeting
    estimated_size INTEGER,

    -- Performance tracking
    total_ads_used INTEGER DEFAULT 0,
    avg_ctr NUMERIC(5,2),
    avg_conversion_rate NUMERIC(5,2),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audiences_merchant ON ai_social_ad_audiences(merchant_id);
CREATE INDEX idx_audiences_platform ON ai_social_ad_audiences(platform);

-- Table: ai_social_ad_performance
-- Detailed time-series performance metrics
CREATE TABLE IF NOT EXISTS ai_social_ad_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_id UUID NOT NULL REFERENCES ai_social_ads(id) ON DELETE CASCADE,

    -- Time bucket
    date DATE NOT NULL,
    hour INTEGER, -- 0-23 for hourly breakdown

    -- Metrics
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    ctr NUMERIC(5,2), -- Click-through rate
    conversions INTEGER DEFAULT 0,
    conversion_rate NUMERIC(5,2),

    -- Financial
    spend NUMERIC(12,2) DEFAULT 0,
    revenue NUMERIC(12,2) DEFAULT 0,
    roas NUMERIC(8,2), -- Return on ad spend
    cost_per_click NUMERIC(8,2),
    cost_per_conversion NUMERIC(8,2),

    -- Engagement (platform-specific)
    likes INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    video_views INTEGER DEFAULT 0,
    video_completion_rate NUMERIC(5,2),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_performance_ad ON ai_social_ad_performance(ad_id);
CREATE INDEX idx_performance_date ON ai_social_ad_performance(date DESC);
CREATE UNIQUE INDEX idx_performance_unique ON ai_social_ad_performance(ad_id, date, COALESCE(hour, -1));

-- Table: ai_social_ad_recommendations
-- AI recommendations for ad optimization
CREATE TABLE IF NOT EXISTS ai_social_ad_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL,
    ad_id UUID REFERENCES ai_social_ads(id) ON DELETE CASCADE,

    -- Recommendation details
    recommendation_type TEXT NOT NULL, -- increase_budget, change_creative, adjust_targeting, pause_ad, scale_ad
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

    -- Impact estimation
    estimated_impact JSONB, -- {metric: 'conversions', increase_pct: 25, confidence: 0.85}

    -- Recommendation data
    current_value JSONB,
    recommended_value JSONB,

    -- Action tracking
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'dismissed', 'expired')),
    applied_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_recommendations_merchant ON ai_social_ad_recommendations(merchant_id);
CREATE INDEX idx_recommendations_ad ON ai_social_ad_recommendations(ad_id);
CREATE INDEX idx_recommendations_status ON ai_social_ad_recommendations(status);

-- Table: ai_social_ad_templates
-- Reusable ad templates for quick campaign creation
CREATE TABLE IF NOT EXISTS ai_social_ad_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID, -- NULL for global templates

    -- Template info
    name TEXT NOT NULL,
    category TEXT, -- ecommerce, saas, education, real_estate, etc.
    platform TEXT NOT NULL,

    -- Template content
    title_template TEXT NOT NULL,
    copy_template TEXT NOT NULL,
    cta_button TEXT,

    -- Default targeting
    default_targeting JSONB,
    suggested_budget NUMERIC(12,2),

    -- Performance stats
    times_used INTEGER DEFAULT 0,
    avg_performance JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_templates_platform ON ai_social_ad_templates(platform);
CREATE INDEX idx_templates_category ON ai_social_ad_templates(category);

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_social_ads_updated_at
    BEFORE UPDATE ON ai_social_ads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_audiences_updated_at
    BEFORE UPDATE ON ai_social_ad_audiences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function: Calculate CTR
CREATE OR REPLACE FUNCTION calculate_ctr(clicks INTEGER, impressions INTEGER)
RETURNS NUMERIC(5,2) AS $$
BEGIN
    IF impressions > 0 THEN
        RETURN ROUND((clicks::NUMERIC / impressions::NUMERIC) * 100, 2);
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Calculate ROAS
CREATE OR REPLACE FUNCTION calculate_roas(revenue NUMERIC, spend NUMERIC)
RETURNS NUMERIC(8,2) AS $$
BEGIN
    IF spend > 0 THEN
        RETURN ROUND(revenue / spend, 2);
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Sample data: Global templates
INSERT INTO ai_social_ad_templates (name, category, platform, title_template, copy_template, cta_button, default_targeting, suggested_budget)
VALUES
    (
        'E-commerce Product Launch',
        'ecommerce',
        'facebook',
        'Nouveau : {{product_name}} 🚀',
        'Découvrez notre {{product_name}} ! Offre spéciale : {{discount}}% de réduction. Livraison gratuite. {{emoji}}',
        'shop_now',
        '{"countries": ["SN", "FR", "CI"], "age_min": 18, "age_max": 45, "interests": ["shopping", "fashion"]}',
        50.00
    ),
    (
        'TikTok Viral Product',
        'ecommerce',
        'tiktok',
        '🔥 Tendance : {{product_name}}',
        'Tout le monde en parle ! {{product_name}} - Stock limité 😱 {{discount}}% OFF #viral #trend',
        'shop_now',
        '{"countries": ["SN", "FR"], "age_min": 16, "age_max": 30, "interests": ["fashion", "beauty", "tech"]}',
        100.00
    ),
    (
        'LinkedIn B2B Service',
        'saas',
        'linkedin',
        '{{service_name}} - Solution professionnelle',
        'Optimisez votre {{business_area}} avec {{service_name}}. Essai gratuit 30 jours. 🎯',
        'learn_more',
        '{"countries": ["FR", "SN"], "age_min": 25, "age_max": 55, "job_titles": ["CEO", "Manager", "Director"]}',
        75.00
    );

-- Comments
COMMENT ON TABLE ai_social_ads IS 'Main table for AI-generated social media advertising campaigns';
COMMENT ON TABLE ai_social_ad_creatives IS 'Generated visual assets (images, videos) for social ads';
COMMENT ON TABLE ai_social_ad_audiences IS 'Audience segments for targeting optimization';
COMMENT ON TABLE ai_social_ad_performance IS 'Time-series performance metrics for ads';
COMMENT ON TABLE ai_social_ad_recommendations IS 'AI-powered recommendations for ad optimization';
COMMENT ON TABLE ai_social_ad_templates IS 'Reusable templates for quick campaign creation';
