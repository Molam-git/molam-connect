-- Brique 57 - Merchant Self-Service Fraud Toolkit
-- Migration: 057_merchant_protection.sql
-- 5 tables for merchant fraud prevention self-service

-- 1) Merchant whitelists / blacklists
CREATE TABLE IF NOT EXISTS merchant_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  list_type TEXT NOT NULL, -- 'whitelist' | 'blacklist'
  entity_type TEXT NOT NULL, -- 'customer', 'card', 'ip', 'device'
  value TEXT NOT NULL, -- e.g., customer_id or hashed card fingerprint or CIDR ip range
  scope JSONB DEFAULT '{}', -- optional (country, currency)
  reason TEXT, -- reason for adding to list
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ, -- optional expiry for temporary blocks
  UNIQUE(merchant_id, list_type, entity_type, value)
);

-- 2) Merchant notifications (preferences)
CREATE TABLE IF NOT EXISTS merchant_notifications (
  merchant_id UUID PRIMARY KEY,
  configs JSONB DEFAULT '{}', -- {email, webhooks: [{url, events: []}], slack: {webhook_url}}
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3) Merchant protection subscriptions (premium)
CREATE TABLE IF NOT EXISTS merchant_protections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL UNIQUE,
  protection_level TEXT NOT NULL DEFAULT 'basic', -- basic | premium | guaranteed
  effective_from TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'active', -- active | suspended | cancelled
  monthly_fee NUMERIC(10,2) DEFAULT 0,
  features JSONB DEFAULT '{}', -- {auto_refute: true, chargeback_guarantee: false, priority_support: true}
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4) Merchant dashboard snapshots (cached KPI)
CREATE TABLE IF NOT EXISTS merchant_fraud_snapshots (
  merchant_id UUID NOT NULL,
  day DATE NOT NULL,
  chargeback_count BIGINT DEFAULT 0,
  chargeback_amount NUMERIC(18,2) DEFAULT 0,
  disputes_open BIGINT DEFAULT 0,
  disputes_won BIGINT DEFAULT 0,
  disputes_lost BIGINT DEFAULT 0,
  fraud_losses NUMERIC(18,2) DEFAULT 0,
  radar_triggers BIGINT DEFAULT 0,
  radar_blocks BIGINT DEFAULT 0,
  payments_processed BIGINT DEFAULT 0,
  payments_amount NUMERIC(18,2) DEFAULT 0,
  PRIMARY KEY (merchant_id, day)
);

-- 5) Evidence packages (merchant-submitted)
CREATE TABLE IF NOT EXISTS evidence_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL,
  merchant_id UUID NOT NULL,
  dispute_id UUID, -- link to dispute if applicable
  status TEXT DEFAULT 'pending', -- pending | assembling | assembled | submitted | rejected | accepted
  note TEXT, -- merchant notes
  files JSONB DEFAULT '[]', -- list of s3 keys [{key, name, size, type}]
  package_s3_key TEXT, -- final packaged ZIP/PDF
  package_hash TEXT, -- SHA-256 hash for integrity
  submitted_to TEXT, -- 'ops' | 'network' | 'both'
  submitted_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_merchant_lists_merchant ON merchant_lists(merchant_id, list_type);
CREATE INDEX IF NOT EXISTS idx_merchant_lists_value ON merchant_lists(entity_type, value);
CREATE INDEX IF NOT EXISTS idx_merchant_lists_expires ON merchant_lists(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_merchant_protections_merchant ON merchant_protections(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_merchant_fraud_snapshots_merchant_day ON merchant_fraud_snapshots(merchant_id, day DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_packages_merchant ON evidence_packages(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_evidence_packages_payment ON evidence_packages(payment_id);
CREATE INDEX IF NOT EXISTS idx_evidence_packages_dispute ON evidence_packages(dispute_id) WHERE dispute_id IS NOT NULL;

-- Comments for documentation
COMMENT ON TABLE merchant_lists IS 'Merchant-managed whitelists and blacklists for fraud prevention';
COMMENT ON TABLE merchant_notifications IS 'Merchant notification preferences for fraud alerts';
COMMENT ON TABLE merchant_protections IS 'Merchant protection subscription levels and features';
COMMENT ON TABLE merchant_fraud_snapshots IS 'Daily cached KPIs for merchant fraud dashboards';
COMMENT ON TABLE evidence_packages IS 'Merchant-submitted evidence packages for disputes';

-- Audit table for merchant actions (if not exists)
CREATE TABLE IF NOT EXISTS molam_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor UUID NOT NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_molam_audit_logs_actor ON molam_audit_logs(actor, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_molam_audit_logs_action ON molam_audit_logs(action, created_at DESC);
