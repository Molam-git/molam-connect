-- ============================================================================
-- Real-Time FX Aggregator & Conversion API
-- ============================================================================

CREATE TABLE IF NOT EXISTS fx_rate_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  endpoint TEXT,
  api_key_ref TEXT,
  priority INTEGER DEFAULT 100,
  enabled BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fx_live_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair TEXT NOT NULL,
  base_currency CHAR(3) NOT NULL,
  quote_currency CHAR(3) NOT NULL,
  rate NUMERIC(30,12) NOT NULL,
  provider_id UUID REFERENCES fx_rate_providers(id),
  sourced_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ttl_seconds INTEGER DEFAULT 60,
  confidence NUMERIC(5,4) DEFAULT 1.0,
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(pair, provider_id)
);
CREATE INDEX idx_fx_live_pair ON fx_live_rates(pair);

CREATE TABLE IF NOT EXISTS fx_quotes_cache (
  pair TEXT PRIMARY KEY,
  rate NUMERIC(30,12) NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL,
  providers JSONB DEFAULT '[]'::jsonb,
  ttl_seconds INTEGER NOT NULL DEFAULT 5
);

CREATE TABLE IF NOT EXISTS fx_provider_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES fx_rate_providers(id),
  pair TEXT,
  raw_payload JSONB,
  parsed_rate NUMERIC(30,12),
  sourced_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ DEFAULT now()
);
