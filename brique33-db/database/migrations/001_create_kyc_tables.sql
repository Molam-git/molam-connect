-- database/migrations/001_create_kyc_tables.sql
CREATE TABLE IF NOT EXISTS kyc_levels (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_types (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  required_for JSONB DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS wallet_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES molam_users(id) ON DELETE CASCADE,
  document_type_id INT NOT NULL REFERENCES document_types(id),
  filename TEXT NOT NULL,
  s3_key TEXT NOT NULL,
  checksum TEXT,
  metadata JSONB DEFAULT '{}',
  uploaded_via TEXT NOT NULL,
  uploaded_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  sensitivity_level TEXT DEFAULT 'high',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_verification_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES wallet_documents(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  assigned_to TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  score NUMERIC(5,2),
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES molam_users(id) ON DELETE CASCADE,
  kyc_level_id INT REFERENCES kyc_levels(id),
  primary_document_id UUID REFERENCES wallet_documents(id),
  status TEXT NOT NULL DEFAULT 'pending',
  flags JSONB DEFAULT '{}',
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bank_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  swift TEXT,
  account_reference JSONB,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS molam_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_documents_user ON wallet_documents(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_verifications_user ON wallet_verifications(user_id);