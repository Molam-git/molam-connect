-- ============================================================================
-- Brique 48 - Radar Molam (Fraud & Risk Engine)
-- SQL Schema
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Risk Rules (Ops-Configurable)
-- ============================================================================
CREATE TABLE IF NOT EXISTS risk_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL UNIQUE,
  description       TEXT,
  expression        TEXT NOT NULL, -- DSL expression: if(amount>1000&&country!=merchant_country) then review
  priority          INT NOT NULL DEFAULT 100,
  status            TEXT NOT NULL DEFAULT 'active', -- active|disabled|testing
  scope             TEXT NOT NULL DEFAULT 'all', -- all|wallet|connect|shop|eats
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_rules_status ON risk_rules(status);
CREATE INDEX IF NOT EXISTS idx_risk_rules_priority ON risk_rules(priority);

-- ============================================================================
-- Risk Decisions (Every Transaction Evaluation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS risk_decisions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id    UUID NOT NULL,
  transaction_type  TEXT NOT NULL, -- payment|payout|refund|transfer
  merchant_id       UUID,
  user_id           UUID,
  amount            NUMERIC(18,2) NOT NULL,
  currency          TEXT NOT NULL,
  country           TEXT,
  payment_method    TEXT,
  device_id         TEXT,
  ip_address        TEXT,

  -- Decision
  decision          TEXT NOT NULL, -- allow|review|block
  confidence        NUMERIC(5,2), -- 0-100
  matched_rules     TEXT[],
  reason            TEXT NOT NULL,

  -- ML Scoring
  ml_score          NUMERIC(5,2), -- SIRA score 0-100
  ml_factors        JSONB,

  -- Risk Factors
  velocity_1h       INT,
  velocity_24h      INT,
  velocity_7d       INT,
  risk_flags        TEXT[],

  -- Metadata
  metadata          JSONB,
  processing_time_ms INT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_decisions_tx ON risk_decisions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_risk_decisions_merchant ON risk_decisions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_risk_decisions_decision ON risk_decisions(decision);
CREATE INDEX IF NOT EXISTS idx_risk_decisions_created_at ON risk_decisions(created_at);

-- ============================================================================
-- Risk Alerts (High-Priority Flags for Ops)
-- ============================================================================
CREATE TABLE IF NOT EXISTS risk_alerts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id       UUID NOT NULL REFERENCES risk_decisions(id) ON DELETE CASCADE,
  severity          TEXT NOT NULL, -- low|medium|high|critical
  category          TEXT NOT NULL, -- velocity|amount|geolocation|device|pattern
  message           TEXT NOT NULL,

  -- Alert Management
  status            TEXT NOT NULL DEFAULT 'open', -- open|acknowledged|resolved|false_positive
  acknowledged_at   TIMESTAMPTZ,
  acknowledged_by   UUID,
  resolved_at       TIMESTAMPTZ,
  resolved_by       UUID,
  resolution_note   TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_alerts_decision ON risk_alerts(decision_id);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_severity ON risk_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_status ON risk_alerts(status);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_created_at ON risk_alerts(created_at);

-- ============================================================================
-- Device Fingerprints (Track Devices Across Merchants)
-- ============================================================================
CREATE TABLE IF NOT EXISTS device_fingerprints (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id         TEXT NOT NULL UNIQUE,
  user_agents       TEXT[],
  ip_addresses      TEXT[],
  merchant_ids      UUID[],
  transaction_count INT DEFAULT 0,
  first_seen        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen         TIMESTAMPTZ NOT NULL DEFAULT now(),
  risk_score        NUMERIC(5,2) DEFAULT 0,
  is_suspicious     BOOLEAN DEFAULT false,
  metadata          JSONB
);

CREATE INDEX IF NOT EXISTS idx_device_fingerprints_device ON device_fingerprints(device_id);
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_risk ON device_fingerprints(risk_score);

-- ============================================================================
-- Merchant Risk Profiles (Historical Risk Metrics)
-- ============================================================================
CREATE TABLE IF NOT EXISTS merchant_risk_profiles (
  merchant_id       UUID PRIMARY KEY,

  -- Historical Stats
  total_transactions INT DEFAULT 0,
  blocked_count     INT DEFAULT 0,
  reviewed_count    INT DEFAULT 0,
  dispute_count     INT DEFAULT 0,
  chargeback_count  INT DEFAULT 0,

  -- Risk Metrics
  fraud_rate        NUMERIC(5,4) DEFAULT 0, -- fraud / total
  avg_ml_score      NUMERIC(5,2) DEFAULT 50,
  risk_tier         TEXT DEFAULT 'medium', -- low|medium|high|critical

  -- Dates
  last_fraud_at     TIMESTAMPTZ,
  last_updated      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- IP Geolocation Cache (Performance Optimization)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ip_geolocation_cache (
  ip_address        TEXT PRIMARY KEY,
  country_code      TEXT,
  country_name      TEXT,
  city              TEXT,
  latitude          NUMERIC(9,6),
  longitude         NUMERIC(9,6),
  is_vpn            BOOLEAN DEFAULT false,
  is_proxy          BOOLEAN DEFAULT false,
  risk_score        NUMERIC(5,2) DEFAULT 0,
  cached_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ip_geolocation_country ON ip_geolocation_cache(country_code);

-- ============================================================================
-- Rule Test Results (A/B Testing for New Rules)
-- ============================================================================
CREATE TABLE IF NOT EXISTS rule_test_results (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id           UUID NOT NULL REFERENCES risk_rules(id) ON DELETE CASCADE,
  transaction_id    UUID NOT NULL,
  would_match       BOOLEAN NOT NULL,
  would_decision    TEXT, -- allow|review|block
  actual_decision   TEXT,
  tested_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rule_test_results_rule ON rule_test_results(rule_id);

-- ============================================================================
-- Updated At Trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER risk_rules_updated_at BEFORE UPDATE ON risk_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Sample Rules (Seed Data)
-- ============================================================================
INSERT INTO risk_rules (name, description, expression, priority, status) VALUES
  ('High Amount Review', 'Review transactions over $1000', 'if(amount>1000) then review', 10, 'active'),
  ('Critical Amount Block', 'Block transactions over $10000', 'if(amount>10000) then block', 1, 'active'),
  ('Cross-Country Review', 'Review if merchant country differs from IP country', 'if(country!=merchant_country) then review', 20, 'active'),
  ('High Velocity Block', 'Block if >50 transactions in 1 hour', 'if(velocity_1h>50) then block', 5, 'active'),
  ('VPN/Proxy Review', 'Review transactions from VPN/proxy IPs', 'if(is_vpn||is_proxy) then review', 15, 'active')
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE risk_rules IS 'Ops-configurable fraud detection rules with DSL expressions';
COMMENT ON TABLE risk_decisions IS 'Every transaction evaluation with decision, score, and matched rules';
COMMENT ON TABLE risk_alerts IS 'High-priority fraud alerts for Ops review';
COMMENT ON TABLE device_fingerprints IS 'Device tracking across merchants for pattern detection';
COMMENT ON TABLE merchant_risk_profiles IS 'Historical risk metrics per merchant';
