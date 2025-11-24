-- migrations/20250601_create_fraud_tables.sql
-- Requires: pgcrypto extension for gen_random_uuid()

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- fraud_cases
CREATE TABLE IF NOT EXISTS fraud_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id TEXT,
  origin_module TEXT,
  entity_type TEXT,
  entity_id UUID,
  severity TEXT,
  score NUMERIC(6,4),
  suggested_action TEXT,
  status TEXT DEFAULT 'open',
  assigned_to UUID,
  playbook_id UUID,
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fraud_cases_status ON fraud_cases(status);
CREATE INDEX IF NOT EXISTS idx_fraud_cases_entity ON fraud_cases(entity_type, entity_id);

-- fraud_playbooks
CREATE TABLE IF NOT EXISTS fraud_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  version INT DEFAULT 1,
  dsl JSONB NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- fraud_case_actions
CREATE TABLE IF NOT EXISTS fraud_case_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fraud_case_id UUID REFERENCES fraud_cases(id) ON DELETE CASCADE,
  actor_id UUID,
  action_type TEXT,
  payload JSONB,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fraud_actions_case ON fraud_case_actions(fraud_case_id);

-- fraud_approvals
CREATE TABLE IF NOT EXISTS fraud_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fraud_case_id UUID REFERENCES fraud_cases(id) ON DELETE CASCADE,
  action_type TEXT,
  required_signers JSONB DEFAULT '[]'::jsonb,
  approvals JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- fraud_operators
CREATE TABLE IF NOT EXISTS fraud_operators (
  user_id UUID PRIMARY KEY,
  display_name TEXT,
  roles TEXT[],
  timezone TEXT,
  phone TEXT,
  email TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- fraud_automation_logs
CREATE TABLE IF NOT EXISTS fraud_automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT,
  event JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- audit: ensure molam_audit_logs exists in system (used by workers to write immutable logs)
CREATE TABLE IF NOT EXISTS molam_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT,
  action TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);