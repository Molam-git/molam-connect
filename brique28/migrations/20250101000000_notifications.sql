-- migrations/20250101000000_notifications.sql
-- Creates notification tables, providers, zones, audit, metrics

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS notification_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  zone_code TEXT,
  priority INTEGER DEFAULT 100,
  base_cost NUMERIC(12,6) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  is_active BOOLEAN DEFAULT TRUE,
  config JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_zones (
  zone_code TEXT PRIMARY KEY,
  prefer_sms BOOLEAN DEFAULT false,
  prefer_email BOOLEAN DEFAULT false,
  max_backoff_sec INTEGER DEFAULT 300,
  max_retries INTEGER DEFAULT 5,
  min_fee NUMERIC(12,6) DEFAULT 0.01,
  max_fee NUMERIC(12,6) DEFAULT 5.00,
  pricing_markup_pct NUMERIC(5,2) DEFAULT 0.0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  agent_id BIGINT,
  channel TEXT NOT NULL,
  zone_code TEXT NOT NULL,
  language TEXT NOT NULL,
  currency TEXT NOT NULL,
  payload JSONB NOT NULL,
  provider_attempts JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending',
  priority INTEGER DEFAULT 100,
  next_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_metrics (
  day DATE NOT NULL,
  zone_code TEXT NOT NULL,
  channel TEXT NOT NULL,
  sent_count BIGINT DEFAULT 0,
  delivered_count BIGINT DEFAULT 0,
  failed_count BIGINT DEFAULT 0,
  avg_latency_ms NUMERIC(12,2) DEFAULT 0,
  avg_cost NUMERIC(12,6) DEFAULT 0,
  PRIMARY KEY (day, zone_code, channel)
);

CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_zone ON notifications(zone_code);
CREATE INDEX IF NOT EXISTS idx_notifications_next_attempt ON notifications(next_attempt_at);