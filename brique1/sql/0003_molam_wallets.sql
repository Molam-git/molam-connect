CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table is provided by Molam ID phase 1:
-- molam_users(id UUID PK, user_type ENUM('external','employee','agent','merchant','bank'), ...)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_status') THEN
    CREATE TYPE wallet_status AS ENUM ('active', 'frozen', 'closed');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS molam_wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES molam_users(id) ON DELETE CASCADE,
  country_code CHAR(2) NOT NULL REFERENCES ref_countries(country_code),
  currency CHAR(3) NOT NULL REFERENCES ref_currencies(currency_code),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,  -- one default per (user,currency)
  status wallet_status NOT NULL DEFAULT 'active',

  display_name TEXT,                          -- e.g. "Main XOF wallet"
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- data governance
  created_by UUID,                            -- actor id (employee or user)
  updated_by UUID,

  -- integrity
  CONSTRAINT uq_user_currency UNIQUE (user_id, currency)
);