-- Table pour le registre MSISDN
CREATE TABLE ussd_msisdn_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  msisdn TEXT NOT NULL,
  country_code CHAR(2) NOT NULL,
  user_id UUID REFERENCES molam_users(id),
  language TEXT NOT NULL DEFAULT 'fr',
  currency TEXT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (msisdn, country_code)
);

-- Audit des interactions USSD
CREATE TABLE ussd_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  msisdn TEXT NOT NULL,
  country_code CHAR(2) NOT NULL,
  operator TEXT,
  step TEXT NOT NULL,
  payload JSONB,
  result TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Routes des opérateurs
CREATE TABLE ussd_operator_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code CHAR(2) NOT NULL,
  operator TEXT NOT NULL,
  short_code TEXT NOT NULL,
  callback_secret TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

-- Carte des agents USSD
CREATE TABLE ussd_agents_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES molam_agents(id),
  country_code CHAR(2) NOT NULL,
  msisdn TEXT,
  nickname TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (agent_id, country_code)
);

-- Index pour les performances
CREATE INDEX idx_ussd_msisdn_registry_msisdn ON ussd_msisdn_registry(msisdn);
CREATE INDEX idx_ussd_audit_logs_session_id ON ussd_audit_logs(session_id);
CREATE INDEX idx_ussd_audit_logs_created_at ON ussd_audit_logs(created_at);
CREATE INDEX idx_ussd_operator_routes_country ON ussd_operator_routes(country_code, operator);