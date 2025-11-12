-- Brique 56 - Chargeback Prevention & Auto-Response Rules
-- Migration: 056_radar.sql
-- 5 tables for fraud prevention and automated dispute response

-- 1) Features store (raw signals per payment)
CREATE TABLE IF NOT EXISTS payment_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL UNIQUE,
  merchant_id UUID NOT NULL,
  customer_id UUID,
  country TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  device_fingerprint JSONB DEFAULT '{}',
  ip_address TEXT,
  geo JSONB DEFAULT '{}', -- {latitude, longitude, city, region, country_code}
  velocity JSONB DEFAULT '{}', -- {count_1h, count_24h, sum_1h, sum_24h, unique_cards_24h}
  agent_info JSONB DEFAULT '{}', -- {agent_id, agent_location, agent_device}
  shipping_info JSONB DEFAULT '{}', -- {country, city, address, tracking_number}
  billing_info JSONB DEFAULT '{}', -- {country, postal_code}
  labels JSONB DEFAULT '{}', -- extra tags
  sira_score NUMERIC(5,2), -- ML fraud score from SIRA
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2) Rules table (Ops configurable)
CREATE TABLE IF NOT EXISTS radar_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT true,
  scope JSONB DEFAULT '{}', -- {countries: ['SN', 'FR'], merchants: [...], min_amount: 100}
  condition TEXT NOT NULL, -- JSONLogic expression stored as text
  action JSONB NOT NULL, -- {type: 'challenge', method: 'otp', params: {...}, require_approval: false}
  priority INTEGER DEFAULT 100, -- lower = higher priority
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3) Rule evaluations log (audit trail)
CREATE TABLE IF NOT EXISTS radar_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL,
  rule_id UUID REFERENCES radar_rules(id) ON DELETE CASCADE,
  triggered BOOLEAN NOT NULL,
  score NUMERIC(6,3), -- numeric score from rule (0-1 or custom)
  explanation JSONB DEFAULT '{}', -- {matched: true, reason: '...', features: {...}}
  acted_at TIMESTAMPTZ DEFAULT now()
);

-- 4) Auto actions table (executed actions)
CREATE TABLE IF NOT EXISTS radar_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL,
  rule_id UUID REFERENCES radar_rules(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL, -- 'challenge', 'hold_payout', 'block', 'notify', 'auto_refute', 'auto_accept'
  params JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending', -- pending|executing|done|failed
  result JSONB DEFAULT '{}', -- execution result (e.g., otp_ref, payout_hold_id)
  executed_by UUID, -- system user or ops user
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5) Templates for evidence (auto-generated)
CREATE TABLE IF NOT EXISTS evidence_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT NOT NULL, -- 'receipt', 'tracking', 'conversation', 'full_package'
  template_json JSONB NOT NULL, -- {sections: [...], fields: [...], includes: [...]}
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_signals_payment ON payment_signals(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_signals_merchant ON payment_signals(merchant_id);
CREATE INDEX IF NOT EXISTS idx_payment_signals_created ON payment_signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_rules_enabled_priority ON radar_rules(enabled, priority) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_radar_eval_payment ON radar_evaluations(payment_id);
CREATE INDEX IF NOT EXISTS idx_radar_eval_rule ON radar_evaluations(rule_id);
CREATE INDEX IF NOT EXISTS idx_radar_actions_payment ON radar_actions(payment_id);
CREATE INDEX IF NOT EXISTS idx_radar_actions_status ON radar_actions(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_radar_actions_created ON radar_actions(created_at DESC);

-- Comments for documentation
COMMENT ON TABLE payment_signals IS 'Feature store for fraud detection signals per payment';
COMMENT ON TABLE radar_rules IS 'Configurable fraud prevention rules with JSONLogic conditions';
COMMENT ON TABLE radar_evaluations IS 'Audit trail of rule evaluations for explainability';
COMMENT ON TABLE radar_actions IS 'Actions taken by the fraud prevention system';
COMMENT ON TABLE evidence_templates IS 'Templates for auto-generating dispute evidence packages';
