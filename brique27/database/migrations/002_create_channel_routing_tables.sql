CREATE TABLE IF NOT EXISTS channel_routing (
  event_type TEXT PRIMARY KEY,
  primary_channel TEXT NOT NULL,
  fallback_channel TEXT,
  ops_webhook BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS channel_routing_zones (
  country TEXT NOT NULL,
  event_type TEXT NOT NULL,
  primary_channel TEXT NOT NULL,
  fallback_channel TEXT,
  updated_by BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(country, event_type)
);

CREATE TABLE IF NOT EXISTS channel_routing_zone_versions (
  id BIGSERIAL PRIMARY KEY,
  country TEXT NOT NULL,
  event_type TEXT NOT NULL,
  primary_channel TEXT,
  fallback_channel TEXT,
  changed_by BIGINT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_type TEXT NOT NULL,
  diff JSONB
);

CREATE INDEX IF NOT EXISTS idx_routing_versions_country ON channel_routing_zone_versions(country);