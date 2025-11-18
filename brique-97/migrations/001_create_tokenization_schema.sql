-- =====================================================================
-- Brique 97 — PCI Tokenization Mode + Hosted Fallback
-- Migration 001: Create tokenization schema
-- =====================================================================
-- Description: Creates tables for secure payment method tokenization,
--              client token management, and comprehensive audit logging.
-- Security: PCI-DSS compliant design with encrypted token storage
-- =====================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 1. Payment Methods Vault
-- =====================================================================
-- Stores tokenized payment methods (cards, bank accounts)
-- Actual sensitive data (PAN, etc.) stored in external HSM/KMS
-- Only encrypted references and metadata stored here

CREATE TABLE IF NOT EXISTS payment_methods (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant information (who owns this payment method)
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('user', 'merchant', 'agent')),
  tenant_id UUID NOT NULL,

  -- Payment method type
  type TEXT NOT NULL CHECK (type IN ('card', 'bank_account', 'mobile_money')),
  provider TEXT NOT NULL, -- 'molam_hosted', 'stripe', 'adyen', etc.

  -- Token reference (encrypted blob - actual token in HSM/KMS)
  -- This is an encrypted reference to the actual token in the vault
  token BYTEA NOT NULL, -- Encrypted with KMS

  -- Metadata (non-sensitive, for display purposes)
  last4 TEXT, -- Last 4 digits for display
  brand TEXT, -- 'visa', 'mastercard', 'amex', etc.
  exp_month SMALLINT CHECK (exp_month BETWEEN 1 AND 12),
  exp_year SMALLINT CHECK (exp_year >= EXTRACT(YEAR FROM CURRENT_DATE)),
  country TEXT, -- ISO 3166-1 alpha-2
  billing_address JSONB, -- Non-sensitive billing info

  -- Flags
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  -- Usage policy (security controls)
  usage_policy JSONB DEFAULT '{}', -- { one_time, max_amount, allowed_countries, require_3ds, etc. }

  -- Fingerprint (for duplicate detection)
  fingerprint TEXT, -- Hash of card details for duplicate detection

  -- Audit trail
  created_by UUID, -- Molam user ID (RBAC)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID,
  revoked_reason TEXT,

  -- Soft delete
  deleted_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}' -- Custom merchant metadata
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pm_tenant ON payment_methods(tenant_type, tenant_id) WHERE is_active = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pm_fingerprint ON payment_methods(fingerprint) WHERE fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pm_created_at ON payment_methods(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pm_revoked_at ON payment_methods(revoked_at) WHERE revoked_at IS NOT NULL;

-- Ensure only one default payment method per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_pm_default_per_tenant
  ON payment_methods(tenant_type, tenant_id)
  WHERE is_default = true AND is_active = true AND deleted_at IS NULL;

-- Comments
COMMENT ON TABLE payment_methods IS 'Vaulted payment methods with encrypted token references';
COMMENT ON COLUMN payment_methods.token IS 'Encrypted reference to actual token in HSM/KMS - NEVER store raw PAN';
COMMENT ON COLUMN payment_methods.usage_policy IS 'Security policies: {one_time:bool, max_amount:number, allowed_countries:[], require_3ds:bool}';
COMMENT ON COLUMN payment_methods.fingerprint IS 'Hash for duplicate detection - NOT for security';

-- =====================================================================
-- 2. Client Tokens (Short-Lived)
-- =====================================================================
-- Ephemeral tokens used to authenticate iframe/hosted field sessions
-- Single-use, short TTL (<=120s), scoped to merchant and origin

CREATE TABLE IF NOT EXISTS client_tokens (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Token value (random, base64url encoded)
  token TEXT UNIQUE NOT NULL,

  -- Scoping
  merchant_id UUID NOT NULL,
  origin TEXT, -- Allowed origin (merchant domain) for CORS validation
  ip_address INET, -- Optional IP binding for additional security

  -- Lifecycle
  ttl_seconds INT NOT NULL DEFAULT 120 CHECK (ttl_seconds <= 300), -- Max 5 minutes
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMPTZ,

  -- Security metadata
  user_agent TEXT,
  risk_score NUMERIC(3,2), -- From SIRA

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,

  -- Audit
  created_by UUID, -- User who requested token
  metadata JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ct_token ON client_tokens(token) WHERE used = false AND expires_at > now();
CREATE INDEX IF NOT EXISTS idx_ct_merchant ON client_tokens(merchant_id);
CREATE INDEX IF NOT EXISTS idx_ct_expires_at ON client_tokens(expires_at);

-- Auto-cleanup trigger (optional - can also use worker)
CREATE OR REPLACE FUNCTION cleanup_expired_client_tokens() RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM client_tokens WHERE expires_at < now() - INTERVAL '1 hour';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cleanup_client_tokens
  AFTER INSERT ON client_tokens
  EXECUTE FUNCTION cleanup_expired_client_tokens();

-- Comments
COMMENT ON TABLE client_tokens IS 'Short-lived tokens for hosted iframe authentication - single-use only';
COMMENT ON COLUMN client_tokens.ttl_seconds IS 'Time-to-live in seconds, max 300s (5 min)';
COMMENT ON COLUMN client_tokens.used IS 'Prevents replay attacks - token can only be used once';

-- =====================================================================
-- 3. Payment Method Audit Log
-- =====================================================================
-- Immutable append-only audit trail for all payment method operations
-- Critical for PCI compliance and fraud investigation

CREATE TABLE IF NOT EXISTS payment_method_audit (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Subject
  payment_method_id UUID REFERENCES payment_methods(id),
  client_token_id UUID REFERENCES client_tokens(id),

  -- Action
  action TEXT NOT NULL CHECK (action IN (
    'created',
    'used',
    'revoked',
    'updated',
    'failed_use',
    'expired',
    'deleted'
  )),

  -- Actor (who performed the action)
  actor_type TEXT CHECK (actor_type IN ('user', 'system', 'merchant', 'admin')),
  actor_id UUID,

  -- Details (non-sensitive)
  details JSONB DEFAULT '{}', -- { charge_id, error_code, reason, etc. }

  -- Context
  ip_address INET,
  user_agent TEXT,
  request_id UUID, -- For correlation with application logs

  -- Timestamp (immutable)
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pma_payment_method ON payment_method_audit(payment_method_id);
CREATE INDEX IF NOT EXISTS idx_pma_created_at ON payment_method_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pma_action ON payment_method_audit(action);
CREATE INDEX IF NOT EXISTS idx_pma_actor ON payment_method_audit(actor_id);

-- Prevent updates/deletes (append-only)
CREATE RULE payment_method_audit_no_update AS ON UPDATE TO payment_method_audit DO INSTEAD NOTHING;
CREATE RULE payment_method_audit_no_delete AS ON DELETE TO payment_method_audit DO INSTEAD NOTHING;

-- Comments
COMMENT ON TABLE payment_method_audit IS 'Immutable audit log for payment method operations - PCI compliance';
COMMENT ON COLUMN payment_method_audit.details IS 'Non-sensitive context (NEVER include PAN or sensitive data)';

-- =====================================================================
-- 4. Token Encryption Keys (Metadata Only)
-- =====================================================================
-- Tracks KMS key versions for token encryption/decryption
-- Actual keys stored in KMS/HSM, not in database

CREATE TABLE IF NOT EXISTS token_encryption_keys (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Key reference (NOT the actual key)
  key_id TEXT UNIQUE NOT NULL, -- KMS/HSM key identifier
  key_version TEXT,

  -- Status
  status TEXT NOT NULL CHECK (status IN ('active', 'rotating', 'retired')),

  -- Usage tracking
  tokens_encrypted_count BIGINT DEFAULT 0,

  -- Lifecycle
  activated_at TIMESTAMPTZ DEFAULT now(),
  retired_at TIMESTAMPTZ,

  -- Metadata
  algorithm TEXT, -- 'AES-256-GCM', 'RSA-4096', etc.
  provider TEXT, -- 'aws_kms', 'gcp_kms', 'azure_keyvault', 'hsm'
  metadata JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tek_status ON token_encryption_keys(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tek_active_key ON token_encryption_keys(status) WHERE status = 'active';

-- Comments
COMMENT ON TABLE token_encryption_keys IS 'Metadata for KMS/HSM encryption keys - NOT the actual keys';
COMMENT ON COLUMN token_encryption_keys.key_id IS 'Reference to KMS/HSM key - actual key never stored in DB';

-- =====================================================================
-- 5. Tokenization Events (for webhooks)
-- =====================================================================
-- Events to be published for payment method lifecycle changes

CREATE TABLE IF NOT EXISTS tokenization_events (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event type
  event_type TEXT NOT NULL, -- 'payment_method.created', 'payment_method.revoked', etc.

  -- Subject
  payment_method_id UUID REFERENCES payment_methods(id),

  -- Tenant
  tenant_type TEXT NOT NULL,
  tenant_id UUID NOT NULL,

  -- Payload (webhook body)
  payload JSONB NOT NULL,

  -- Processing status
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  retry_count INT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_te_processed ON tokenization_events(processed, created_at) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_te_payment_method ON tokenization_events(payment_method_id);

-- Comments
COMMENT ON TABLE tokenization_events IS 'Events to be published to webhooks for payment method changes';

-- =====================================================================
-- 6. Helper Functions
-- =====================================================================

-- Function: Get active payment methods for a tenant
CREATE OR REPLACE FUNCTION get_active_payment_methods(
  p_tenant_type TEXT,
  p_tenant_id UUID
) RETURNS TABLE (
  id UUID,
  type TEXT,
  last4 TEXT,
  brand TEXT,
  exp_month SMALLINT,
  exp_year SMALLINT,
  is_default BOOLEAN,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pm.id,
    pm.type,
    pm.last4,
    pm.brand,
    pm.exp_month,
    pm.exp_year,
    pm.is_default,
    pm.created_at
  FROM payment_methods pm
  WHERE pm.tenant_type = p_tenant_type
    AND pm.tenant_id = p_tenant_id
    AND pm.is_active = true
    AND pm.deleted_at IS NULL
  ORDER BY pm.is_default DESC, pm.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Revoke payment method
CREATE OR REPLACE FUNCTION revoke_payment_method(
  p_payment_method_id UUID,
  p_revoked_by UUID,
  p_reason TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE payment_methods
  SET
    is_active = false,
    revoked_at = now(),
    revoked_by = p_revoked_by,
    revoked_reason = p_reason,
    updated_at = now()
  WHERE id = p_payment_method_id
    AND is_active = true;

  IF FOUND THEN
    INSERT INTO payment_method_audit (payment_method_id, action, actor_id, details)
    VALUES (p_payment_method_id, 'revoked', p_revoked_by, jsonb_build_object('reason', p_reason));
    RETURN true;
  ELSE
    RETURN false;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 7. Row-Level Security (RLS) - Optional but Recommended
-- =====================================================================

-- Enable RLS on payment_methods
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own payment methods
CREATE POLICY payment_methods_tenant_isolation ON payment_methods
  FOR SELECT
  USING (
    -- This would be customized based on your authentication system
    -- Example: tenant_id = current_setting('app.user_id')::uuid
    true -- Placeholder - implement based on your auth system
  );

-- =====================================================================
-- 8. Grants (adjust based on your role structure)
-- =====================================================================

-- Grant appropriate permissions to application role
-- GRANT SELECT, INSERT, UPDATE ON payment_methods TO app_role;
-- GRANT SELECT, INSERT ON client_tokens TO app_role;
-- GRANT INSERT ON payment_method_audit TO app_role;

-- =====================================================================
-- End of Migration
-- =====================================================================

-- Verify tables created
DO $$
BEGIN
  RAISE NOTICE 'Migration 001 completed successfully';
  RAISE NOTICE 'Created tables:';
  RAISE NOTICE '  - payment_methods';
  RAISE NOTICE '  - client_tokens';
  RAISE NOTICE '  - payment_method_audit';
  RAISE NOTICE '  - token_encryption_keys';
  RAISE NOTICE '  - tokenization_events';
  RAISE NOTICE 'Created functions:';
  RAISE NOTICE '  - get_active_payment_methods()';
  RAISE NOTICE '  - revoke_payment_method()';
END $$;
