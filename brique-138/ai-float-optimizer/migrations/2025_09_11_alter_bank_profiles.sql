-- Adds routing metadata used by SIRA
ALTER TABLE bank_profiles
  ADD COLUMN IF NOT EXISTS supported_currencies TEXT[],
  ADD COLUMN IF NOT EXISTS flat_fee NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percent_fee NUMERIC(8,6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_delay_sec INT DEFAULT 3600,
  ADD COLUMN IF NOT EXISTS risk_score NUMERIC(4,3) DEFAULT 0.1,
  ADD COLUMN IF NOT EXISTS settlement_account_id UUID;

