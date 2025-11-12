/**
 * Brique 53 - Checkout Hosted / Embedded Subscription Checkout
 * Database Schema
 */

-- 1) Checkout sessions (hosted & embedded)
CREATE TABLE IF NOT EXISTS checkout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE NOT NULL, -- idempotency key/public id
  merchant_id UUID NOT NULL,
  customer_id UUID,
  subscription_id UUID, -- created after completion
  plan_id UUID NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT DEFAULT 'created' CHECK (status IN ('created','requires_action','processing','completed','failed','expired')),
  payment_method_id UUID, -- link to vault (B52)
  locale TEXT DEFAULT 'en',
  return_url TEXT,
  cancel_url TEXT,
  success_url TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkout_merchant ON checkout_sessions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_checkout_status ON checkout_sessions(status);
CREATE INDEX IF NOT EXISTS idx_checkout_expires ON checkout_sessions(expires_at) WHERE status IN ('created', 'requires_action');
CREATE INDEX IF NOT EXISTS idx_checkout_external_id ON checkout_sessions(external_id);

-- 2) Merchant branding configuration
CREATE TABLE IF NOT EXISTS merchant_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID UNIQUE NOT NULL,
  logo_url TEXT,
  brand_color TEXT DEFAULT '#4F46E5',
  business_name TEXT,
  support_email TEXT,
  support_phone TEXT,
  terms_url TEXT,
  privacy_url TEXT,
  locale_texts JSONB DEFAULT '{}', -- { "en": { "subscribe_button": "..." }, "fr": { ... } }
  enabled_payment_methods JSONB DEFAULT '["card","sepa_debit","wallet"]'::jsonb,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branding_merchant ON merchant_branding(merchant_id);

-- 3) Checkout events log (analytics)
CREATE TABLE IF NOT EXISTS checkout_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES checkout_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- page_view, plan_selected, payment_started, payment_completed, etc.
  event_data JSONB DEFAULT '{}',
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkout_events_session ON checkout_events(session_id);
CREATE INDEX IF NOT EXISTS idx_checkout_events_type ON checkout_events(event_type);
CREATE INDEX IF NOT EXISTS idx_checkout_events_created ON checkout_events(created_at DESC);

-- Seed default branding
INSERT INTO merchant_branding (merchant_id, business_name, logo_url, brand_color, enabled_payment_methods)
VALUES
  (
    '00000000-0000-0000-0000-000000000001', -- Default merchant
    'Molam Connect',
    'https://assets.molam.com/logo.png',
    '#4F46E5',
    '["card","sepa_debit","wallet"]'::jsonb
  )
ON CONFLICT DO NOTHING;

-- Comments
COMMENT ON TABLE checkout_sessions IS 'Checkout sessions for subscription purchases (hosted & embedded)';
COMMENT ON TABLE merchant_branding IS 'Merchant branding and customization for checkout pages';
COMMENT ON TABLE checkout_events IS 'Analytics events tracking for checkout funnel optimization';

COMMENT ON COLUMN checkout_sessions.status IS 'created: initial | requires_action: 3DS/OTP needed | processing: payment in flight | completed: success | failed: payment declined | expired: session timeout';
COMMENT ON COLUMN checkout_sessions.expires_at IS 'Sessions expire after 30 minutes by default';
