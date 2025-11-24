-- database/migrations/001_create_bank_treasury_tables.sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS bank_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  currency_codes TEXT[] NOT NULL,
  rails JSONB NOT NULL,
  provider_type TEXT NOT NULL,
  compliance_level TEXT DEFAULT 'onboarding',
  legal_documents JSONB,
  contact JSONB,
  sla JSONB,
  fees JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS treasury_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_profile_id UUID NOT NULL REFERENCES bank_profiles(id),
  account_reference JSONB NOT NULL,
  currency TEXT NOT NULL,
  account_type TEXT NOT NULL,
  ledger_account_code TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT,
  origin_module TEXT NOT NULL,
  origin_entity_id UUID,
  currency TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  bank_account JSONB NOT NULL,
  bank_profile_id UUID REFERENCES bank_profiles(id),
  treasury_account_id UUID REFERENCES treasury_accounts(id),
  status TEXT DEFAULT 'pending',
  molam_fee NUMERIC(10,2) DEFAULT 0,
  bank_fee NUMERIC(10,2) DEFAULT 0,
  total_deducted NUMERIC(18,2),
  reference_code TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bank_statements_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_profile_id UUID NOT NULL,
  file_s3_key TEXT NOT NULL,
  imported_at TIMESTAMPTZ DEFAULT now(),
  parsed JSONB,
  status TEXT DEFAULT 'uploaded'
);

CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_profile_id UUID NOT NULL,
  statement_date DATE,
  value_date TIMESTAMPTZ,
  amount NUMERIC(18,2),
  currency TEXT,
  description TEXT,
  reference TEXT,
  matched_payout_id UUID REFERENCES payouts(id),
  matched_wallet_txn_id UUID,
  reconciliation_status TEXT DEFAULT 'unmatched',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS treasury_float_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treasury_account_id UUID REFERENCES treasury_accounts(id),
  snapshot_ts TIMESTAMPTZ DEFAULT now(),
  balance NUMERIC(18,2) NOT NULL,
  reserved NUMERIC(18,2) DEFAULT 0,
  available NUMERIC(18,2) NOT NULL,
  currency TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reconciliation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT,
  action TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payouts_external_id ON payouts(external_id);
CREATE INDEX IF NOT EXISTS idx_payouts_reference_code ON payouts(reference_code);
CREATE INDEX IF NOT EXISTS idx_statement_lines_reference ON bank_statement_lines(reference);
CREATE INDEX IF NOT EXISTS idx_statement_lines_reconciliation_status ON bank_statement_lines(reconciliation_status);