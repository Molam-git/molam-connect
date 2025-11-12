-- =====================================================
-- Brique 75 - Merchant Settings Schema
-- =====================================================
-- Version: 1.0.0
-- Purpose: Centralized merchant configuration and branding management
-- Dependencies: Requires connect_accounts table
-- =====================================================

-- =====================================================
-- 1. CORE MERCHANT SETTINGS
-- =====================================================
CREATE TABLE IF NOT EXISTS merchant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Merchant reference
  merchant_id UUID NOT NULL UNIQUE REFERENCES connect_accounts(id) ON DELETE CASCADE,

  -- Localization
  default_currency TEXT NOT NULL DEFAULT 'XOF' CHECK (LENGTH(default_currency) = 3),
  default_language TEXT NOT NULL DEFAULT 'fr' CHECK (LENGTH(default_language) = 2),
  supported_currencies TEXT[] DEFAULT ARRAY['XOF','EUR','USD'],
  supported_languages TEXT[] DEFAULT ARRAY['fr','en'],
  timezone TEXT DEFAULT 'Africa/Dakar',

  -- Payment methods (enabled/disabled)
  active_payment_methods TEXT[] DEFAULT ARRAY['wallet','card','mobile_money'],
  -- Options: wallet, card, mobile_money, bank_transfer, ussd, qr_code

  payment_method_priority TEXT[], -- Order of display in checkout

  -- Branding reference
  branding_id UUID REFERENCES merchant_branding(id),

  -- Sales configuration
  sales_zones_id UUID REFERENCES merchant_sales_zones(id),

  -- Policies
  refund_policy_id UUID REFERENCES merchant_refund_policies(id),
  subscription_config_id UUID REFERENCES merchant_subscription_config(id),

  -- Commission override (if merchant has special contract)
  commission_override NUMERIC(5,2) CHECK (commission_override >= 0 AND commission_override <= 100),
  commission_override_reason TEXT,
  commission_override_approved_by UUID, -- Ops user who approved
  commission_override_expires_at TIMESTAMPTZ,

  -- Checkout configuration
  checkout_config JSONB DEFAULT '{}'::JSONB,
  -- Example: {
  --   "auto_capture": true,
  --   "save_payment_methods": true,
  --   "require_billing_address": false,
  --   "require_shipping_address": true,
  --   "session_timeout_minutes": 30
  -- }

  -- Email notifications
  email_notifications JSONB DEFAULT '{}'::JSONB,
  -- Example: {
  --   "payment_success": true,
  --   "payment_failed": true,
  --   "refund_processed": true,
  --   "payout_sent": true
  -- }

  -- Webhooks configuration
  webhook_endpoints TEXT[],
  webhook_events TEXT[],

  -- Feature flags
  features JSONB DEFAULT '{}'::JSONB,
  -- Example: {
  --   "subscriptions_enabled": true,
  --   "split_payments_enabled": false,
  --   "installments_enabled": true,
  --   "3ds_enforced": true
  -- }

  -- Compliance & KYC
  kyc_level TEXT DEFAULT 'basic' CHECK (kyc_level IN ('basic','standard','enhanced')),
  compliance_flags JSONB DEFAULT '{}'::JSONB,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active','suspended','archived')),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_modified_by UUID, -- User who last modified

  -- Version control
  version INTEGER DEFAULT 1
);

CREATE INDEX idx_merchant_settings_merchant ON merchant_settings(merchant_id);
CREATE INDEX idx_merchant_settings_status ON merchant_settings(status) WHERE status = 'active';

COMMENT ON TABLE merchant_settings IS 'Core merchant configuration and preferences';

-- =====================================================
-- 2. MERCHANT BRANDING
-- =====================================================
CREATE TABLE IF NOT EXISTS merchant_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Merchant reference
  merchant_id UUID NOT NULL REFERENCES connect_accounts(id) ON DELETE CASCADE,

  -- Visual identity
  business_name TEXT NOT NULL,
  display_name TEXT, -- Public-facing name if different
  tagline TEXT,
  description TEXT,

  -- Logo & images
  logo_url TEXT,
  logo_square_url TEXT, -- For social media
  favicon_url TEXT,
  cover_image_url TEXT,

  -- Color scheme
  primary_color TEXT DEFAULT '#0066CC', -- Hex color
  secondary_color TEXT DEFAULT '#333333',
  accent_color TEXT DEFAULT '#FF6B35',
  background_color TEXT DEFAULT '#FFFFFF',
  text_color TEXT DEFAULT '#000000',

  -- Typography
  font_family TEXT DEFAULT 'Inter',
  font_url TEXT, -- Custom font URL

  -- Button style
  button_style TEXT DEFAULT 'rounded' CHECK (button_style IN ('square','rounded','pill')),
  button_shadow BOOLEAN DEFAULT true,

  -- Checkout customization
  checkout_theme TEXT DEFAULT 'light' CHECK (checkout_theme IN ('light','dark','auto')),
  checkout_layout TEXT DEFAULT 'embedded' CHECK (checkout_layout IN ('embedded','redirect','modal')),

  -- Contact information
  support_email TEXT,
  support_phone TEXT,
  support_url TEXT,

  -- Social links
  website_url TEXT,
  social_links JSONB DEFAULT '{}'::JSONB,
  -- Example: {"twitter":"@molam","linkedin":"/company/molam"}

  -- Legal
  terms_url TEXT,
  privacy_url TEXT,
  refund_policy_url TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_merchant_branding_merchant ON merchant_branding(merchant_id);

COMMENT ON TABLE merchant_branding IS 'Merchant branding and visual identity configuration';

-- =====================================================
-- 3. PAYMENT METHOD CONFIGURATION
-- =====================================================
CREATE TABLE IF NOT EXISTS merchant_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Merchant reference
  merchant_id UUID NOT NULL REFERENCES connect_accounts(id) ON DELETE CASCADE,

  -- Payment method
  method_type TEXT NOT NULL CHECK (method_type IN (
    'wallet','card','mobile_money','bank_transfer','ussd','qr_code','crypto'
  )),

  -- Provider-specific config (for mobile money)
  provider TEXT, -- mtn_momo, orange_money, wave, etc.

  -- Enabled status
  is_enabled BOOLEAN DEFAULT true,

  -- Display configuration
  display_name TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  icon_url TEXT,

  -- Limits
  min_amount NUMERIC(12,2),
  max_amount NUMERIC(12,2),
  daily_limit NUMERIC(12,2),
  monthly_limit NUMERIC(12,2),

  -- Fees configuration
  fee_type TEXT CHECK (fee_type IN ('percentage','fixed','hybrid')),
  fee_percentage NUMERIC(5,2),
  fee_fixed NUMERIC(12,2),
  fee_cap NUMERIC(12,2), -- Maximum fee

  -- Currency restrictions
  supported_currencies TEXT[],

  -- Country restrictions
  allowed_countries TEXT[],
  blocked_countries TEXT[],

  -- Additional configuration
  config JSONB DEFAULT '{}'::JSONB,
  -- Example: {
  --   "require_cvv": true,
  --   "save_for_future": true,
  --   "3ds_required": true,
  --   "auto_refund_supported": true
  -- }

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active','disabled','deprecated')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,

  UNIQUE(merchant_id, method_type, provider)
);

CREATE INDEX idx_payment_methods_merchant ON merchant_payment_methods(merchant_id, is_enabled);
CREATE INDEX idx_payment_methods_type ON merchant_payment_methods(method_type, status);

COMMENT ON TABLE merchant_payment_methods IS 'Per-merchant payment method configuration with limits and fees';

-- =====================================================
-- 4. SALES ZONES CONFIGURATION
-- =====================================================
CREATE TABLE IF NOT EXISTS merchant_sales_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Merchant reference
  merchant_id UUID NOT NULL REFERENCES connect_accounts(id) ON DELETE CASCADE,

  -- Geographic configuration
  allowed_countries TEXT[] DEFAULT ARRAY['*'], -- ['*'] means all countries
  blocked_countries TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Regional groups
  allowed_regions TEXT[], -- ['EU','WAEMU','SADC']

  -- Shipping zones (if applicable)
  shipping_zones JSONB DEFAULT '[]'::JSONB,
  -- Example: [
  --   {"name":"Domestic","countries":["SN","CI"],"fee":2000},
  --   {"name":"International","countries":["*"],"fee":5000}
  -- ]

  -- Tax configuration by zone
  tax_config JSONB DEFAULT '{}'::JSONB,
  -- Example: {
  --   "SN": {"vat":0.18,"name":"TVA"},
  --   "CI": {"vat":0.18,"name":"TVA"},
  --   "EU": {"vat":0.20,"name":"VAT"}
  -- }

  -- Currency preferences by country
  currency_mapping JSONB DEFAULT '{}'::JSONB,
  -- Example: {"SN":"XOF","CI":"XOF","FR":"EUR"}

  -- Compliance requirements by zone
  compliance_requirements JSONB DEFAULT '{}'::JSONB,
  -- Example: {
  --   "WAEMU": {"kyc_required":true,"transaction_reporting":true},
  --   "EU": {"gdpr_compliance":true}
  -- }

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_sales_zones_merchant ON merchant_sales_zones(merchant_id);

COMMENT ON TABLE merchant_sales_zones IS 'Geographic sales zones and tax configuration';

-- =====================================================
-- 5. REFUND POLICIES
-- =====================================================
CREATE TABLE IF NOT EXISTS merchant_refund_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Merchant reference
  merchant_id UUID NOT NULL REFERENCES connect_accounts(id) ON DELETE CASCADE,

  -- Policy name
  policy_name TEXT NOT NULL,
  description TEXT,

  -- Auto-refund configuration
  auto_refund_enabled BOOLEAN DEFAULT false,
  auto_refund_window_days INTEGER DEFAULT 30,
  auto_refund_conditions JSONB DEFAULT '{}'::JSONB,
  -- Example: {"payment_failed":true,"duplicate_charge":true}

  -- Manual refund rules
  manual_refund_requires_approval BOOLEAN DEFAULT true,
  approval_threshold_amount NUMERIC(12,2), -- Above this amount, requires approval
  approvers UUID[], -- List of user IDs who can approve

  -- Partial refund
  partial_refund_enabled BOOLEAN DEFAULT true,
  min_refund_amount NUMERIC(12,2),

  -- Refund fees
  refund_fee_type TEXT CHECK (refund_fee_type IN ('none','percentage','fixed')),
  refund_fee_percentage NUMERIC(5,2),
  refund_fee_fixed NUMERIC(12,2),
  refund_fee_paid_by TEXT CHECK (refund_fee_paid_by IN ('merchant','customer','split')),

  -- Time limits
  max_refund_days INTEGER DEFAULT 90, -- Maximum days after purchase

  -- Conditions
  conditions JSONB DEFAULT '{}'::JSONB,
  -- Example: {
  --   "require_reason": true,
  --   "require_photo_proof": false,
  --   "allowed_reasons": ["damaged","wrong_item","not_as_described"]
  -- }

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false, -- Default policy for merchant

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_refund_policies_merchant ON merchant_refund_policies(merchant_id);

COMMENT ON TABLE merchant_refund_policies IS 'Merchant refund policies and automation rules';

-- =====================================================
-- 6. SUBSCRIPTION CONFIGURATION
-- =====================================================
CREATE TABLE IF NOT EXISTS merchant_subscription_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Merchant reference
  merchant_id UUID NOT NULL REFERENCES connect_accounts(id) ON DELETE CASCADE,

  -- Subscription features
  subscriptions_enabled BOOLEAN DEFAULT false,

  -- Billing cycles
  allowed_intervals TEXT[] DEFAULT ARRAY['monthly','yearly'],
  -- Options: daily, weekly, monthly, quarterly, yearly

  -- Trial periods
  trial_enabled BOOLEAN DEFAULT false,
  default_trial_days INTEGER DEFAULT 14,

  -- Failed payment handling
  retry_failed_payments BOOLEAN DEFAULT true,
  retry_schedule JSONB DEFAULT '[1,3,7]'::JSONB, -- Days between retries
  max_retry_attempts INTEGER DEFAULT 3,

  -- Dunning management
  dunning_enabled BOOLEAN DEFAULT true,
  dunning_email_schedule JSONB DEFAULT '[1,3,7,14]'::JSONB, -- Days before sending emails

  -- Cancellation
  allow_customer_cancellation BOOLEAN DEFAULT true,
  cancellation_notice_days INTEGER DEFAULT 0,
  cancellation_refund_policy TEXT CHECK (cancellation_refund_policy IN ('none','prorated','full')),

  -- Proration
  proration_enabled BOOLEAN DEFAULT true,
  proration_method TEXT DEFAULT 'daily' CHECK (proration_method IN ('daily','monthly','none')),

  -- Upgrade/downgrade
  allow_plan_changes BOOLEAN DEFAULT true,
  plan_change_effective TEXT DEFAULT 'immediate' CHECK (plan_change_effective IN ('immediate','next_cycle')),

  -- Grace period
  grace_period_days INTEGER DEFAULT 3, -- Days before suspension after failed payment

  -- Webhooks
  webhook_events TEXT[] DEFAULT ARRAY[
    'subscription.created',
    'subscription.updated',
    'subscription.cancelled',
    'subscription.payment_failed',
    'subscription.payment_succeeded'
  ],

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_subscription_config_merchant ON merchant_subscription_config(merchant_id);

COMMENT ON TABLE merchant_subscription_config IS 'Subscription and recurring payment configuration';

-- =====================================================
-- 7. COMMISSION OVERRIDES HISTORY
-- =====================================================
CREATE TABLE IF NOT EXISTS merchant_commission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Merchant reference
  merchant_id UUID NOT NULL REFERENCES connect_accounts(id) ON DELETE CASCADE,

  -- Override details
  commission_rate NUMERIC(5,2) NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 100),
  reason TEXT NOT NULL,

  -- Approval
  requested_by UUID NOT NULL, -- User who requested
  approved_by UUID, -- Ops user who approved
  approved_at TIMESTAMPTZ,

  -- Validity period
  effective_from TIMESTAMPTZ DEFAULT now(),
  effective_until TIMESTAMPTZ,

  -- Conditions
  applies_to_payment_methods TEXT[], -- NULL means all methods
  min_transaction_amount NUMERIC(12,2),
  max_transaction_amount NUMERIC(12,2),

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired','revoked')),
  rejection_reason TEXT,

  -- Contract reference
  contract_reference TEXT,
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_commission_overrides_merchant ON merchant_commission_overrides(merchant_id);
CREATE INDEX idx_commission_overrides_status ON merchant_commission_overrides(status, effective_from);

COMMENT ON TABLE merchant_commission_overrides IS 'Commission override requests and approvals';

-- =====================================================
-- 8. SETTINGS HISTORY (Versioning)
-- =====================================================
CREATE TABLE IF NOT EXISTS merchant_settings_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Settings reference
  settings_id UUID NOT NULL REFERENCES merchant_settings(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL,

  -- Version
  version INTEGER NOT NULL,

  -- Snapshot of settings at this version
  settings_snapshot JSONB NOT NULL,

  -- Change details
  changed_fields TEXT[],
  change_summary TEXT,

  -- Actor
  changed_by UUID NOT NULL, -- User who made the change
  change_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_settings_history_settings ON merchant_settings_history(settings_id, version DESC);
CREATE INDEX idx_settings_history_merchant ON merchant_settings_history(merchant_id, created_at DESC);

COMMENT ON TABLE merchant_settings_history IS 'Version history of merchant settings changes';

-- =====================================================
-- 9. SETTINGS AUDIT LOG (Immutable)
-- =====================================================
CREATE TABLE IF NOT EXISTS merchant_settings_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Merchant reference
  merchant_id UUID NOT NULL,

  -- Action details
  action TEXT NOT NULL CHECK (action IN (
    'settings_created','settings_updated','settings_deleted',
    'branding_updated','payment_method_enabled','payment_method_disabled',
    'refund_policy_updated','subscription_config_updated',
    'commission_override_requested','commission_override_approved'
  )),

  -- Actor
  actor_id UUID NOT NULL, -- User who performed action
  actor_type TEXT CHECK (actor_type IN ('merchant_user','ops_admin','system')),

  -- IP and context
  ip_address INET,
  user_agent TEXT,

  -- Changes made
  changes JSONB NOT NULL,
  previous_values JSONB,
  new_values JSONB,

  -- Immutability hash
  hash TEXT NOT NULL,
  prev_hash TEXT, -- Hash of previous audit entry for chain verification

  -- Timestamp (immutable)
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_settings_audit_merchant ON merchant_settings_audit(merchant_id, created_at DESC);
CREATE INDEX idx_settings_audit_action ON merchant_settings_audit(action, created_at DESC);
CREATE INDEX idx_settings_audit_actor ON merchant_settings_audit(actor_id, created_at DESC);

COMMENT ON TABLE merchant_settings_audit IS 'Immutable audit trail of all merchant settings changes';

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Trigger: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_merchant_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_merchant_settings_updated_at
  BEFORE UPDATE ON merchant_settings
  FOR EACH ROW EXECUTE FUNCTION update_merchant_settings_timestamp();

CREATE TRIGGER trg_merchant_branding_updated_at
  BEFORE UPDATE ON merchant_branding
  FOR EACH ROW EXECUTE FUNCTION update_merchant_settings_timestamp();

CREATE TRIGGER trg_payment_methods_updated_at
  BEFORE UPDATE ON merchant_payment_methods
  FOR EACH ROW EXECUTE FUNCTION update_merchant_settings_timestamp();

-- Trigger: Create version history on update
CREATE OR REPLACE FUNCTION create_settings_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Increment version
  NEW.version := OLD.version + 1;

  -- Create history entry
  INSERT INTO merchant_settings_history (
    settings_id,
    merchant_id,
    version,
    settings_snapshot,
    changed_by
  ) VALUES (
    NEW.id,
    NEW.merchant_id,
    OLD.version,
    row_to_json(OLD),
    NEW.last_modified_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_settings_version
  BEFORE UPDATE ON merchant_settings
  FOR EACH ROW EXECUTE FUNCTION create_settings_version();

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function: Get active commission rate for merchant
CREATE OR REPLACE FUNCTION get_merchant_commission_rate(merchant_uuid UUID)
RETURNS NUMERIC AS $$
DECLARE
  override_rate NUMERIC;
  default_rate NUMERIC := 2.5; -- Default commission rate
BEGIN
  -- Check for active override
  SELECT commission_rate INTO override_rate
  FROM merchant_commission_overrides
  WHERE merchant_id = merchant_uuid
    AND status = 'approved'
    AND effective_from <= now()
    AND (effective_until IS NULL OR effective_until >= now())
  ORDER BY effective_from DESC
  LIMIT 1;

  IF override_rate IS NOT NULL THEN
    RETURN override_rate;
  END IF;

  -- Check merchant_settings override
  SELECT commission_override INTO override_rate
  FROM merchant_settings
  WHERE merchant_id = merchant_uuid
    AND (commission_override_expires_at IS NULL OR commission_override_expires_at >= now());

  RETURN COALESCE(override_rate, default_rate);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_merchant_commission_rate IS 'Get current effective commission rate for merchant';

-- =====================================================
-- DEFAULT DATA
-- =====================================================

-- Create default settings for existing merchants (if any)
-- This would be run as part of migration for existing merchants

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Grant permissions to application role
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO molam_app_role;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO molam_app_role;

-- =====================================================
-- COMPLETION
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Brique 75 - Merchant Settings Schema installed successfully';
  RAISE NOTICE '📊 Tables created: 9';
  RAISE NOTICE '⚡ Triggers created: 4';
  RAISE NOTICE '🔧 Functions created: 1';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 Next steps:';
  RAISE NOTICE '   1. Create default settings for existing merchants';
  RAISE NOTICE '   2. Configure branding templates';
  RAISE NOTICE '   3. Set up commission approval workflow';
  RAISE NOTICE '   4. Test settings API endpoints';
END $$;
