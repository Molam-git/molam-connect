/**
 * Brique 51bis - Merchant Refund Policies & Zones
 * Database Schema Extensions
 */

-- 1) Zones and countries (regional groupings)
CREATE TABLE IF NOT EXISTS zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE, -- e.g. 'CEDEAO','EU','US','ASEAN'
  name TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zones_code ON zones(code);

-- 2) Zone countries mapping
CREATE TABLE IF NOT EXISTS zone_countries (
  zone_id UUID REFERENCES zones(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL, -- ISO2 (e.g. 'FR','SN','US')
  PRIMARY KEY(zone_id, country_code)
);

CREATE INDEX IF NOT EXISTS idx_zone_countries_country ON zone_countries(country_code);

-- 3) Merchant sub accounts (multi-store support)
CREATE TABLE IF NOT EXISTS merchant_sub_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  name TEXT NOT NULL,
  store_code TEXT, -- unique identifier for the store
  legal_entity TEXT,
  billing_currency TEXT DEFAULT 'USD',
  zones_supported UUID[] DEFAULT '{}', -- array of zone ids
  kyc_status TEXT DEFAULT 'pending', -- 'pending','verified','rejected'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(merchant_id, store_code),
  CHECK (kyc_status IN ('pending', 'verified', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_merchant_sub_accounts_merchant ON merchant_sub_accounts(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_sub_accounts_store_code ON merchant_sub_accounts(store_code);

-- 4) Refund policies (versioned, hierarchical)
CREATE TABLE IF NOT EXISTS refund_policies_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL, -- 'global'|'zone'|'merchant'|'sub_account'
  scope_id UUID, -- null if global, otherwise zone_id or merchant_id or sub_account_id
  name TEXT NOT NULL,
  description TEXT,
  config JSONB NOT NULL, -- structured policy config
  status TEXT DEFAULT 'active', -- 'active'|'archived'|'draft'
  priority INT DEFAULT 100, -- lower = higher priority
  created_by UUID, -- Molam ID user
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CHECK (scope IN ('global', 'zone', 'merchant', 'sub_account')),
  CHECK (status IN ('active', 'archived', 'draft'))
);

CREATE INDEX IF NOT EXISTS idx_refund_policies_v2_scope ON refund_policies_v2(scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_refund_policies_v2_status ON refund_policies_v2(status);
CREATE INDEX IF NOT EXISTS idx_refund_policies_v2_priority ON refund_policies_v2(priority);

-- 5) Policy history / audit (immutable)
CREATE TABLE IF NOT EXISTS refund_policy_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES refund_policies_v2(id) ON DELETE CASCADE,
  changed_by UUID NOT NULL,
  change_type TEXT NOT NULL, -- 'created','updated','archived','activated'
  old_config JSONB,
  new_config JSONB,
  change_details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refund_policy_history_policy ON refund_policy_history(policy_id);
CREATE INDEX IF NOT EXISTS idx_refund_policy_history_created ON refund_policy_history(created_at);

-- 6) Refund requests (customer-initiated)
CREATE TABLE IF NOT EXISTS refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE, -- API idempotency
  payment_id UUID NOT NULL,
  merchant_id UUID NOT NULL,
  sub_account_id UUID,
  customer_id UUID NOT NULL,
  customer_country TEXT, -- ISO2
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'requested', -- 'requested','auto_approved','merchant_approved','ops_approved','denied','processed','failed'
  applied_policy_id UUID REFERENCES refund_policies_v2(id),
  sira_score NUMERIC(5,4), -- 0-1 risk score
  decision_reason TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CHECK (status IN ('requested', 'auto_approved', 'merchant_approved', 'ops_approved', 'denied', 'processed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_idem ON refund_requests(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_refund_requests_payment ON refund_requests(payment_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_merchant ON refund_requests(merchant_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_customer ON refund_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status);
CREATE INDEX IF NOT EXISTS idx_refund_requests_created ON refund_requests(created_at);

-- 7) Refund actions log (immutable audit trail)
CREATE TABLE IF NOT EXISTS refund_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_request_id UUID NOT NULL REFERENCES refund_requests(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL, -- 'customer','merchant','ops','system'
  actor_id UUID,
  action TEXT NOT NULL, -- 'request_created','auto_approve','merchant_approve','ops_approve','deny','processed','failed'
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),

  CHECK (actor_type IN ('customer', 'merchant', 'ops', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_refund_actions_request ON refund_actions(refund_request_id);
CREATE INDEX IF NOT EXISTS idx_refund_actions_actor ON refund_actions(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_refund_actions_created ON refund_actions(created_at);

-- Seed default zones
INSERT INTO zones (code, name, description) VALUES
  ('GLOBAL', 'Global', 'Worldwide coverage'),
  ('CEDEAO', 'CEDEAO/ECOWAS', 'West African Economic Community'),
  ('EU', 'European Union', 'European Union member states'),
  ('US', 'United States', 'United States of America'),
  ('ASEAN', 'ASEAN', 'Association of Southeast Asian Nations')
ON CONFLICT (code) DO NOTHING;

-- Seed CEDEAO countries
INSERT INTO zone_countries (zone_id, country_code)
SELECT z.id, c.code FROM zones z, (VALUES
  ('BJ'),('BF'),('CV'),('CI'),('GM'),('GH'),('GN'),('GW'),('LR'),('ML'),('NE'),('NG'),('SN'),('SL'),('TG')
) AS c(code) WHERE z.code = 'CEDEAO'
ON CONFLICT DO NOTHING;

-- Seed EU countries (sample)
INSERT INTO zone_countries (zone_id, country_code)
SELECT z.id, c.code FROM zones z, (VALUES
  ('FR'),('DE'),('IT'),('ES'),('NL'),('BE'),('AT'),('SE'),('DK'),('FI'),('PT'),('GR'),('IE'),('PL')
) AS c(code) WHERE z.code = 'EU'
ON CONFLICT DO NOTHING;

-- Seed US
INSERT INTO zone_countries (zone_id, country_code)
SELECT z.id, 'US' FROM zones z WHERE z.code = 'US'
ON CONFLICT DO NOTHING;

-- Seed default global policy
INSERT INTO refund_policies_v2 (scope, scope_id, name, description, config, status, priority, created_by) VALUES
  ('global', NULL, 'Default Global Policy', 'Conservative default policy for all merchants', '{
    "reverse_window_minutes": 30,
    "max_refund_amount_absolute": 5000,
    "max_refund_amount_percent": 100,
    "auto_approve": false,
    "require_ops_approval_above": 1000,
    "chargeback_handling": "merchant",
    "allowed_methods": ["wallet", "card", "bank"],
    "ttl_for_customer_request_days": 30,
    "sira_threshold_auto_approve": 0.3
  }', 'active', 100, '00000000-0000-0000-0000-000000000000')
ON CONFLICT DO NOTHING;

-- Comments
COMMENT ON TABLE zones IS 'Regional zones for merchant coverage';
COMMENT ON TABLE zone_countries IS 'Country to zone mapping';
COMMENT ON TABLE merchant_sub_accounts IS 'Merchant sub-accounts for multi-store support';
COMMENT ON TABLE refund_policies_v2 IS 'Hierarchical refund policies with versioning';
COMMENT ON TABLE refund_policy_history IS 'Immutable audit trail of policy changes';
COMMENT ON TABLE refund_requests IS 'Customer-initiated refund requests';
COMMENT ON TABLE refund_actions IS 'Immutable audit trail of refund actions';
