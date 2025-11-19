-- Seed data for bank profiles (Molam Treasury)
INSERT INTO bank_profiles (id, status, supported_currencies, flat_fee, percent_fee, avg_delay_sec, risk_score, settlement_account_id)
VALUES
  ('bank_local_sn', 'active', ARRAY['XOF'], 0.25, 0.0020, 900, 0.08, gen_random_uuid()),
  ('bank_pan_africa', 'active', ARRAY['XOF','NGN','GHS','USD'], 0.50, 0.0035, 3600, 0.12, gen_random_uuid()),
  ('bank_eu_corr', 'active', ARRAY['EUR','USD'], 1.00, 0.0020, 7200, 0.05, gen_random_uuid()),
  ('bank_us_clear', 'active', ARRAY['USD'], 0.75, 0.0025, 5400, 0.06, gen_random_uuid()),
  ('bank_fintech_fx', 'active', ARRAY['USD','EUR','XOF','GBP'], 0.10, 0.0045, 600, 0.25, gen_random_uuid())
ON CONFLICT (id) DO NOTHING;

