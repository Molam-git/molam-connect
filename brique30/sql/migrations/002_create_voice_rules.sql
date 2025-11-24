-- sql/migrations/002_create_voice_rules.sql
CREATE TABLE IF NOT EXISTS voice_channel_rules (
  id BIGSERIAL PRIMARY KEY,
  region TEXT,
  country TEXT,
  city TEXT,
  fallback_enabled BOOLEAN DEFAULT true,
  fallback_delay_seconds INT DEFAULT 60,
  max_message_seconds INT DEFAULT 60,
  budget_daily_usd NUMERIC(10,2) DEFAULT 50,
  budget_monthly_usd NUMERIC(10,2) DEFAULT 1000,
  allowed_hours INT4RANGE DEFAULT '[8,20)',
  preferred_providers TEXT[],
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_rules_country ON voice_channel_rules(country);
CREATE INDEX IF NOT EXISTS idx_voice_rules_region ON voice_channel_rules(region);