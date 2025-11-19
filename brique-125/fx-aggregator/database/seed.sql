-- ============================================================================
-- FX Aggregator - Seed Data
-- ============================================================================

-- Seed provider registry with common providers
INSERT INTO fx_rate_providers (name, provider_type, endpoint, api_key_ref, priority, enabled) VALUES
  ('ECB (European Central Bank)', 'rest', 'https://api.exchangerate.host/latest', 'ECB_API_KEY', 10, true),
  ('Fixer.io', 'rest', 'https://api.fixer.io/latest', 'FIXER_API_KEY', 20, true),
  ('Open Exchange Rates', 'rest', 'https://openexchangerates.org/api/latest.json', 'OXR_API_KEY', 30, true),
  ('Internal Bank Provider A', 'rest', 'https://bank-a.internal/fx/rates', 'BANK_A_KEY', 5, true),
  ('Internal Bank Provider B', 'rest', 'https://bank-b.internal/fx/rates', 'BANK_B_KEY', 6, true)
ON CONFLICT DO NOTHING;

-- Seed some initial rates (will be overwritten by workers)
INSERT INTO fx_live_rates (pair, base_currency, quote_currency, rate, provider_id, sourced_at, ttl_seconds, confidence)
SELECT
  'USD/XOF', 'USD', 'XOF', 615.50, id, now(), 60, 1.0
FROM fx_rate_providers WHERE name = 'ECB (European Central Bank)'
ON CONFLICT (pair, provider_id) DO UPDATE SET rate = EXCLUDED.rate, sourced_at = EXCLUDED.sourced_at;

INSERT INTO fx_live_rates (pair, base_currency, quote_currency, rate, provider_id, sourced_at, ttl_seconds, confidence)
SELECT
  'EUR/XOF', 'EUR', 'XOF', 655.95, id, now(), 60, 1.0
FROM fx_rate_providers WHERE name = 'ECB (European Central Bank)'
ON CONFLICT (pair, provider_id) DO UPDATE SET rate = EXCLUDED.rate, sourced_at = EXCLUDED.sourced_at;

INSERT INTO fx_live_rates (pair, base_currency, quote_currency, rate, provider_id, sourced_at, ttl_seconds, confidence)
SELECT
  'USD/EUR', 'USD', 'EUR', 0.92, id, now(), 60, 1.0
FROM fx_rate_providers WHERE name = 'Fixer.io'
ON CONFLICT (pair, provider_id) DO UPDATE SET rate = EXCLUDED.rate, sourced_at = EXCLUDED.sourced_at;

-- Initialize quotes cache for hot pairs
INSERT INTO fx_quotes_cache (pair, rate, computed_at, providers, ttl_seconds) VALUES
  ('USD/XOF', 615.50, now(), '[{"provider_id":"ecb","rate":615.50,"weight":1.0}]', 5),
  ('EUR/XOF', 655.95, now(), '[{"provider_id":"ecb","rate":655.95,"weight":1.0}]', 5),
  ('USD/EUR', 0.92, now(), '[{"provider_id":"fixer","rate":0.92,"weight":1.0}]', 5)
ON CONFLICT (pair) DO UPDATE SET rate = EXCLUDED.rate, computed_at = EXCLUDED.computed_at;

-- Verify
SELECT 'Providers seeded:' as status, count(*) as count FROM fx_rate_providers;
SELECT 'Live rates seeded:' as status, count(*) as count FROM fx_live_rates;
SELECT 'Quotes cache seeded:' as status, count(*) as count FROM fx_quotes_cache;
