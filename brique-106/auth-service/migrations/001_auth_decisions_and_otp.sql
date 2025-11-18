-- ============================================================================
-- Brique 106bis - Adaptive 3DS & OTP UX (SIRA)
-- Migration: Auth Decisions & OTP Management
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- Auth Decisions Table
-- Logs all authentication method decisions for audit and analytics
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Payment & User Context
  payment_id UUID NOT NULL,
  user_id UUID,
  merchant_id UUID,

  -- Geographic & Device Context
  country TEXT NOT NULL,
  device_fingerprint TEXT,
  device_ip INET,
  device_ua TEXT,

  -- Risk Assessment
  risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_factors JSONB DEFAULT '[]'::jsonb,

  -- Decision
  recommended_method TEXT NOT NULL CHECK (recommended_method IN ('3ds2', '3ds1', 'otp_sms', 'otp_voice', 'biometric', 'none')),
  final_method TEXT CHECK (final_method IN ('3ds2', '3ds1', 'otp_sms', 'otp_voice', 'biometric', 'none')),
  fallback_reason TEXT,

  -- Additional Context
  amount DECIMAL(19, 4),
  currency TEXT,
  bin TEXT,
  card_supports_3ds2 BOOLEAN,
  decision_payload JSONB DEFAULT '{}'::jsonb,

  -- Outcome Tracking
  auth_successful BOOLEAN,
  auth_completed_at TIMESTAMPTZ,
  auth_duration_ms INTEGER,
  abandonment BOOLEAN DEFAULT FALSE,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Indexes for analytics
  CONSTRAINT fk_payment FOREIGN KEY (payment_id) REFERENCES payment_intents(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_auth_decisions_payment_id ON auth_decisions(payment_id);
CREATE INDEX idx_auth_decisions_user_id ON auth_decisions(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_auth_decisions_created_at ON auth_decisions(created_at DESC);
CREATE INDEX idx_auth_decisions_country ON auth_decisions(country);
CREATE INDEX idx_auth_decisions_recommended_method ON auth_decisions(recommended_method);
CREATE INDEX idx_auth_decisions_risk_score ON auth_decisions(risk_score);

-- Analytics index
CREATE INDEX idx_auth_decisions_analytics ON auth_decisions(country, recommended_method, auth_successful, created_at)
  WHERE auth_successful IS NOT NULL;

-- ============================================================================
-- OTP Requests Table
-- Manages OTP generation, delivery, and verification
-- ============================================================================

CREATE TABLE IF NOT EXISTS otp_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User Context
  user_id UUID,
  payment_id UUID,
  phone TEXT NOT NULL,
  phone_country_code TEXT,

  -- OTP Details
  method TEXT NOT NULL CHECK (method IN ('sms', 'voice')),
  code_hash TEXT NOT NULL, -- Argon2 hash
  length INTEGER NOT NULL DEFAULT 6,

  -- Lifecycle
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,

  -- Security
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  ip_address INET,
  device_fingerprint TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'verified', 'expired', 'failed', 'rate_limited')),

  -- Delivery Tracking
  provider TEXT, -- 'twilio', 'orange_sms', 'local_voice', etc.
  provider_message_id TEXT,
  delivery_status TEXT, -- 'queued', 'sent', 'delivered', 'failed'
  delivery_error TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_otp_payment FOREIGN KEY (payment_id) REFERENCES payment_intents(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_otp_requests_phone ON otp_requests(phone, status, created_at DESC);
CREATE INDEX idx_otp_requests_user_id ON otp_requests(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_otp_requests_payment_id ON otp_requests(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX idx_otp_requests_status ON otp_requests(status, created_at);
CREATE INDEX idx_otp_requests_expires_at ON otp_requests(expires_at) WHERE status = 'pending';

-- ============================================================================
-- OTP Rate Limiting Table
-- Track OTP requests per phone/IP to prevent abuse
-- ============================================================================

CREATE TABLE IF NOT EXISTS otp_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifier
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('phone', 'ip', 'user_id')),
  identifier_value TEXT NOT NULL,

  -- Rate Limit Window
  window_start TIMESTAMPTZ NOT NULL,
  window_duration_seconds INTEGER NOT NULL DEFAULT 3600, -- 1 hour default

  -- Counts
  request_count INTEGER NOT NULL DEFAULT 1,
  max_requests INTEGER NOT NULL DEFAULT 5,

  -- Status
  blocked_until TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_rate_limit UNIQUE (identifier_type, identifier_value, window_start)
);

CREATE INDEX idx_otp_rate_limits_identifier ON otp_rate_limits(identifier_type, identifier_value, window_start);
CREATE INDEX idx_otp_rate_limits_blocked ON otp_rate_limits(blocked_until) WHERE blocked_until IS NOT NULL;

-- ============================================================================
-- Device Trust Table
-- "Remember device" functionality for reduced friction
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_trust (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User & Device
  user_id UUID NOT NULL,
  device_fingerprint TEXT NOT NULL,
  device_name TEXT,

  -- Trust Level
  trust_level TEXT NOT NULL DEFAULT 'new' CHECK (trust_level IN ('new', 'trusted', 'suspicious', 'blocked')),
  trust_score INTEGER DEFAULT 0 CHECK (trust_score >= 0 AND trust_score <= 100),

  -- Authentication History
  first_auth_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_auth_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  successful_auths INTEGER NOT NULL DEFAULT 0,
  failed_auths INTEGER NOT NULL DEFAULT 0,

  -- Device Details
  device_type TEXT, -- 'mobile', 'desktop', 'tablet'
  os TEXT,
  browser TEXT,
  ip_addresses JSONB DEFAULT '[]'::jsonb,

  -- Consent
  user_consented BOOLEAN NOT NULL DEFAULT FALSE,
  consented_at TIMESTAMPTZ,

  -- Lifecycle
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_user_device UNIQUE (user_id, device_fingerprint)
);

CREATE INDEX idx_device_trust_user_id ON device_trust(user_id);
CREATE INDEX idx_device_trust_device_fingerprint ON device_trust(device_fingerprint);
CREATE INDEX idx_device_trust_trust_level ON device_trust(trust_level);
CREATE INDEX idx_device_trust_last_auth ON device_trust(last_auth_at DESC);

-- ============================================================================
-- 3DS2 Challenges Table
-- Track 3DS2 challenge flows
-- ============================================================================

CREATE TABLE IF NOT EXISTS threeds_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Payment Context
  payment_id UUID NOT NULL,
  auth_decision_id UUID REFERENCES auth_decisions(id),

  -- 3DS Details
  threeds_version TEXT NOT NULL CHECK (threeds_version IN ('2.0', '2.1', '2.2', '1.0')),
  acs_url TEXT,
  challenge_method TEXT, -- 'frictionless', 'challenge'

  -- Challenge Data
  challenge_request JSONB,
  challenge_response JSONB,

  -- Status
  status TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'challenged', 'authenticated', 'failed', 'error', 'timeout')),

  -- Result
  transaction_status TEXT, -- 'Y', 'N', 'A', 'U', etc. (EMVCo codes)
  eci TEXT, -- Electronic Commerce Indicator
  cavv TEXT, -- Cardholder Authentication Verification Value

  -- Timing
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Error Tracking
  error_code TEXT,
  error_message TEXT,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_threeds_payment FOREIGN KEY (payment_id) REFERENCES payment_intents(id) ON DELETE CASCADE
);

CREATE INDEX idx_threeds_challenges_payment_id ON threeds_challenges(payment_id);
CREATE INDEX idx_threeds_challenges_status ON threeds_challenges(status, created_at);
CREATE INDEX idx_threeds_challenges_auth_decision ON threeds_challenges(auth_decision_id) WHERE auth_decision_id IS NOT NULL;

-- ============================================================================
-- Auth Method Performance Metrics (Materialized View)
-- Aggregated metrics for decision optimization
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS auth_method_performance AS
SELECT
  country,
  recommended_method,
  DATE_TRUNC('hour', created_at) AS hour,
  COUNT(*) AS total_decisions,
  COUNT(*) FILTER (WHERE auth_successful = TRUE) AS successful_auths,
  COUNT(*) FILTER (WHERE auth_successful = FALSE) AS failed_auths,
  COUNT(*) FILTER (WHERE abandonment = TRUE) AS abandonments,
  AVG(auth_duration_ms) AS avg_duration_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY auth_duration_ms) AS p95_duration_ms,
  AVG(risk_score) AS avg_risk_score
FROM auth_decisions
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND auth_successful IS NOT NULL
GROUP BY country, recommended_method, DATE_TRUNC('hour', created_at);

CREATE UNIQUE INDEX idx_auth_performance_unique ON auth_method_performance(country, recommended_method, hour);

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_auth_performance()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY auth_method_performance;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Trigger: Update timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auth_decisions_updated_at BEFORE UPDATE ON auth_decisions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER otp_requests_updated_at BEFORE UPDATE ON otp_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER device_trust_updated_at BEFORE UPDATE ON device_trust
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER threeds_challenges_updated_at BEFORE UPDATE ON threeds_challenges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Cleanup Functions
-- Remove expired OTP requests and old rate limit entries
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS void AS $$
BEGIN
  UPDATE otp_requests
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < now();

  DELETE FROM otp_requests
  WHERE status = 'expired'
    AND created_at < now() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM otp_rate_limits
  WHERE window_start < now() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Sample Data (for testing)
-- ============================================================================

-- Insert sample auth decision
INSERT INTO auth_decisions (
  payment_id,
  user_id,
  country,
  device_fingerprint,
  risk_score,
  recommended_method,
  final_method,
  amount,
  currency,
  bin,
  card_supports_3ds2,
  auth_successful
) VALUES (
  gen_random_uuid(),
  gen_random_uuid(),
  'SN',
  'fp_test_123',
  72,
  '3ds2',
  '3ds2',
  10000,
  'XOF',
  '424242',
  TRUE,
  TRUE
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- Grants (adjust based on your roles)
-- ============================================================================

-- GRANT SELECT, INSERT, UPDATE ON auth_decisions TO molam_app;
-- GRANT SELECT, INSERT, UPDATE ON otp_requests TO molam_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON otp_rate_limits TO molam_app;
-- GRANT SELECT, INSERT, UPDATE ON device_trust TO molam_app;
-- GRANT SELECT, INSERT, UPDATE ON threeds_challenges TO molam_app;
-- GRANT SELECT ON auth_method_performance TO molam_app;

-- ============================================================================
-- End of Migration
-- ============================================================================
