-- =====================================================================
-- Brique 108: PaymentIntent & 3DS2 Orchestration
-- =====================================================================
-- Industrial-grade payment orchestration with 3DS2, OTP fallback,
-- idempotency, audit trail, and webhook integration
-- =====================================================================

-- Payment Intents - Core payment contract
CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE, -- Idempotency key from client
  merchant_id UUID NOT NULL,
  payer_user_id UUID,
  amount NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'XOF',
  status TEXT NOT NULL DEFAULT 'requires_payment_method',
  -- Status flow: requires_payment_method → requires_action → requires_capture → succeeded/canceled/failed
  payment_method_types TEXT[] NOT NULL DEFAULT ARRAY['card','wallet','bank'],
  selected_payment_method JSONB, -- Tokenized card, wallet ref, etc.
  capture_method TEXT DEFAULT 'automatic', -- 'automatic' | 'manual'
  description TEXT,
  metadata JSONB DEFAULT '{}',
  client_secret TEXT UNIQUE, -- Secret for client-side operations
  last_payment_error JSONB, -- Last error details
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_status CHECK (status IN (
    'requires_payment_method',
    'requires_action',
    'requires_capture',
    'processing',
    'succeeded',
    'canceled',
    'failed'
  )),
  CONSTRAINT valid_capture_method CHECK (capture_method IN ('automatic', 'manual'))
);

CREATE INDEX idx_payment_intents_merchant ON payment_intents(merchant_id);
CREATE INDEX idx_payment_intents_payer ON payment_intents(payer_user_id);
CREATE INDEX idx_payment_intents_status ON payment_intents(status);
CREATE INDEX idx_payment_intents_external_id ON payment_intents(external_id);
CREATE INDEX idx_payment_intents_created ON payment_intents(created_at DESC);

-- Charges - Final money movement records
CREATE TABLE IF NOT EXISTS charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id UUID NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  amount NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'XOF',
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT, -- 'stripe', 'paystack', 'wave', 'wallet_internal', etc.
  provider_ref TEXT, -- Provider/connector reference
  provider_response JSONB, -- Full provider response
  fee_molam NUMERIC(18,2) DEFAULT 0,
  fee_provider NUMERIC(18,2) DEFAULT 0,
  net_amount NUMERIC(18,2), -- amount - fees
  captured_at TIMESTAMPTZ,
  refunded_amount NUMERIC(18,2) DEFAULT 0,
  dispute_status TEXT, -- null, 'warning_needs_response', 'under_review', 'won', 'lost'
  failure_code TEXT,
  failure_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_charge_status CHECK (status IN (
    'pending',
    'authorized',
    'captured',
    'refunded',
    'partially_refunded',
    'failed',
    'disputed'
  ))
);

CREATE INDEX idx_charges_payment_intent ON charges(payment_intent_id);
CREATE INDEX idx_charges_status ON charges(status);
CREATE INDEX idx_charges_provider_ref ON charges(provider_ref);
CREATE INDEX idx_charges_created ON charges(created_at DESC);

-- 3DS Sessions - 3D Secure 2.0 authentication sessions
CREATE TABLE IF NOT EXISTS three_ds_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id UUID NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  method TEXT NOT NULL DEFAULT '3ds2', -- '3ds2' | '3ds1' (fallback)
  version TEXT, -- '2.1.0', '2.2.0', etc.
  ds_provider TEXT, -- Directory Server provider (Visa, Mastercard, Amex)
  acs_url TEXT, -- Access Control Server URL
  status TEXT NOT NULL DEFAULT 'initialized',
  trans_status TEXT, -- Transaction status from ACS (Y, N, U, A, C, R)
  client_data JSONB, -- Data for client SDK (creq, threeDSServerTransID, etc.)
  challenge_data JSONB, -- Challenge window data
  result JSONB, -- ACS authentication result
  eci TEXT, -- Electronic Commerce Indicator
  cavv TEXT, -- Cardholder Authentication Verification Value
  xid TEXT, -- Transaction identifier
  authentication_value TEXT, -- Authentication value from 3DS
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_3ds_status CHECK (status IN (
    'initialized',
    'challenge_required',
    'challenge_in_progress',
    'challenge_succeeded',
    'challenge_failed',
    'authenticated',
    'not_authenticated',
    'attempted',
    'failed',
    'expired',
    'fallback_required'
  ))
);

CREATE INDEX idx_3ds_sessions_payment_intent ON three_ds_sessions(payment_intent_id);
CREATE INDEX idx_3ds_sessions_status ON three_ds_sessions(status);
CREATE INDEX idx_3ds_sessions_created ON three_ds_sessions(created_at DESC);

-- Auth Decisions - SIRA integration for authentication decisions
CREATE TABLE IF NOT EXISTS auth_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id UUID NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  recommended_method TEXT NOT NULL, -- '3ds2', 'otp_sms', 'otp_voice', 'biometric', 'none'
  risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level TEXT, -- 'low', 'medium', 'high', 'critical'
  sira_payload JSONB NOT NULL, -- Full SIRA request/response
  rules_triggered TEXT[], -- Array of rule IDs that triggered
  exemption_applied TEXT, -- 'low_value', 'trusted_beneficiary', 'corporate_card', etc.
  sca_required BOOLEAN DEFAULT true, -- Strong Customer Authentication required
  fallback_chain TEXT[] DEFAULT ARRAY['3ds2','otp_sms','otp_voice'], -- Fallback order
  decision_latency_ms INTEGER, -- Time taken for SIRA decision
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auth_decisions_payment_intent ON auth_decisions(payment_intent_id);
CREATE INDEX idx_auth_decisions_risk_score ON auth_decisions(risk_score);
CREATE INDEX idx_auth_decisions_created ON auth_decisions(created_at DESC);

-- Payment State Transitions - Audit trail for all state changes
CREATE TABLE IF NOT EXISTS payment_state_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id UUID NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  reason TEXT, -- 'user_action', 'automatic', '3ds_succeeded', 'capture_failed', etc.
  actor_type TEXT, -- 'system', 'user', 'merchant', 'admin'
  actor_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_transitions_pi ON payment_state_transitions(payment_intent_id);
CREATE INDEX idx_payment_transitions_created ON payment_state_transitions(created_at DESC);

-- Refunds - Payment refund records
CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id UUID NOT NULL REFERENCES charges(id) ON DELETE CASCADE,
  payment_intent_id UUID NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'XOF',
  reason TEXT, -- 'duplicate', 'fraudulent', 'requested_by_customer', etc.
  status TEXT NOT NULL DEFAULT 'pending',
  provider_ref TEXT, -- Provider refund reference
  provider_response JSONB,
  failure_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_refund_status CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled'))
);

CREATE INDEX idx_refunds_charge ON refunds(charge_id);
CREATE INDEX idx_refunds_payment_intent ON refunds(payment_intent_id);
CREATE INDEX idx_refunds_status ON refunds(status);
CREATE INDEX idx_refunds_created ON refunds(created_at DESC);

-- Payment Method Tokens - Secure storage for tokenized payment methods
CREATE TABLE IF NOT EXISTS payment_method_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL, -- 'card', 'wallet', 'bank_account'
  provider TEXT NOT NULL, -- 'stripe', 'internal', etc.
  provider_token TEXT NOT NULL, -- Token from provider
  last4 TEXT, -- Last 4 digits for display
  brand TEXT, -- 'visa', 'mastercard', 'mtn_mobile_money', etc.
  exp_month INTEGER,
  exp_year INTEGER,
  fingerprint TEXT, -- Unique identifier for deduplication
  is_default BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_method_tokens_user ON payment_method_tokens(user_id);
CREATE INDEX idx_payment_method_tokens_fingerprint ON payment_method_tokens(fingerprint);

-- Payment Metrics - Real-time metrics for monitoring
CREATE TABLE IF NOT EXISTS payment_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type TEXT NOT NULL, -- 'intent_created', 'auth_required', '3ds_challenge', 'capture_succeeded', etc.
  payment_intent_id UUID REFERENCES payment_intents(id) ON DELETE SET NULL,
  merchant_id UUID,
  value NUMERIC(18,2), -- Amount or count
  currency TEXT,
  latency_ms INTEGER, -- Latency for operations
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_metrics_type ON payment_metrics(metric_type);
CREATE INDEX idx_payment_metrics_merchant ON payment_metrics(merchant_id);
CREATE INDEX idx_payment_metrics_recorded ON payment_metrics(recorded_at DESC);

-- Payment Webhooks Queue - Outbound webhooks to merchants
CREATE TABLE IF NOT EXISTS payment_webhooks_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  event_type TEXT NOT NULL, -- 'payment_intent.created', 'payment_intent.succeeded', etc.
  payment_intent_id UUID REFERENCES payment_intents(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_webhook_status CHECK (status IN ('pending', 'sent', 'failed', 'abandoned'))
);

CREATE INDEX idx_payment_webhooks_merchant ON payment_webhooks_queue(merchant_id);
CREATE INDEX idx_payment_webhooks_status ON payment_webhooks_queue(status);
CREATE INDEX idx_payment_webhooks_next_retry ON payment_webhooks_queue(next_retry_at) WHERE status = 'pending';

-- Comments
COMMENT ON TABLE payment_intents IS 'Payment Intent - Core payment contract (Stripe-like)';
COMMENT ON TABLE charges IS 'Charges - Actual money movement records';
COMMENT ON TABLE three_ds_sessions IS '3D Secure 2.0 authentication sessions';
COMMENT ON TABLE auth_decisions IS 'SIRA-driven authentication decisions';
COMMENT ON TABLE payment_state_transitions IS 'Audit trail for payment state changes';
COMMENT ON TABLE refunds IS 'Payment refund records';
COMMENT ON TABLE payment_method_tokens IS 'Tokenized payment methods';
COMMENT ON TABLE payment_metrics IS 'Real-time payment metrics';
COMMENT ON TABLE payment_webhooks_queue IS 'Outbound webhooks to merchants';

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_payment_intents_updated_at BEFORE UPDATE ON payment_intents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_charges_updated_at BEFORE UPDATE ON charges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_three_ds_sessions_updated_at BEFORE UPDATE ON three_ds_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_refunds_updated_at BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_method_tokens_updated_at BEFORE UPDATE ON payment_method_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_webhooks_queue_updated_at BEFORE UPDATE ON payment_webhooks_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
