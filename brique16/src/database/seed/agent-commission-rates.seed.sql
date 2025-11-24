-- Seed data for agent commission rates
-- Default commission rates by country and transaction type

INSERT INTO agent_commission_rates (country_code, transaction_type, rate, min_amount, max_amount, is_active) VALUES
('SN', 'CASHIN', 0.00, 0, 1000000, true),
('SN', 'CASHOUT', 1.00, 0, 1000000, true),
('SN', 'P2P', 1.00, 0, 1000000, true),
('CI', 'CASHIN', 0.00, 0, 1000000, true),
('CI', 'CASHOUT', 1.50, 0, 1000000, true),
('CI', 'P2P', 1.50, 0, 1000000, true),
('ML', 'CASHIN', 0.00, 0, 1000000, true),
('ML', 'CASHOUT', 1.25, 0, 1000000, true),
('ML', 'P2P', 1.25, 0, 1000000, true),
('BF', 'CASHIN', 0.00, 0, 1000000, true),
('BF', 'CASHOUT', 1.00, 0, 1000000, true),
('BF', 'P2P', 1.00, 0, 1000000, true),
('TG', 'CASHIN', 0.00, 0, 1000000, true),
('TG', 'CASHOUT', 1.75, 0, 1000000, true),
('TG', 'P2P', 1.75, 0, 1000000, true)
ON CONFLICT (country_code, transaction_type) 
DO UPDATE SET 
  rate = EXCLUDED.rate,
  min_amount = EXCLUDED.min_amount,
  max_amount = EXCLUDED.max_amount,
  is_active = EXCLUDED.is_active;

-- Create commission rates table if it doesn't exist
CREATE TABLE IF NOT EXISTS agent_commission_rates (
  rate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('CASHIN', 'CASHOUT', 'P2P')),
  rate NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  min_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  max_amount NUMERIC(18,2) NOT NULL DEFAULT 1000000,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (country_code, transaction_type)
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_commission_rates_country_type ON agent_commission_rates(country_code, transaction_type) WHERE is_active = true;