-- =====================================================================
-- Brique 109: Checkout Widgets & SDK Enhancements
-- =====================================================================
-- Industrial-grade checkout widget with Apple-like UX, hosted fields,
-- tokenization, multi-platform SDKs, and PCI-compliant architecture
-- =====================================================================

-- Checkout Sessions - Short-lived sessions for client-side widget
CREATE TABLE IF NOT EXISTS checkout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE NOT NULL, -- Idempotency key from merchant frontend
  merchant_id UUID NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'XOF',
  locale TEXT NOT NULL DEFAULT 'en',
  allowed_methods TEXT[] DEFAULT ARRAY['wallet','card','bank'],
  sira_hints JSONB DEFAULT '{}',
  status TEXT DEFAULT 'created',
  meta JSONB DEFAULT '{}',
  merchant_name TEXT,
  merchant_logo TEXT,
  success_url TEXT,
  cancel_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,

  CONSTRAINT valid_checkout_status CHECK (status IN ('created', 'completed', 'expired', 'canceled'))
);

CREATE INDEX idx_checkout_sessions_merchant ON checkout_sessions(merchant_id);
CREATE INDEX idx_checkout_sessions_external_id ON checkout_sessions(external_id);
CREATE INDEX idx_checkout_sessions_status ON checkout_sessions(status);
CREATE INDEX idx_checkout_sessions_expires ON checkout_sessions(expires_at) WHERE status = 'created';

-- Payment Method Tokens - Tokenized payment methods (PCI-compliant)
CREATE TABLE IF NOT EXISTS payment_method_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL, -- card_tok_{uuid} or card_vault_{uuid}
  type TEXT NOT NULL, -- 'card', 'bank_account'
  usage TEXT NOT NULL DEFAULT 'single', -- 'single' | 'multi' (vaulted)
  encrypted_blob BYTEA NOT NULL, -- HSM/KMS encrypted PAN data
  masked_pan TEXT, -- e.g., "**** **** **** 4242"
  card_brand TEXT, -- 'visa', 'mastercard', 'amex'
  exp_month INTEGER,
  exp_year INTEGER,
  billing_country TEXT,
  cardholder_name TEXT,
  fingerprint TEXT, -- Unique identifier for deduplication
  merchant_id UUID,
  customer_id UUID,
  vault_consent BOOLEAN DEFAULT false, -- User consented to save
  vault_consent_at TIMESTAMPTZ,
  used_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active', -- 'active', 'used', 'expired', 'revoked'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,

  CONSTRAINT valid_token_type CHECK (type IN ('card', 'bank_account')),
  CONSTRAINT valid_token_usage CHECK (usage IN ('single', 'multi')),
  CONSTRAINT valid_token_status CHECK (status IN ('active', 'used', 'expired', 'revoked'))
);

CREATE INDEX idx_payment_method_tokens_token ON payment_method_tokens(token);
CREATE INDEX idx_payment_method_tokens_merchant ON payment_method_tokens(merchant_id);
CREATE INDEX idx_payment_method_tokens_customer ON payment_method_tokens(customer_id);
CREATE INDEX idx_payment_method_tokens_fingerprint ON payment_method_tokens(fingerprint);
CREATE INDEX idx_payment_method_tokens_status ON payment_method_tokens(status);

-- Widget Configurations - Merchant-specific widget settings
CREATE TABLE IF NOT EXISTS widget_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID UNIQUE NOT NULL,
  theme TEXT DEFAULT 'apple', -- 'apple', 'minimal', 'custom'
  primary_color TEXT DEFAULT '#0A84FF',
  border_radius INTEGER DEFAULT 16,
  allowed_methods TEXT[] DEFAULT ARRAY['wallet','card','bank'],
  require_address BOOLEAN DEFAULT false,
  require_vat BOOLEAN DEFAULT false,
  show_logo BOOLEAN DEFAULT true,
  custom_css TEXT,
  locales_enabled TEXT[] DEFAULT ARRAY['en','fr'],
  default_locale TEXT DEFAULT 'en',
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_widget_configurations_merchant ON widget_configurations(merchant_id);

-- Tokenization Events - Audit trail for token creation/usage
CREATE TABLE IF NOT EXISTS tokenization_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID NOT NULL REFERENCES payment_method_tokens(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'created', 'used', 'expired', 'revoked'
  merchant_id UUID,
  session_id UUID,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tokenization_events_token ON tokenization_events(token_id);
CREATE INDEX idx_tokenization_events_merchant ON tokenization_events(merchant_id);
CREATE INDEX idx_tokenization_events_created ON tokenization_events(created_at DESC);

-- Widget Analytics - Real-time widget performance metrics
CREATE TABLE IF NOT EXISTS widget_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  session_id UUID REFERENCES checkout_sessions(id) ON DELETE SET NULL,
  metric_type TEXT NOT NULL, -- 'widget_load', 'session_created', 'tokenization', 'confirm_success', 'confirm_failed', '3ds_challenge', 'abandonment'
  value NUMERIC(18,2),
  latency_ms INTEGER,
  payment_method TEXT, -- 'wallet', 'card', 'bank'
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_widget_analytics_merchant ON widget_analytics(merchant_id);
CREATE INDEX idx_widget_analytics_type ON widget_analytics(metric_type);
CREATE INDEX idx_widget_analytics_recorded ON widget_analytics(recorded_at DESC);

-- Hosted Field Sessions - Track hosted field iframe sessions
CREATE TABLE IF NOT EXISTS hosted_field_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  merchant_id UUID NOT NULL,
  origin TEXT NOT NULL, -- Merchant origin for CORS validation
  nonce TEXT UNIQUE NOT NULL, -- CSP nonce
  status TEXT DEFAULT 'active', -- 'active', 'completed', 'expired'
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,

  CONSTRAINT valid_hosted_field_status CHECK (status IN ('active', 'completed', 'expired'))
);

CREATE INDEX idx_hosted_field_sessions_session ON hosted_field_sessions(session_id);
CREATE INDEX idx_hosted_field_sessions_merchant ON hosted_field_sessions(merchant_id);
CREATE INDEX idx_hosted_field_sessions_nonce ON hosted_field_sessions(nonce);
CREATE INDEX idx_hosted_field_sessions_expires ON hosted_field_sessions(expires_at) WHERE status = 'active';

-- Comments
COMMENT ON TABLE checkout_sessions IS 'Short-lived checkout sessions for widget integration';
COMMENT ON TABLE payment_method_tokens IS 'PCI-compliant tokenized payment methods (HSM encrypted)';
COMMENT ON TABLE widget_configurations IS 'Merchant-specific widget appearance and behavior';
COMMENT ON TABLE tokenization_events IS 'Audit trail for all tokenization operations';
COMMENT ON TABLE widget_analytics IS 'Real-time widget performance and conversion metrics';
COMMENT ON TABLE hosted_field_sessions IS 'Hosted field iframe sessions for PCI compliance';

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_widget_configurations_updated_at BEFORE UPDATE ON widget_configurations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to expire old sessions
CREATE OR REPLACE FUNCTION expire_checkout_sessions()
RETURNS void AS $$
BEGIN
  UPDATE checkout_sessions
  SET status = 'expired'
  WHERE status = 'created'
    AND expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- Function to expire old tokens
CREATE OR REPLACE FUNCTION expire_payment_tokens()
RETURNS void AS $$
BEGIN
  UPDATE payment_method_tokens
  SET status = 'expired'
  WHERE status = 'active'
    AND usage = 'single'
    AND created_at < now() - interval '1 hour';

  UPDATE payment_method_tokens
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < now();
END;
$$ LANGUAGE plpgsql;
