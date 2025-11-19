-- ============================================================================
-- Brique 121 — Bank Connectors Database Schema
-- ============================================================================
-- Purpose: Registry for bank connectors, raw statements, parsed lines
-- Security: Encrypted storage, WORM for regulatory files, audit trail
-- ============================================================================

-- Bank profiles (existing or create if not exists)
CREATE TABLE IF NOT EXISTS bank_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name TEXT NOT NULL,
  bank_code TEXT,
  country TEXT NOT NULL,
  swift_bic TEXT,
  supported_rails TEXT[] DEFAULT '{}', -- ['rest','mt940','iso20022','rtgs']
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Bank connectors registry
CREATE TABLE IF NOT EXISTS bank_connectors_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_profile_id UUID NOT NULL REFERENCES bank_profiles(id) ON DELETE CASCADE,
  connector_type TEXT NOT NULL CHECK (connector_type IN ('rest', 'mt940', 'iso20022', 'local', 'csv', 'camt053')),
  config JSONB NOT NULL DEFAULT '{}', -- endpoint, vault keys, SFTP config, etc.
  priority INT DEFAULT 100, -- lower = higher priority
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance', 'failed')),
  last_health_check TIMESTAMPTZ,
  health_status TEXT DEFAULT 'unknown',
  circuit_breaker_state TEXT DEFAULT 'closed' CHECK (circuit_breaker_state IN ('closed', 'open', 'half_open')),
  failure_count INT DEFAULT 0,
  last_failure TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bcr_bank_profile ON bank_connectors_registry(bank_profile_id);
CREATE INDEX IF NOT EXISTS idx_bcr_type ON bank_connectors_registry(connector_type);
CREATE INDEX IF NOT EXISTS idx_bcr_status ON bank_connectors_registry(status);
CREATE INDEX IF NOT EXISTS idx_bcr_priority ON bank_connectors_registry(priority);

-- Raw bank statements (files uploaded/fetched)
CREATE TABLE IF NOT EXISTS bank_statements_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_profile_id UUID NOT NULL REFERENCES bank_profiles(id),
  connector_id UUID REFERENCES bank_connectors_registry(id),
  file_name TEXT,
  file_s3_key TEXT, -- S3 path or local path
  file_hash TEXT, -- SHA256 for deduplication
  file_size_bytes BIGINT,
  statement_date DATE,
  parsed JSONB, -- parsed structure before normalization
  status TEXT DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'parsing', 'parsed', 'failed', 'archived')),
  error_message TEXT,
  imported_at TIMESTAMPTZ DEFAULT now(),
  parsed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bsr_bank_profile ON bank_statements_raw(bank_profile_id);
CREATE INDEX IF NOT EXISTS idx_bsr_status ON bank_statements_raw(status);
CREATE INDEX IF NOT EXISTS idx_bsr_date ON bank_statements_raw(statement_date);
CREATE INDEX IF NOT EXISTS idx_bsr_hash ON bank_statements_raw(file_hash);

-- Normalized bank statement lines
CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_statement_id UUID REFERENCES bank_statements_raw(id) ON DELETE CASCADE,
  bank_profile_id UUID NOT NULL REFERENCES bank_profiles(id),
  statement_date DATE NOT NULL,
  value_date DATE NOT NULL,
  amount NUMERIC(20,2) NOT NULL,
  currency TEXT NOT NULL,
  debit_credit TEXT CHECK (debit_credit IN ('debit', 'credit')),
  description TEXT,
  reference TEXT,
  bank_reference TEXT,
  transaction_code TEXT,
  counterparty_name TEXT,
  counterparty_account TEXT,
  reconciliation_status TEXT DEFAULT 'unmatched' CHECK (reconciliation_status IN ('unmatched', 'matched', 'pending', 'ignored')),
  matched_payout_id UUID, -- link to payouts table
  matched_slice_id UUID, -- link to payout_slices table
  matched_at TIMESTAMPTZ,
  raw JSONB, -- original parsed data
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bsl_bank_profile ON bank_statement_lines(bank_profile_id);
CREATE INDEX IF NOT EXISTS idx_bsl_statement_date ON bank_statement_lines(statement_date);
CREATE INDEX IF NOT EXISTS idx_bsl_value_date ON bank_statement_lines(value_date);
CREATE INDEX IF NOT EXISTS idx_bsl_reconciliation ON bank_statement_lines(reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_bsl_reference ON bank_statement_lines(reference);
CREATE INDEX IF NOT EXISTS idx_bsl_bank_reference ON bank_statement_lines(bank_reference);
CREATE INDEX IF NOT EXISTS idx_bsl_matched_payout ON bank_statement_lines(matched_payout_id);

-- Connector execution logs (for observability and debugging)
CREATE TABLE IF NOT EXISTS bank_connector_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id UUID NOT NULL REFERENCES bank_connectors_registry(id),
  operation TEXT NOT NULL, -- 'sendPayment', 'getStatus', 'uploadStatement', 'parseStatement'
  payout_slice_id UUID, -- if sending payment
  statement_id UUID, -- if parsing statement
  trace_id TEXT,
  request_payload JSONB,
  response_payload JSONB,
  status TEXT CHECK (status IN ('success', 'failed', 'timeout', 'circuit_open')),
  duration_ms INT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bcl_connector ON bank_connector_logs(connector_id);
CREATE INDEX IF NOT EXISTS idx_bcl_operation ON bank_connector_logs(operation);
CREATE INDEX IF NOT EXISTS idx_bcl_status ON bank_connector_logs(status);
CREATE INDEX IF NOT EXISTS idx_bcl_created ON bank_connector_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_bcl_trace ON bank_connector_logs(trace_id);

-- Connector secrets metadata (actual secrets in Vault)
CREATE TABLE IF NOT EXISTS bank_connector_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id UUID NOT NULL REFERENCES bank_connectors_registry(id) ON DELETE CASCADE,
  secret_type TEXT NOT NULL, -- 'api_key', 'hmac_key', 'client_cert', 'signing_key'
  vault_path TEXT NOT NULL, -- path in Vault
  expires_at TIMESTAMPTZ,
  rotation_policy TEXT DEFAULT 'manual' CHECK (rotation_policy IN ('manual', 'auto_30d', 'auto_90d')),
  last_rotated TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bcs_connector ON bank_connector_secrets(connector_id);

-- Payout slices table (if not exists from B120ter)
CREATE TABLE IF NOT EXISTS payout_slices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_payout_id UUID NOT NULL,
  treasury_account_id UUID NOT NULL,
  slice_amount NUMERIC(20,2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'settled', 'cancelled')),
  provider_ref TEXT, -- bank's reference
  connector_id UUID REFERENCES bank_connectors_registry(id),
  idempotency_key TEXT UNIQUE,
  attempts INT DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ps_status ON payout_slices(status);
CREATE INDEX IF NOT EXISTS idx_ps_parent ON payout_slices(parent_payout_id);
CREATE INDEX IF NOT EXISTS idx_ps_treasury ON payout_slices(treasury_account_id);
CREATE INDEX IF NOT EXISTS idx_ps_provider_ref ON payout_slices(provider_ref);

-- Treasury accounts table (if not exists from B34)
CREATE TABLE IF NOT EXISTS treasury_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_profile_id UUID REFERENCES bank_profiles(id),
  account_number TEXT NOT NULL,
  iban TEXT,
  currency TEXT NOT NULL,
  balance NUMERIC(20,2) DEFAULT 0,
  available_balance NUMERIC(20,2) DEFAULT 0,
  status TEXT DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger for auto-updating updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_bank_connectors_registry_updated_at BEFORE UPDATE ON bank_connectors_registry FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bank_statements_raw_updated_at BEFORE UPDATE ON bank_statements_raw FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bank_statement_lines_updated_at BEFORE UPDATE ON bank_statement_lines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payout_slices_updated_at BEFORE UPDATE ON payout_slices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample data for testing
INSERT INTO bank_profiles (bank_name, bank_code, country, swift_bic, supported_rails, status) VALUES
  ('Sandbox Bank REST', 'SBOX001', 'SN', 'SBOXSNDA', ARRAY['rest'], 'active'),
  ('West Africa Bank SFTP', 'WAB002', 'CI', 'WABXCIAB', ARRAY['mt940', 'csv'], 'active'),
  ('Euro Bank ISO20022', 'EURO003', 'FR', 'EURXFRPP', ARRAY['iso20022', 'rest'], 'active')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- End of schema
-- ============================================================================
