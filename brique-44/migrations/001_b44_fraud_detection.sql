/**
 * Brique 44 - Anti-fraude Temps Réel
 * Migration 001: Complete Schema
 *
 * Tables: fraud_signals, fraud_decisions, fraud_reviews, fraud_rules, blacklist
 */

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

--------------------------
-- 1. Fraud Signals
--------------------------
-- Multi-source signals collected per transaction
CREATE TABLE IF NOT EXISTS fraud_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_id UUID NOT NULL,                     -- Reference to payment intent/transaction
  user_id UUID NOT NULL,                    -- Molam ID user
  merchant_id UUID,                         -- Merchant account
  source TEXT NOT NULL,                     -- 'molam_id'|'connect'|'network'|'sira'|'manual'
  signal_type TEXT NOT NULL,                -- 'device'|'ip'|'kyc'|'velocity'|'geolocation'|'behavior'
  signal_value JSONB NOT NULL,              -- Flexible signal data
  risk_contribution INT DEFAULT 0,          -- Points added to risk score (0-100)
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT signals_source_check CHECK (source IN ('molam_id', 'connect', 'network', 'sira', 'manual')),
  CONSTRAINT signals_type_check CHECK (signal_type IN (
    'device', 'ip', 'kyc', 'velocity', 'geolocation', 'behavior',
    'amount', 'currency', 'card', 'wallet', 'bank', 'blacklist'
  ))
);

CREATE INDEX IF NOT EXISTS idx_fraud_signals_txn ON fraud_signals(txn_id);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_user ON fraud_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_merchant ON fraud_signals(merchant_id);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_created ON fraud_signals(created_at DESC);

--------------------------
-- 2. Fraud Decisions
--------------------------
-- Final decision per transaction
CREATE TABLE IF NOT EXISTS fraud_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_id UUID NOT NULL UNIQUE,             -- One decision per transaction
  user_id UUID NOT NULL,
  merchant_id UUID,
  decision TEXT NOT NULL,                   -- 'allow'|'review'|'block'
  score INT NOT NULL,                       -- Risk score 0-100
  sira_score INT,                           -- SIRA AI score (if available)
  confidence NUMERIC(3,2) DEFAULT 0.80,     -- Decision confidence (0-1)
  reason JSONB NOT NULL,                    -- Array of reason codes
  decided_by TEXT NOT NULL DEFAULT 'auto',  -- 'auto'|'ops'|'override'
  decided_by_user UUID,                     -- If manual override
  expires_at TIMESTAMPTZ,                   -- For review decisions
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT decisions_decision_check CHECK (decision IN ('allow', 'review', 'block')),
  CONSTRAINT decisions_score_range CHECK (score >= 0 AND score <= 100)
);

CREATE INDEX IF NOT EXISTS idx_fraud_decisions_txn ON fraud_decisions(txn_id);
CREATE INDEX IF NOT EXISTS idx_fraud_decisions_user ON fraud_decisions(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_decisions_merchant ON fraud_decisions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_fraud_decisions_decision ON fraud_decisions(decision);
CREATE INDEX IF NOT EXISTS idx_fraud_decisions_score ON fraud_decisions(score DESC);

--------------------------
-- 3. Fraud Reviews
--------------------------
-- Manual review queue for 'review' decisions
CREATE TABLE IF NOT EXISTS fraud_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_id UUID NOT NULL REFERENCES fraud_decisions(txn_id) ON DELETE CASCADE,
  assigned_to UUID,                         -- fraud_ops agent
  status TEXT NOT NULL DEFAULT 'pending',   -- 'pending'|'in_progress'|'reviewed'|'escalated'
  priority TEXT NOT NULL DEFAULT 'normal',  -- 'low'|'normal'|'high'|'critical'
  notes TEXT,                               -- Ops notes
  final_decision TEXT,                      -- 'allow'|'block' after review
  reviewed_by UUID,                         -- User who reviewed
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT reviews_status_check CHECK (status IN ('pending', 'in_progress', 'reviewed', 'escalated')),
  CONSTRAINT reviews_priority_check CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  CONSTRAINT reviews_final_decision_check CHECK (final_decision IS NULL OR final_decision IN ('allow', 'block'))
);

CREATE INDEX IF NOT EXISTS idx_fraud_reviews_txn ON fraud_reviews(txn_id);
CREATE INDEX IF NOT EXISTS idx_fraud_reviews_assigned ON fraud_reviews(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fraud_reviews_status ON fraud_reviews(status) WHERE status IN ('pending', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_fraud_reviews_priority ON fraud_reviews(priority, created_at DESC);

--------------------------
-- 4. Fraud Rules
--------------------------
-- Configurable rules for automatic fraud detection
CREATE TABLE IF NOT EXISTS fraud_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT NOT NULL,                  -- 'threshold'|'velocity'|'geolocation'|'blacklist'|'custom'
  conditions JSONB NOT NULL,                -- Rule conditions (amount, country, etc.)
  action TEXT NOT NULL,                     -- 'allow'|'review'|'block'
  score_adjustment INT NOT NULL DEFAULT 0,  -- Points to add/subtract
  enabled BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 100,        -- Higher priority rules evaluated first
  merchant_id UUID,                         -- NULL = global rule, UUID = merchant-specific
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT rules_type_check CHECK (rule_type IN ('threshold', 'velocity', 'geolocation', 'blacklist', 'custom')),
  CONSTRAINT rules_action_check CHECK (action IN ('allow', 'review', 'block'))
);

CREATE INDEX IF NOT EXISTS idx_fraud_rules_enabled ON fraud_rules(enabled, priority DESC) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_fraud_rules_merchant ON fraud_rules(merchant_id);

--------------------------
-- 5. Blacklist
--------------------------
-- Global and merchant-specific blacklists
CREATE TABLE IF NOT EXISTS fraud_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_type TEXT NOT NULL,                  -- 'ip'|'card_bin'|'email'|'device'|'user'
  value TEXT NOT NULL,                      -- The blacklisted value
  reason TEXT NOT NULL,                     -- Why it's blacklisted
  severity TEXT NOT NULL DEFAULT 'high',    -- 'low'|'medium'|'high'|'critical'
  merchant_id UUID,                         -- NULL = global, UUID = merchant-specific
  expires_at TIMESTAMPTZ,                   -- NULL = permanent
  added_by UUID NOT NULL,                   -- User who added
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT blacklist_type_check CHECK (list_type IN ('ip', 'card_bin', 'email', 'device', 'user', 'asn')),
  CONSTRAINT blacklist_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_fraud_blacklist_type_value ON fraud_blacklist(list_type, value);
CREATE INDEX IF NOT EXISTS idx_fraud_blacklist_merchant ON fraud_blacklist(merchant_id);
CREATE INDEX IF NOT EXISTS idx_fraud_blacklist_expires ON fraud_blacklist(expires_at) WHERE expires_at IS NOT NULL;

--------------------------
-- 6. Fraud Metrics (Stats)
--------------------------
-- Aggregated metrics for dashboards
CREATE TABLE IF NOT EXISTS fraud_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date DATE NOT NULL,
  merchant_id UUID,                         -- NULL = global
  total_transactions INT NOT NULL DEFAULT 0,
  total_allowed INT NOT NULL DEFAULT 0,
  total_reviewed INT NOT NULL DEFAULT 0,
  total_blocked INT NOT NULL DEFAULT 0,
  avg_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  false_positives INT NOT NULL DEFAULT 0,   -- Blocked but should have been allowed
  false_negatives INT NOT NULL DEFAULT 0,   -- Allowed but was fraud
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(metric_date, merchant_id)
);

CREATE INDEX IF NOT EXISTS idx_fraud_metrics_date ON fraud_metrics(metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_metrics_merchant ON fraud_metrics(merchant_id);

--------------------------
-- 7. Audit Logs
--------------------------
CREATE TABLE IF NOT EXISTS fraud_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_id UUID,
  user_id UUID,
  actor TEXT NOT NULL,                      -- 'system'|'fraud_ops'|'auditor'
  action TEXT NOT NULL,                     -- 'decision_made'|'override'|'blacklist_add'|'rule_change'
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fraud_audit_txn ON fraud_audit_logs(txn_id);
CREATE INDEX IF NOT EXISTS idx_fraud_audit_created ON fraud_audit_logs(created_at DESC);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_fraud_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_fraud_decisions_updated_at
  BEFORE UPDATE ON fraud_decisions
  FOR EACH ROW EXECUTE FUNCTION update_fraud_timestamp();

CREATE TRIGGER trigger_fraud_reviews_updated_at
  BEFORE UPDATE ON fraud_reviews
  FOR EACH ROW EXECUTE FUNCTION update_fraud_timestamp();

CREATE TRIGGER trigger_fraud_rules_updated_at
  BEFORE UPDATE ON fraud_rules
  FOR EACH ROW EXECUTE FUNCTION update_fraud_timestamp();

-- Comments
COMMENT ON TABLE fraud_signals IS 'Multi-source fraud signals per transaction';
COMMENT ON TABLE fraud_decisions IS 'Final fraud decision per transaction (allow/review/block)';
COMMENT ON TABLE fraud_reviews IS 'Manual review queue for suspicious transactions';
COMMENT ON TABLE fraud_rules IS 'Configurable fraud detection rules';
COMMENT ON TABLE fraud_blacklist IS 'Global and merchant-specific blacklists';
COMMENT ON TABLE fraud_metrics IS 'Aggregated fraud metrics for dashboards';
COMMENT ON TABLE fraud_audit_logs IS 'Immutable audit trail for all fraud operations';
