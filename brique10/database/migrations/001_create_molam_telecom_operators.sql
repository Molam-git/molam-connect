// database/migrations/001_create_molam_telecom_operators.sql
CREATE TABLE molam_telecom_operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country_code CHAR(2) NOT NULL,
  provider_type TEXT NOT NULL,
  api_endpoint TEXT,
  aggregator_code TEXT,
  currency TEXT NOT NULL,
  commission_rate NUMERIC(5,2) DEFAULT 0.0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_operators_country ON molam_telecom_operators(country_code);
CREATE INDEX idx_operators_status ON molam_telecom_operators(status);