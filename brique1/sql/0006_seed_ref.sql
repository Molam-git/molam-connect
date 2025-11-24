INSERT INTO ref_currencies (currency_code, num_code, name, minor_unit) VALUES
  ('XOF', 952, 'CFA Franc BCEAO', 0),
  ('XAF', 950, 'CFA Franc BEAC', 0),
  ('USD', 840, 'US Dollar', 2),
  ('EUR', 978, 'Euro', 2)
ON CONFLICT (currency_code) DO NOTHING;

INSERT INTO ref_countries (country_code, name, phone_country_code, currency_code) VALUES
  ('SN', 'Senegal', '+221', 'XOF'),
  ('CI', 'Côte d''Ivoire', '+225', 'XOF'),
  ('CM', 'Cameroon', '+237', 'XAF'),
  ('FR', 'France', '+33', 'EUR'),
  ('US', 'United States', '+1', 'USD')
ON CONFLICT (country_code) DO NOTHING;