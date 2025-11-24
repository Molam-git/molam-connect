// database/seeds/molam_topup_products_seed.sql
INSERT INTO molam_topup_products 
(id, operator_id, product_code, description, amount, currency, validity_days) 
SELECT 
  gen_random_uuid(),
  op.id,
  'CREDIT_1000',
  'Credit 1000 ' || op.currency,
  1000,
  op.currency,
  NULL
FROM molam_telecom_operators op
WHERE op.country_code = 'SN';

INSERT INTO molam_topup_products 
(id, operator_id, product_code, description, amount, currency, validity_days) 
SELECT 
  gen_random_uuid(),
  op.id,
  'CREDIT_5000',
  'Credit 5000 ' || op.currency,
  5000,
  op.currency,
  NULL
FROM molam_telecom_operators op
WHERE op.country_code = 'SN';