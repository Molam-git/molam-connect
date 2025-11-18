-- Brique 94 — Molam Form Core
-- Universal plugin system for merchant integrations
-- Author: Molam Platform Team
-- Date: 2025-01-14

-- ============================================================================
-- 1. MERCHANT PLUGINS (Installation & Configuration)
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchant_plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Merchant Reference
  merchant_id UUID NOT NULL, -- REFERENCES merchants(id) from B2

  -- Plugin Type & Version
  plugin_type TEXT NOT NULL, -- 'form_web', 'form_mobile', 'form_server'
  platform TEXT, -- 'web', 'ios', 'android', 'flutter', 'react-native'
  version TEXT NOT NULL DEFAULT '1.0.0',

  -- Configuration
  config JSONB NOT NULL DEFAULT '{}'::jsonb, -- {currency, lang, branding, checkout_theme, methods}

  -- Status
  status TEXT DEFAULT 'active', -- active|suspended|deprecated
  is_production BOOLEAN DEFAULT false,

  -- Installation Tracking
  installed_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  usage_count BIGINT DEFAULT 0,

  -- Metadata
  metadata JSONB,
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_plugins_merchant
  ON merchant_plugins(merchant_id, plugin_type);

CREATE INDEX IF NOT EXISTS idx_merchant_plugins_status
  ON merchant_plugins(status, is_production);

-- ============================================================================
-- 2. API KEYS (Test & Live Keys)
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Merchant Reference
  merchant_id UUID NOT NULL, -- REFERENCES merchants(id)

  -- Key Details
  key_type TEXT NOT NULL, -- 'publishable' | 'secret' | 'restricted'
  environment TEXT NOT NULL, -- 'test' | 'live'

  -- Key Value (hashed for secret keys)
  key_prefix TEXT NOT NULL, -- 'pk_test_', 'sk_live_', etc.
  key_suffix TEXT NOT NULL, -- Last 4 characters for display
  key_hash TEXT NOT NULL, -- Full key hash (bcrypt)

  -- Permissions (for restricted keys)
  permissions TEXT[], -- ['read:customers', 'write:charges']

  -- Restrictions
  allowed_ips TEXT[], -- IP whitelist
  rate_limit INTEGER, -- Requests per minute

  -- Status
  status TEXT DEFAULT 'active', -- active|revoked|expired

  -- Usage Tracking
  last_used_at TIMESTAMPTZ,
  usage_count BIGINT DEFAULT 0,

  -- Expiration
  expires_at TIMESTAMPTZ,

  -- Metadata
  name TEXT, -- User-friendly name
  metadata JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  revoked_at TIMESTAMPTZ,

  UNIQUE(key_prefix, key_suffix, merchant_id)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_merchant
  ON api_keys(merchant_id, environment, key_type);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash
  ON api_keys(key_hash);

CREATE INDEX IF NOT EXISTS idx_api_keys_status
  ON api_keys(status, expires_at);

-- ============================================================================
-- 3. PAYMENT INTENTS (Simplified Payment Object)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference
  intent_reference TEXT UNIQUE NOT NULL,

  -- Merchant & Customer
  merchant_id UUID NOT NULL,
  customer_id UUID, -- Optional customer reference
  customer_email TEXT,

  -- Amount & Currency
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,

  -- Payment Method
  payment_method_type TEXT, -- 'card', 'wallet', 'bank_transfer'
  payment_method_id UUID, -- Link to payment method

  -- Source Information
  source TEXT, -- 'web', 'mobile', 'api'
  plugin_id UUID REFERENCES merchant_plugins(id),

  -- Status
  status TEXT DEFAULT 'requires_payment_method',
  -- requires_payment_method|requires_confirmation|requires_action|processing|succeeded|canceled|failed

  -- Confirmation
  confirmed_at TIMESTAMPTZ,
  confirmation_method TEXT, -- 'automatic', 'manual'

  -- Capture
  capture_method TEXT DEFAULT 'automatic', -- 'automatic', 'manual'
  captured_at TIMESTAMPTZ,
  amount_captured NUMERIC(18,2),

  -- Cancellation
  cancellation_reason TEXT,
  canceled_at TIMESTAMPTZ,

  -- Metadata
  description TEXT,
  statement_descriptor TEXT,
  metadata JSONB,

  -- Receipt
  receipt_email TEXT,
  receipt_url TEXT,

  -- Error Handling
  last_payment_error JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_merchant
  ON payment_intents(merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_intents_customer
  ON payment_intents(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_intents_status
  ON payment_intents(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_intents_reference
  ON payment_intents(intent_reference);

-- ============================================================================
-- 4. PLUGIN LOGS (Telemetry & Debugging)
-- ============================================================================

CREATE TABLE IF NOT EXISTS plugin_logs (
  id BIGSERIAL PRIMARY KEY,

  -- References
  merchant_id UUID,
  plugin_id UUID REFERENCES merchant_plugins(id),
  api_key_id UUID REFERENCES api_keys(id),

  -- Event Details
  event_type TEXT NOT NULL, -- 'sdk_loaded', 'payment_started', 'payment_completed', 'error'
  event_level TEXT DEFAULT 'info', -- 'debug', 'info', 'warning', 'error'

  -- Context
  sdk_version TEXT,
  platform TEXT, -- 'web', 'ios', 'android'
  user_agent TEXT,
  ip_address INET,

  -- Details
  details JSONB,
  error_message TEXT,
  stack_trace TEXT,

  -- Performance
  latency_ms INTEGER,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Partitioning by month for performance
CREATE INDEX IF NOT EXISTS idx_plugin_logs_merchant_created
  ON plugin_logs(merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plugin_logs_event_type
  ON plugin_logs(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plugin_logs_level
  ON plugin_logs(event_level, created_at DESC)
  WHERE event_level IN ('error', 'warning');

-- ============================================================================
-- 5. PLUGIN CONFIGS (Branding & Settings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS plugin_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  merchant_id UUID NOT NULL,
  plugin_id UUID REFERENCES merchant_plugins(id),

  -- Branding
  branding JSONB DEFAULT '{}'::jsonb,
  -- {
  --   "logo_url": "https://...",
  --   "primary_color": "#000000",
  --   "accent_color": "#FF6B35",
  --   "button_text": "Pay with Molam"
  -- }

  -- Localization
  default_language TEXT DEFAULT 'en',
  supported_languages TEXT[] DEFAULT ARRAY['en', 'fr'],
  default_currency TEXT DEFAULT 'USD',
  supported_currencies TEXT[] DEFAULT ARRAY['USD', 'EUR', 'XOF'],

  -- Payment Methods
  enabled_methods JSONB DEFAULT '["card", "wallet"]'::jsonb,
  payment_method_order TEXT[] DEFAULT ARRAY['wallet', 'card', 'bank'],

  -- Checkout Settings
  checkout_theme TEXT DEFAULT 'light', -- 'light', 'dark', 'auto'
  show_logos BOOLEAN DEFAULT true,
  require_billing_address BOOLEAN DEFAULT false,
  require_shipping_address BOOLEAN DEFAULT false,

  -- Security
  enable_3ds BOOLEAN DEFAULT true,
  force_3ds BOOLEAN DEFAULT false,

  -- Webhooks
  webhook_url TEXT,
  webhook_events TEXT[], -- ['payment.succeeded', 'payment.failed']

  -- Metadata
  metadata JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plugin_configs_merchant
  ON plugin_configs(merchant_id);

-- ============================================================================
-- 6. SDK VERSIONS (Version Management)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sdk_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Version Info
  version TEXT UNIQUE NOT NULL,
  platform TEXT NOT NULL, -- 'web', 'ios', 'android', 'flutter', 'node', 'php', 'python'

  -- Status
  status TEXT DEFAULT 'stable', -- 'beta', 'stable', 'deprecated', 'retired'
  is_latest BOOLEAN DEFAULT false,

  -- Release Info
  release_notes TEXT,
  breaking_changes TEXT[],
  migration_guide_url TEXT,

  -- CDN URLs
  cdn_url TEXT,
  npm_package TEXT,

  -- Compatibility
  min_os_version TEXT, -- For mobile
  required_api_version TEXT,

  -- Timestamps
  released_at TIMESTAMPTZ DEFAULT now(),
  deprecated_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sdk_versions_platform
  ON sdk_versions(platform, status);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Generate API key
CREATE OR REPLACE FUNCTION generate_api_key(
  p_key_type TEXT,
  p_environment TEXT
) RETURNS TEXT AS $$
DECLARE
  prefix TEXT;
  random_part TEXT;
BEGIN
  -- Determine prefix
  prefix := CASE
    WHEN p_key_type = 'publishable' AND p_environment = 'test' THEN 'pk_test_'
    WHEN p_key_type = 'publishable' AND p_environment = 'live' THEN 'pk_live_'
    WHEN p_key_type = 'secret' AND p_environment = 'test' THEN 'sk_test_'
    WHEN p_key_type = 'secret' AND p_environment = 'live' THEN 'sk_live_'
    WHEN p_key_type = 'restricted' AND p_environment = 'test' THEN 'rk_test_'
    WHEN p_key_type = 'restricted' AND p_environment = 'live' THEN 'rk_live_'
    ELSE 'key_'
  END;

  -- Generate random part (32 characters)
  random_part := encode(gen_random_bytes(24), 'base64');
  random_part := regexp_replace(random_part, '[^a-zA-Z0-9]', '', 'g');
  random_part := substring(random_part from 1 for 32);

  RETURN prefix || random_part;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Generate payment intent reference
CREATE OR REPLACE FUNCTION generate_intent_reference() RETURNS TEXT AS $$
DECLARE
  prefix TEXT := 'pi_';
  random_part TEXT;
BEGIN
  random_part := encode(gen_random_bytes(16), 'base64');
  random_part := regexp_replace(random_part, '[^a-zA-Z0-9]', '', 'g');
  random_part := substring(random_part from 1 for 24);
  RETURN prefix || random_part;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_merchant_plugins_updated_at BEFORE UPDATE ON merchant_plugins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_intents_updated_at BEFORE UPDATE ON payment_intents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plugin_configs_updated_at BEFORE UPDATE ON plugin_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-generate intent reference
CREATE OR REPLACE FUNCTION auto_generate_intent_reference()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.intent_reference IS NULL THEN
    NEW.intent_reference := generate_intent_reference();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_intent_reference BEFORE INSERT ON payment_intents
  FOR EACH ROW EXECUTE FUNCTION auto_generate_intent_reference();

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Insert SDK versions
INSERT INTO sdk_versions (version, platform, status, is_latest, cdn_url, npm_package)
VALUES
  ('1.0.0', 'web', 'stable', true, 'https://cdn.molam.com/sdk/v1.0.0/molam-form.js', '@molam/form-web'),
  ('1.0.0', 'node', 'stable', true, null, '@molam/sdk-node'),
  ('1.0.0', 'flutter', 'stable', true, null, 'molam_form'),
  ('1.0.0', 'ios', 'stable', true, null, 'MolamSDK'),
  ('1.0.0', 'android', 'stable', true, null, 'com.molam:sdk')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE merchant_plugins IS 'Merchant plugin installations and configurations';
COMMENT ON TABLE api_keys IS 'API keys for merchant authentication (test & live)';
COMMENT ON TABLE payment_intents IS 'Payment intent objects (similar to Stripe PaymentIntent)';
COMMENT ON TABLE plugin_logs IS 'SDK telemetry and error logs';
COMMENT ON TABLE plugin_configs IS 'Plugin branding and checkout settings';
COMMENT ON TABLE sdk_versions IS 'SDK version tracking and management';

COMMENT ON COLUMN api_keys.key_hash IS 'Bcrypt hash of full API key';
COMMENT ON COLUMN api_keys.key_prefix IS 'Key prefix for identification (pk_test_, sk_live_, etc.)';
COMMENT ON COLUMN api_keys.key_suffix IS 'Last 4 characters for display purposes';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
