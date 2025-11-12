/**
 * Brique 43 - Checkout & Payment Methods Orchestration
 * Migration 001: Complete Schema
 *
 * Tables: merchants, api_keys, vault, tokens, intents, attempts, challenges, webhooks, outbox, audit
 */

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-------------------------------
-- 1. Merchants & RBAC Linking
-------------------------------
CREATE TABLE IF NOT EXISTS merchants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  molam_id TEXT NOT NULL UNIQUE,         -- link to Molam ID tenant
  name TEXT NOT NULL,
  country TEXT NOT NULL,                  -- ISO-2
  default_currency TEXT NOT NULL,         -- ISO-4217
  default_lang TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'active',  -- active|suspended
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT merchants_status_check CHECK (status IN ('active', 'suspended'))
);

CREATE INDEX IF NOT EXISTS idx_merchants_molam_id ON merchants(molam_id);
CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants(status) WHERE status = 'active';

-- Merchant API keys (for server-to-server; UI uses Molam ID OAuth/JWT)
CREATE TABLE IF NOT EXISTS merchant_api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,                 -- store only hash (SHA-256)
  scope TEXT[] NOT NULL DEFAULT ARRAY['payments:write','payments:read','webhooks:write','webhooks:read'],
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,

  CONSTRAINT api_keys_key_hash_not_empty CHECK (key_hash <> '')
);

CREATE INDEX IF NOT EXISTS idx_api_keys_merchant ON merchant_api_keys(merchant_id);

--------------------------------------
-- 2. Payment Method Vault & Tokening
--------------------------------------
-- All sensitive blobs encrypted application-side (AES-GCM), only ciphertext here.
CREATE TABLE IF NOT EXISTS payment_method_vault (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  pm_type TEXT NOT NULL,                  -- 'card'|'wallet'|'bank'
  brand TEXT,                             -- e.g. 'visa','mastercard','molam_wallet','sepa'
  last4 TEXT,                             -- only last 4 digits
  exp_month INT,                          -- for card
  exp_year INT,
  issuer_country TEXT,
  holder_hash TEXT,                       -- hash(name+doc) for dedupe
  cipher_payload BYTEA NOT NULL,          -- encrypted PAN/IBAN/token/etc.
  meta JSONB DEFAULT '{}'::jsonb,         -- device fingerprint, BIN info, etc.
  status TEXT NOT NULL DEFAULT 'active',  -- active|revoked
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT vault_pm_type_check CHECK (pm_type IN ('card', 'wallet', 'bank')),
  CONSTRAINT vault_status_check CHECK (status IN ('active', 'revoked'))
);

CREATE INDEX IF NOT EXISTS idx_vault_merchant ON payment_method_vault(merchant_id);
CREATE INDEX IF NOT EXISTS idx_vault_merchant_status ON payment_method_vault(merchant_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_vault_holder_hash ON payment_method_vault(holder_hash);

-- Customer-scoped tokens (for one-click / vault reuse)
CREATE TABLE IF NOT EXISTS customer_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_ref TEXT NOT NULL,             -- merchant-side customer id/email/phone
  pm_vault_id UUID NOT NULL REFERENCES payment_method_vault(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,             -- opaque token for SDK
  status TEXT NOT NULL DEFAULT 'active',  -- active|revoked
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT tokens_status_check CHECK (status IN ('active', 'revoked'))
);

CREATE INDEX IF NOT EXISTS idx_customer_tokens_merchant_customer ON customer_tokens(merchant_id, customer_ref);
CREATE INDEX IF NOT EXISTS idx_customer_tokens_token ON customer_tokens(token);

--------------------------
-- 3. Payment Intents
--------------------------
CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  country TEXT NOT NULL,                   -- detected via Molam ID / buyer IP / config
  lang TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'requires_payment_method',
  -- requires_payment_method | requires_confirmation | requires_action | processing | succeeded | failed | canceled
  capture_method TEXT NOT NULL DEFAULT 'automatic', -- automatic|manual
  statement_descriptor TEXT,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  sira_hint JSONB,                         -- {preferred_route:'wallet|card|bank', risk_score, three_ds: 'required'|'recommended'|'off'}
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT intents_amount_positive CHECK (amount > 0),
  CONSTRAINT intents_status_check CHECK (status IN (
    'requires_payment_method', 'requires_confirmation', 'requires_action',
    'processing', 'succeeded', 'failed', 'canceled'
  )),
  CONSTRAINT intents_capture_method_check CHECK (capture_method IN ('automatic', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_intents_merchant ON payment_intents(merchant_id);
CREATE INDEX IF NOT EXISTS idx_intents_merchant_status ON payment_intents(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_intents_created ON payment_intents(created_at DESC);

-- Attempts (each route/fallback step)
CREATE TABLE IF NOT EXISTS payment_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intent_id UUID NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  route TEXT NOT NULL,                     -- 'wallet','card','bank'
  provider TEXT,                           -- 'molam', 'acquirer_x', 'sepa', 'bank_net'
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|requires_action|processing|succeeded|failed|canceled
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  fee_molam NUMERIC(10,2) DEFAULT 0,
  fee_provider NUMERIC(10,2) DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT attempts_route_check CHECK (route IN ('wallet', 'card', 'bank')),
  CONSTRAINT attempts_status_check CHECK (status IN (
    'pending', 'requires_action', 'processing', 'succeeded', 'failed', 'canceled'
  ))
);

CREATE INDEX IF NOT EXISTS idx_attempts_intent ON payment_attempts(intent_id);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON payment_attempts(status);
CREATE INDEX IF NOT EXISTS idx_attempts_idempotency ON payment_attempts(idempotency_key);

--------------------------
-- 4. Challenges (3DS/OTP)
--------------------------
CREATE TABLE IF NOT EXISTS payment_challenges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id UUID NOT NULL REFERENCES payment_attempts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                      -- '3ds','otp','link'
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|passed|failed|expired
  channel TEXT,                            -- 'sms','app','email','redirect'
  expires_at TIMESTAMPTZ,
  payload JSONB,                           -- ACS url/PaReq or OTP mask, etc.
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT challenges_type_check CHECK (type IN ('3ds', 'otp', 'link')),
  CONSTRAINT challenges_status_check CHECK (status IN ('pending', 'passed', 'failed', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_challenges_attempt ON payment_challenges(attempt_id);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON payment_challenges(status);
CREATE INDEX IF NOT EXISTS idx_challenges_expires ON payment_challenges(expires_at) WHERE status = 'pending';

--------------------------
-- 5. Webhooks & Outbox
--------------------------
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,                    -- for HMAC signature
  events TEXT[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',   -- active|disabled
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT webhooks_url_not_empty CHECK (url <> ''),
  CONSTRAINT webhooks_secret_not_empty CHECK (secret <> ''),
  CONSTRAINT webhooks_status_check CHECK (status IN ('active', 'disabled'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_merchant ON webhook_endpoints(merchant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_active ON webhook_endpoints(merchant_id, status) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS webhook_outbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_payload JSONB NOT NULL,
  endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  delivery_status TEXT NOT NULL DEFAULT 'pending', -- pending|sent|failed
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT outbox_delivery_status_check CHECK (delivery_status IN ('pending', 'sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_outbox_status ON webhook_outbox(delivery_status, created_at) WHERE delivery_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_webhook_outbox_merchant ON webhook_outbox(merchant_id);

--------------------------
-- 6. Audit (immutable)
--------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor TEXT,                              -- service|merchant_user|ops_user
  action TEXT NOT NULL,                    -- 'intent.create','attempt.route','challenge.start','webhook.sent'
  ref_type TEXT,                           -- 'intent'|'attempt'|'challenge'|'webhook'
  ref_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_ref ON audit_logs(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_merchants_updated_at BEFORE UPDATE ON merchants FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trigger_vault_updated_at BEFORE UPDATE ON payment_method_vault FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trigger_tokens_updated_at BEFORE UPDATE ON customer_tokens FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trigger_intents_updated_at BEFORE UPDATE ON payment_intents FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trigger_attempts_updated_at BEFORE UPDATE ON payment_attempts FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trigger_challenges_updated_at BEFORE UPDATE ON payment_challenges FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trigger_outbox_updated_at BEFORE UPDATE ON webhook_outbox FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Comments
COMMENT ON TABLE merchants IS 'Merchant accounts linked to Molam ID';
COMMENT ON TABLE merchant_api_keys IS 'Server-to-server API keys for merchants';
COMMENT ON TABLE payment_method_vault IS 'Encrypted payment method storage';
COMMENT ON TABLE customer_tokens IS 'Customer-scoped payment method tokens for one-click';
COMMENT ON TABLE payment_intents IS 'Payment sessions with multi-route orchestration';
COMMENT ON TABLE payment_attempts IS 'Individual route attempts with fallback tracking';
COMMENT ON TABLE payment_challenges IS '3DS/OTP/Link challenges for strong authentication';
COMMENT ON TABLE webhook_endpoints IS 'Merchant webhook endpoints';
COMMENT ON TABLE webhook_outbox IS 'Webhook delivery queue with retry logic';
COMMENT ON TABLE audit_logs IS 'Immutable audit trail for all operations';
