-- sql/migrations/001_create_voice_tables.sql
CREATE TABLE IF NOT EXISTS notification_delivery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES molam_users(id),
  template_id UUID REFERENCES notification_templates(id),
  channel TEXT NOT NULL,
  provider TEXT,
  provider_request_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  fail_reason TEXT,
  cost_usd NUMERIC(10,6) DEFAULT 0,
  attempts INT DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  country TEXT,
  region TEXT,
  city TEXT,
  currency TEXT DEFAULT 'USD',
  rule_id BIGINT
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_user ON notification_delivery(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_status ON notification_delivery(status);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_country ON notification_delivery(country);

CREATE TABLE IF NOT EXISTS user_channel_optin (
  user_id UUID PRIMARY KEY REFERENCES molam_users(id),
  voice_optin BOOLEAN DEFAULT false,
  voice_optin_at TIMESTAMPTZ,
  voice_optout_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tts_providers (
  id TEXT PRIMARY KEY,
  name TEXT,
  endpoint TEXT,
  api_key_encrypted TEXT,
  per_minute_usd NUMERIC(8,6),
  supported_langs TEXT[],
  regions_supported TEXT[],
  is_active BOOLEAN DEFAULT true
);