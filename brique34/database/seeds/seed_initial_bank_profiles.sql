INSERT INTO bank_profiles (id, name, country, currency_codes, rails, provider_type, compliance_level, fees)
VALUES 
  (gen_random_uuid(), 'CEDEAO Bank', 'SN', ARRAY['XOF','USD'], '{"sepa":false,"swift":true,"local":["SN-RTGS"]}', 'bank', 'onboarding', '{"swift": {"fixed": 1.5, "percent":0.005}}'),
  (gen_random_uuid(), 'US Partner Bank', 'US', ARRAY['USD','EUR'], '{"sepa":true,"swift":true,"local":["ACH"]}', 'bank', 'verified', '{"ach": {"fixed": 0.25, "percent":0}}');

-- Insérer des comptes trésorerie pour ces banques
INSERT INTO treasury_accounts (bank_profile_id, account_reference, currency, account_type, ledger_account_code)
SELECT 
  id, 
  '{"iban":"REDACTED_ENC"}', 
  'XOF', 
  'settlement', 
  'GL:1000:SN'
FROM bank_profiles WHERE name = 'CEDEAO Bank';

INSERT INTO treasury_accounts (bank_profile_id, account_reference, currency, account_type, ledger_account_code)
SELECT 
  id, 
  '{"account_number":"REDACTED_ENC"}', 
  'USD', 
  'settlement', 
  'GL:1000:US'
FROM bank_profiles WHERE name = 'US Partner Bank';