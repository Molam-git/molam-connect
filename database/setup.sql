-- ============================================================================
-- MOLAM CONNECT - Consolidated Database Setup
-- Combines all briques schemas into one database
-- ============================================================================

-- Create database
-- Run this as postgres superuser:
-- CREATE DATABASE molam_connect;
-- \c molam_connect

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- CORE TABLES (Payment Intents, Customers, etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  phone TEXT,
  country TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'requires_action', 'processing', 'succeeded', 'failed', 'canceled')),

  -- Customer
  customer_id UUID REFERENCES customers(id),
  customer_email TEXT,

  -- Payment Method
  payment_method TEXT, -- 'card', 'mobile_money', 'bank_transfer'
  payment_method_id UUID,

  -- Authentication
  auth_decision_id UUID, -- Link to auth_decisions table
  auth_method TEXT, -- '3ds2', 'otp_sms', 'none'
  auth_status TEXT, -- 'pending', 'completed', 'failed'

  -- Metadata
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  client_secret TEXT UNIQUE,

  -- Merchant
  merchant_id UUID,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  succeeded_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id),
  type TEXT NOT NULL, -- 'card', 'mobile_money', 'bank_account'

  -- Card details (tokenized)
  card_brand TEXT,
  card_last4 TEXT,
  card_exp_month INTEGER,
  card_exp_year INTEGER,
  card_fingerprint TEXT,

  -- Mobile Money
  mobile_money_provider TEXT,
  mobile_money_number TEXT,

  -- Status
  is_default BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'active',

  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- AUTH DECISIONS & OTP (Brique 106bis)
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES payment_intents(id) ON DELETE CASCADE,
  user_id UUID,
  merchant_id UUID,

  country TEXT NOT NULL,
  device_fingerprint TEXT,
  device_ip INET,
  device_ua TEXT,

  risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_factors JSONB DEFAULT '[]'::jsonb,

  recommended_method TEXT NOT NULL CHECK (recommended_method IN ('3ds2', '3ds1', 'otp_sms', 'otp_voice', 'biometric', 'none')),
  final_method TEXT CHECK (final_method IN ('3ds2', '3ds1', 'otp_sms', 'otp_voice', 'biometric', 'none')),
  fallback_reason TEXT,

  amount DECIMAL(19, 4),
  currency TEXT,
  bin TEXT,
  card_supports_3ds2 BOOLEAN,
  decision_payload JSONB DEFAULT '{}'::jsonb,

  auth_successful BOOLEAN,
  auth_completed_at TIMESTAMPTZ,
  auth_duration_ms INTEGER,
  abandonment BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS otp_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  payment_id UUID REFERENCES payment_intents(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  phone_country_code TEXT,

  method TEXT NOT NULL CHECK (method IN ('sms', 'voice')),
  code_hash TEXT NOT NULL,
  length INTEGER NOT NULL DEFAULT 6,

  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,

  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  ip_address INET,
  device_fingerprint TEXT,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'verified', 'expired', 'failed', 'rate_limited')),

  provider TEXT,
  provider_message_id TEXT,
  delivery_status TEXT,
  delivery_error TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_trust (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  device_fingerprint TEXT NOT NULL,
  device_name TEXT,

  trust_level TEXT NOT NULL DEFAULT 'new' CHECK (trust_level IN ('new', 'trusted', 'suspicious', 'blocked')),
  trust_score INTEGER DEFAULT 0 CHECK (trust_score >= 0 AND trust_score <= 100),

  first_auth_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_auth_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  successful_auths INTEGER NOT NULL DEFAULT 0,
  failed_auths INTEGER NOT NULL DEFAULT 0,

  device_type TEXT,
  os TEXT,
  browser TEXT,
  ip_addresses JSONB DEFAULT '[]'::jsonb,

  user_consented BOOLEAN NOT NULL DEFAULT FALSE,
  consented_at TIMESTAMPTZ,

  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_user_device UNIQUE (user_id, device_fingerprint)
);

-- ============================================================================
-- IDEMPOTENCY (Brique 104, 105)
-- ============================================================================

CREATE TABLE IF NOT EXISTS server_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT unique_idempotency_key UNIQUE (idempotency_key, request_hash)
);

-- ============================================================================
-- WEBHOOKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_event_id UUID REFERENCES webhook_events(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'delivered', 'failed'
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,
  response_status INTEGER,
  response_body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Customers
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_created_at ON customers(created_at DESC);

-- Payment Intents
CREATE INDEX idx_payment_intents_customer_id ON payment_intents(customer_id);
CREATE INDEX idx_payment_intents_status ON payment_intents(status);
CREATE INDEX idx_payment_intents_created_at ON payment_intents(created_at DESC);
CREATE INDEX idx_payment_intents_client_secret ON payment_intents(client_secret) WHERE client_secret IS NOT NULL;

-- Payment Methods
CREATE INDEX idx_payment_methods_customer_id ON payment_methods(customer_id);
CREATE INDEX idx_payment_methods_type ON payment_methods(type);

-- Auth Decisions
CREATE INDEX idx_auth_decisions_payment_id ON auth_decisions(payment_id);
CREATE INDEX idx_auth_decisions_user_id ON auth_decisions(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_auth_decisions_created_at ON auth_decisions(created_at DESC);
CREATE INDEX idx_auth_decisions_country ON auth_decisions(country);

-- OTP Requests
CREATE INDEX idx_otp_requests_phone ON otp_requests(phone, status, created_at DESC);
CREATE INDEX idx_otp_requests_payment_id ON otp_requests(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX idx_otp_requests_expires_at ON otp_requests(expires_at) WHERE status = 'pending';

-- Device Trust
CREATE INDEX idx_device_trust_user_id ON device_trust(user_id);
CREATE INDEX idx_device_trust_device_fingerprint ON device_trust(device_fingerprint);

-- Idempotency
CREATE INDEX idx_server_idempotency_key ON server_idempotency(idempotency_key);
CREATE INDEX idx_server_idempotency_expires_at ON server_idempotency(expires_at);

-- Webhooks
CREATE INDEX idx_webhook_events_created_at ON webhook_events(created_at DESC);
CREATE INDEX idx_webhook_deliveries_event_id ON webhook_deliveries(webhook_event_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER payment_intents_updated_at BEFORE UPDATE ON payment_intents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER payment_methods_updated_at BEFORE UPDATE ON payment_methods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER auth_decisions_updated_at BEFORE UPDATE ON auth_decisions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER otp_requests_updated_at BEFORE UPDATE ON otp_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER device_trust_updated_at BEFORE UPDATE ON device_trust
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- SAMPLE DATA (for testing)
-- ============================================================================

-- Insert test customer
INSERT INTO customers (id, email, name, phone, country) VALUES
  ('00000000-0000-0000-0000-000000000001', 'test@molam.io', 'Test User', '+221771234567', 'SN')
ON CONFLICT DO NOTHING;

-- Insert test payment intent
INSERT INTO payment_intents (id, amount, currency, status, customer_id, client_secret) VALUES
  ('00000000-0000-0000-0000-000000000002', 10000, 'XOF', 'pending', '00000000-0000-0000-0000-000000000001', 'pi_test_secret_123')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- END
-- ============================================================================

SELECT 'Database setup complete!' as status;
