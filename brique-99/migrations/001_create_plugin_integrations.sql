/**
 * Brique 99 — Plugin Integrations Schema
 *
 * Stores plugin connections for various e-commerce platforms
 * (WooCommerce, Shopify, Magento, PrestaShop, Wix, etc.)
 *
 * Security:
 * - oauth_client_secret_cipher must be encrypted with KMS before insert
 * - webhook signatures verified before processing
 * - Mode switching (test/live) requires merchant verification
 */

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- Plugin Integrations Table
-- =====================================================================

CREATE TABLE IF NOT EXISTS plugin_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES connect_accounts(id),

  -- CMS/Platform identification
  cms_type TEXT NOT NULL CHECK (cms_type IN (
    'woocommerce',
    'shopify',
    'magento',
    'prestashop',
    'wix',
    'squarespace',
    'bigcommerce',
    'opencart',
    'generic'
  )),
  site_url TEXT NOT NULL,
  site_name TEXT,

  -- OAuth credentials (encrypted)
  oauth_client_id TEXT NOT NULL UNIQUE,
  oauth_client_secret_cipher BYTEA NOT NULL, -- Encrypted with KMS

  -- Webhook configuration
  webhook_endpoint_id UUID REFERENCES webhook_endpoints(id),
  webhook_secret_cipher BYTEA, -- Encrypted webhook signing secret

  -- Mode and status
  mode TEXT NOT NULL DEFAULT 'test' CHECK (mode IN ('test', 'live')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',     -- OAuth flow initiated
    'active',      -- Connected and working
    'revoked',     -- Merchant revoked access
    'suspended',   -- Suspended by admin
    'error'        -- Connection error
  )),

  -- Metadata and configuration
  metadata JSONB DEFAULT '{}'::jsonb,
  plugin_version TEXT,
  last_sync_at TIMESTAMPTZ,

  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Unique constraint: one integration per merchant per CMS per site
  UNIQUE(merchant_id, cms_type, site_url)
);

-- Indexes
CREATE INDEX idx_plugin_integration_merchant ON plugin_integrations(merchant_id);
CREATE INDEX idx_plugin_integration_status ON plugin_integrations(status);
CREATE INDEX idx_plugin_integration_cms_type ON plugin_integrations(cms_type);
CREATE INDEX idx_plugin_integration_mode ON plugin_integrations(mode);

-- =====================================================================
-- Plugin API Keys Table (for backward compatibility)
-- =====================================================================

-- Some plugins may use simple API keys instead of OAuth
CREATE TABLE IF NOT EXISTS plugin_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES plugin_integrations(id) ON DELETE CASCADE,

  key_type TEXT NOT NULL CHECK (key_type IN ('publishable', 'secret')),
  key_prefix TEXT NOT NULL, -- First 8 chars for display
  key_hash TEXT NOT NULL,   -- SHA-256 hash of full key
  key_cipher BYTEA,         -- Encrypted full key (for secret keys only)

  mode TEXT NOT NULL CHECK (mode IN ('test', 'live')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),

  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(integration_id, key_type, mode)
);

CREATE INDEX idx_plugin_api_keys_integration ON plugin_api_keys(integration_id);
CREATE INDEX idx_plugin_api_keys_hash ON plugin_api_keys(key_hash);

-- =====================================================================
-- Plugin Sync Logs Table
-- =====================================================================

-- Track configuration syncs between Molam dashboard and plugins
CREATE TABLE IF NOT EXISTS plugin_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES plugin_integrations(id) ON DELETE CASCADE,

  sync_type TEXT NOT NULL, -- config, payment_methods, branding, webhooks
  sync_direction TEXT NOT NULL CHECK (sync_direction IN ('push', 'pull')),

  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
  changes JSONB, -- What changed
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plugin_sync_logs_integration ON plugin_sync_logs(integration_id);
CREATE INDEX idx_plugin_sync_logs_type ON plugin_sync_logs(sync_type);
CREATE INDEX idx_plugin_sync_logs_created ON plugin_sync_logs(created_at DESC);

-- =====================================================================
-- Plugin Installation Logs Table
-- =====================================================================

-- Track plugin installations and uninstallations
CREATE TABLE IF NOT EXISTS plugin_installation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID REFERENCES plugin_integrations(id) ON DELETE SET NULL,
  merchant_id UUID NOT NULL REFERENCES connect_accounts(id),

  action TEXT NOT NULL CHECK (action IN ('install', 'uninstall', 'upgrade')),
  cms_type TEXT NOT NULL,
  plugin_version TEXT,

  site_url TEXT,
  ip_address INET,
  user_agent TEXT,

  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plugin_install_logs_merchant ON plugin_installation_logs(merchant_id);
CREATE INDEX idx_plugin_install_logs_action ON plugin_installation_logs(action);
CREATE INDEX idx_plugin_install_logs_created ON plugin_installation_logs(created_at DESC);

-- =====================================================================
-- Helper Functions
-- =====================================================================

/**
 * Get active integration for merchant and CMS type
 */
CREATE OR REPLACE FUNCTION get_active_integration(
  p_merchant_id UUID,
  p_cms_type TEXT,
  p_site_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  integration_id UUID,
  oauth_client_id TEXT,
  mode TEXT,
  status TEXT,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    id,
    pi.oauth_client_id,
    pi.mode,
    pi.status,
    pi.metadata
  FROM plugin_integrations pi
  WHERE pi.merchant_id = p_merchant_id
    AND pi.cms_type = p_cms_type
    AND (p_site_url IS NULL OR pi.site_url = p_site_url)
    AND pi.status = 'active'
  ORDER BY pi.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

/**
 * Record plugin sync event
 */
CREATE OR REPLACE FUNCTION record_plugin_sync(
  p_integration_id UUID,
  p_sync_type TEXT,
  p_sync_direction TEXT,
  p_status TEXT,
  p_changes JSONB DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO plugin_sync_logs (
    integration_id,
    sync_type,
    sync_direction,
    status,
    changes,
    error_message
  )
  VALUES (
    p_integration_id,
    p_sync_type,
    p_sync_direction,
    p_status,
    p_changes,
    p_error_message
  )
  RETURNING id INTO v_log_id;

  -- Update integration last_sync_at
  UPDATE plugin_integrations
  SET last_sync_at = now()
  WHERE id = p_integration_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Check if merchant can activate live mode
 */
CREATE OR REPLACE FUNCTION can_activate_live_mode(p_merchant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_verified BOOLEAN;
BEGIN
  SELECT is_kyc_verified INTO v_is_verified
  FROM connect_accounts
  WHERE id = p_merchant_id;

  RETURN COALESCE(v_is_verified, FALSE);
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- Default Data
-- =====================================================================

-- Insert default webhook event subscriptions for plugins
CREATE TABLE IF NOT EXISTS plugin_default_webhook_events (
  cms_type TEXT PRIMARY KEY,
  events TEXT[] NOT NULL
);

INSERT INTO plugin_default_webhook_events (cms_type, events) VALUES
  ('woocommerce', ARRAY['payment.succeeded', 'payment.failed', 'refund.created', 'refund.succeeded', 'invoice.finalized']),
  ('shopify', ARRAY['payment.succeeded', 'payment.failed', 'refund.created', 'refund.succeeded']),
  ('magento', ARRAY['payment.succeeded', 'payment.failed', 'refund.created', 'invoice.finalized']),
  ('prestashop', ARRAY['payment.succeeded', 'payment.failed', 'refund.created']),
  ('wix', ARRAY['payment.succeeded', 'payment.failed']),
  ('generic', ARRAY['payment.succeeded', 'payment.failed', 'refund.created'])
ON CONFLICT (cms_type) DO NOTHING;

-- =====================================================================
-- Triggers
-- =====================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_plugin_integration_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER plugin_integration_updated
  BEFORE UPDATE ON plugin_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_plugin_integration_timestamp();

-- =====================================================================
-- Comments
-- =====================================================================

COMMENT ON TABLE plugin_integrations IS 'Stores plugin connections for e-commerce platforms';
COMMENT ON COLUMN plugin_integrations.oauth_client_secret_cipher IS 'Encrypted OAuth client secret (KMS encrypted)';
COMMENT ON COLUMN plugin_integrations.webhook_secret_cipher IS 'Encrypted webhook signing secret (KMS encrypted)';
COMMENT ON COLUMN plugin_integrations.mode IS 'Test or live mode (live requires merchant KYC verification)';
COMMENT ON COLUMN plugin_integrations.status IS 'Current status of the integration';

COMMENT ON TABLE plugin_api_keys IS 'API keys for plugins (alternative to OAuth for simple integrations)';
COMMENT ON TABLE plugin_sync_logs IS 'Tracks configuration synchronization between dashboard and plugins';
COMMENT ON TABLE plugin_installation_logs IS 'Audit log for plugin installations/uninstallations';
