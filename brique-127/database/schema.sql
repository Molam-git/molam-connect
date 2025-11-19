-- ============================================================================
-- Brique 127 — Bank Failover & Routing Logic (SIRA recommended)
-- ============================================================================

-- Routing decisions history
CREATE TABLE IF NOT EXISTS bank_routing_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  origin_module TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  candidate_banks JSONB NOT NULL DEFAULT '[]'::jsonb,
  chosen_bank_profile_id UUID NOT NULL,
  reason TEXT,
  idempotency_key TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_routing_decisions_payout ON bank_routing_decisions(payout_id);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_created ON bank_routing_decisions(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_routing_idempot ON bank_routing_decisions(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Bank health metrics (updated by healthcheck)
CREATE TABLE IF NOT EXISTS bank_health_metrics (
  bank_profile_id UUID PRIMARY KEY,
  last_checked TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('healthy','degraded','down')),
  success_rate NUMERIC(5,4) DEFAULT 1.0,
  avg_latency_ms INTEGER,
  recent_failures INTEGER DEFAULT 0,
  last_error TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Raw health logs (per probe)
CREATE TABLE IF NOT EXISTS bank_health_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_profile_id UUID NOT NULL REFERENCES bank_profiles(id) ON DELETE CASCADE,
  latency_ms INTEGER,
  success_rate NUMERIC(5,4),
  checked_at TIMESTAMPTZ DEFAULT now(),
  anomalies JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_bank_health_logs_bank ON bank_health_logs(bank_profile_id);
CREATE INDEX IF NOT EXISTS idx_bank_health_logs_checked ON bank_health_logs(checked_at DESC);

-- Predictive health (SIRA)
CREATE TABLE IF NOT EXISTS bank_health_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id UUID REFERENCES bank_profiles(id) ON DELETE CASCADE,
  predicted_risk_score NUMERIC CHECK (predicted_risk_score >= 0 AND predicted_risk_score <= 1),
  predicted_success_rate NUMERIC CHECK (predicted_success_rate >= 0 AND predicted_success_rate <= 1),
  prediction_window INTERVAL NOT NULL,
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bank_health_predictions_bank_valid
  ON bank_health_predictions(bank_id, valid_until DESC);

-- Circuit breaker state per bank
CREATE TABLE IF NOT EXISTS bank_circuit_breakers (
  bank_profile_id UUID PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'closed' CHECK (state IN ('closed','open','half_open')),
  opened_at TIMESTAMPTZ,
  next_probe_at TIMESTAMPTZ,
  failure_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ops manual routing adjustments
CREATE TABLE IF NOT EXISTS bank_routing_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_profile_id UUID NOT NULL,
  scope TEXT NOT NULL,
  weight NUMERIC(6,3) DEFAULT 1.0,
  expires_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_routing_adjust_scope ON bank_routing_adjustments(scope);
CREATE INDEX IF NOT EXISTS idx_routing_adjust_bank ON bank_routing_adjustments(bank_profile_id);

-- Payout confirmations (settlement confirmations)
CREATE TABLE IF NOT EXISTS payout_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL,
  confirmed_at TIMESTAMPTZ DEFAULT now(),
  bank_ref TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_payout_confirmations ON payout_confirmations(payout_id);
