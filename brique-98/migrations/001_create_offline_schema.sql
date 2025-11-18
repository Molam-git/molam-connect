-- =====================================================================
-- Brique 98 — Offline Fallback (QR / USSD) Schema
-- Migration 001: Create offline payment schema
-- =====================================================================
-- Description: Creates tables for offline payment handling when network
--              connectivity is absent. Supports QR and USSD flows with
--              encrypted bundle storage, device signing, and reconciliation.
-- Security: Device signatures, encrypted payloads, immutable audit logs
-- =====================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 1. Offline Devices (Registered POS/Mobile)
-- =====================================================================
-- Stores registered devices that are authorized to create offline bundles
-- Each device has a public/private key pair (private key stored on device only)

CREATE TABLE IF NOT EXISTS offline_devices (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Device identifier (external)
  device_id TEXT NOT NULL UNIQUE, -- POS serial, mobile UUID, IMEI hash

  -- Owner/tenant information
  user_id UUID, -- Operator/merchant user ID
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('merchant', 'agent', 'internal')),
  tenant_id UUID NOT NULL,

  -- Device public key for signature verification
  pubkey_pem TEXT NOT NULL, -- RSA or ECDSA public key in PEM format

  -- Device metadata
  device_type TEXT, -- 'pos', 'mobile', 'pwa'
  device_model TEXT,
  os_version TEXT,

  -- Geographic/currency defaults
  country TEXT, -- ISO 3166-1 alpha-2
  currency_default TEXT, -- ISO 4217

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'suspended')),
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,

  -- Activity tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ,
  total_bundles_pushed INT DEFAULT 0,

  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_offline_devices_tenant ON offline_devices(tenant_type, tenant_id);
CREATE INDEX IF NOT EXISTS idx_offline_devices_status ON offline_devices(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_offline_devices_country ON offline_devices(country);

-- Comments
COMMENT ON TABLE offline_devices IS 'Registered devices authorized to create offline payment bundles';
COMMENT ON COLUMN offline_devices.pubkey_pem IS 'Public key for verifying device signatures (RSA/ECDSA)';
COMMENT ON COLUMN offline_devices.device_id IS 'External device identifier - NEVER store private keys';

-- =====================================================================
-- 2. Offline Transaction Bundles
-- =====================================================================
-- Stores encrypted bundles of offline transactions pushed from devices

CREATE TABLE IF NOT EXISTS offline_tx_bundles (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Bundle identifier (idempotency key from device)
  bundle_id TEXT NOT NULL UNIQUE, -- ULID or KSUID generated on device

  -- Device reference
  device_id TEXT NOT NULL REFERENCES offline_devices(device_id),

  -- Tenant information
  tenant_type TEXT NOT NULL,
  tenant_id UUID NOT NULL,

  -- Geographic context
  country TEXT,
  currency TEXT,

  -- Encrypted payload (AES-GCM encrypted JSON)
  encrypted_payload BYTEA NOT NULL,

  -- Device signature (for verification)
  signature BYTEA NOT NULL,

  -- Decryption metadata (IV, auth tag, wrapped key)
  encryption_meta JSONB, -- { iv, tag, key_wrapped }

  -- Processing status
  status TEXT NOT NULL DEFAULT 'stored' CHECK (status IN (
    'stored',           -- Created but not yet pushed
    'pushed',           -- Pushed to server, awaiting reconciliation
    'processing',       -- Being processed by worker
    'accepted',         -- Successfully reconciled
    'rejected',         -- Rejected due to policy violation
    'quarantined',      -- Suspicious, requires manual review
    'failed'            -- Technical failure during processing
  )),

  -- Push tracking
  push_attempts INT NOT NULL DEFAULT 0,
  last_push_at TIMESTAMPTZ,

  -- Processing result
  error_code TEXT,
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_offline_bundles_status ON offline_tx_bundles(status, last_push_at);
CREATE INDEX IF NOT EXISTS idx_offline_bundles_device ON offline_tx_bundles(device_id);
CREATE INDEX IF NOT EXISTS idx_offline_bundles_tenant ON offline_tx_bundles(tenant_type, tenant_id);
CREATE INDEX IF NOT EXISTS idx_offline_bundles_created ON offline_tx_bundles(created_at DESC);

-- Comments
COMMENT ON TABLE offline_tx_bundles IS 'Encrypted bundles of offline transactions from devices';
COMMENT ON COLUMN offline_tx_bundles.encrypted_payload IS 'AES-GCM encrypted transaction data';
COMMENT ON COLUMN offline_tx_bundles.signature IS 'Device signature over encrypted payload';

-- =====================================================================
-- 3. Offline Transactions (Normalized)
-- =====================================================================
-- Individual transactions extracted from accepted bundles

CREATE TABLE IF NOT EXISTS offline_transactions (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Bundle reference
  bundle_id TEXT NOT NULL REFERENCES offline_tx_bundles(bundle_id),

  -- Upstream ledger reference (when reconciled)
  upstream_tx_id UUID, -- wallet_transactions.id

  -- Transaction parties
  user_sender UUID,
  user_receiver UUID,
  merchant_id UUID,

  -- Transaction details
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('p2p', 'merchant', 'cashin', 'cashout', 'agent')),

  -- Local transaction ID (from device)
  local_tx_id TEXT NOT NULL, -- Device-generated ID

  -- Timing
  initiated_at TIMESTAMPTZ NOT NULL, -- When transaction was created on device
  device_clock TIMESTAMPTZ, -- Device clock timestamp (may differ from initiated_at)

  -- Device context
  device_id TEXT,
  country TEXT,

  -- Processing status
  status TEXT NOT NULL DEFAULT 'pending_offline' CHECK (status IN (
    'pending_offline',  -- Awaiting reconciliation
    'succeeded',        -- Successfully reconciled and posted to ledger
    'failed',           -- Failed to reconcile
    'reversed'          -- Reversed/refunded
  )),

  -- SIRA scoring
  sira_score NUMERIC(5,4),
  sira_action TEXT, -- 'allow', 'review', 'block'

  -- Audit metadata
  audit_metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reconciled_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_offline_tx_status ON offline_transactions(status);
CREATE INDEX IF NOT EXISTS idx_offline_tx_bundle ON offline_transactions(bundle_id);
CREATE INDEX IF NOT EXISTS idx_offline_tx_sender ON offline_transactions(user_sender);
CREATE INDEX IF NOT EXISTS idx_offline_tx_receiver ON offline_transactions(user_receiver);
CREATE INDEX IF NOT EXISTS idx_offline_tx_upstream ON offline_transactions(upstream_tx_id) WHERE upstream_tx_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_offline_tx_initiated ON offline_transactions(initiated_at DESC);

-- Unique constraint (prevent duplicate transactions)
CREATE UNIQUE INDEX IF NOT EXISTS idx_offline_tx_unique ON offline_transactions(bundle_id, local_tx_id);

-- Comments
COMMENT ON TABLE offline_transactions IS 'Individual transactions extracted from offline bundles';
COMMENT ON COLUMN offline_transactions.upstream_tx_id IS 'Reference to wallet_transactions when reconciled';
COMMENT ON COLUMN offline_transactions.device_clock IS 'Device timestamp - may have clock skew';

-- =====================================================================
-- 4. Offline Policies (Ops Configurable)
-- =====================================================================
-- Per-country policies for offline payment limits and rules

CREATE TABLE IF NOT EXISTS offline_policies (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Country (unique per country)
  country TEXT NOT NULL UNIQUE, -- ISO 3166-1 alpha-2

  -- Amount limits
  max_offline_amount NUMERIC(18,2) NOT NULL DEFAULT 100.00,
  max_offline_amount_currency TEXT DEFAULT 'XOF',

  -- Volume limits (per device per day)
  max_offline_per_device_per_day INT NOT NULL DEFAULT 50,
  max_offline_value_per_device_per_day NUMERIC(18,2) DEFAULT 5000.00,

  -- Approval thresholds
  require_agent_approval_above NUMERIC(18,2) DEFAULT 500.00,
  require_manual_review_above NUMERIC(18,2) DEFAULT 1000.00,

  -- Allowed methods
  allowed_methods TEXT[] NOT NULL DEFAULT ARRAY['wallet', 'qr', 'ussd'],

  -- Timing constraints
  max_bundle_age_hours INT DEFAULT 72, -- Max hours between creation and sync
  max_clock_skew_minutes INT DEFAULT 30, -- Max allowed clock skew

  -- SIRA thresholds
  auto_quarantine_above_score NUMERIC(5,4) DEFAULT 0.80,

  -- Feature flags
  enabled BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  updated_by UUID -- User who last updated policy
);

-- Comments
COMMENT ON TABLE offline_policies IS 'Per-country policies for offline payment limits and rules';
COMMENT ON COLUMN offline_policies.max_bundle_age_hours IS 'Maximum time between bundle creation and sync (reject if older)';
COMMENT ON COLUMN offline_policies.max_clock_skew_minutes IS 'Maximum allowed device clock skew';

-- Insert default policies for common countries
INSERT INTO offline_policies (country, max_offline_amount, max_offline_amount_currency, enabled)
VALUES
  ('SN', 10000, 'XOF', true),   -- Senegal
  ('CI', 10000, 'XOF', true),   -- Côte d'Ivoire
  ('ML', 10000, 'XOF', true),   -- Mali
  ('BF', 10000, 'XOF', true),   -- Burkina Faso
  ('TG', 10000, 'XOF', true),   -- Togo
  ('BJ', 10000, 'XOF', true)    -- Benin
ON CONFLICT (country) DO NOTHING;

-- =====================================================================
-- 5. Offline Audit Logs (Immutable)
-- =====================================================================
-- Immutable append-only audit trail for all offline operations

CREATE TABLE IF NOT EXISTS offline_audit_logs (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Subject
  bundle_id TEXT,
  device_id TEXT,
  transaction_id UUID,

  -- Actor (who/what performed the action)
  actor TEXT NOT NULL, -- device_id, user_id, or 'system'
  actor_type TEXT CHECK (actor_type IN ('device', 'user', 'system', 'worker')),

  -- Action
  action TEXT NOT NULL, -- 'bundle_created', 'bundle_pushed', 'signature_verified', etc.

  -- Context
  details JSONB DEFAULT '{}',

  -- Request context
  ip_address INET,
  user_agent TEXT,
  request_id UUID,

  -- Timestamp (immutable)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_offline_audit_bundle ON offline_audit_logs(bundle_id);
CREATE INDEX IF NOT EXISTS idx_offline_audit_device ON offline_audit_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_offline_audit_created ON offline_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offline_audit_action ON offline_audit_logs(action);

-- Prevent updates/deletes (append-only)
CREATE RULE offline_audit_no_update AS ON UPDATE TO offline_audit_logs DO INSTEAD NOTHING;
CREATE RULE offline_audit_no_delete AS ON DELETE TO offline_audit_logs DO INSTEAD NOTHING;

-- Comments
COMMENT ON TABLE offline_audit_logs IS 'Immutable audit trail for offline operations - PCI/SOC2 compliance';
COMMENT ON COLUMN offline_audit_logs.details IS 'Non-sensitive context data (NEVER include private keys or PAN)';

-- =====================================================================
-- 6. Offline Sync Queue (For Worker Processing)
-- =====================================================================
-- Queue for offline bundles awaiting reconciliation

CREATE TABLE IF NOT EXISTS offline_sync_queue (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Bundle reference
  bundle_id TEXT NOT NULL UNIQUE REFERENCES offline_tx_bundles(bundle_id),

  -- Priority (lower = higher priority)
  priority INT DEFAULT 10,

  -- Retry tracking
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 5,
  next_retry_at TIMESTAMPTZ,

  -- Error tracking
  last_error TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON offline_sync_queue(status, next_retry_at NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_sync_queue_priority ON offline_sync_queue(priority, created_at);

-- Comments
COMMENT ON TABLE offline_sync_queue IS 'Queue for processing offline bundles';

-- =====================================================================
-- 7. Device Activity Tracking (For Fraud Detection)
-- =====================================================================
-- Track daily device activity for anomaly detection

CREATE TABLE IF NOT EXISTS offline_device_activity (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Device reference
  device_id TEXT NOT NULL REFERENCES offline_devices(device_id),

  -- Date (unique per device per day)
  activity_date DATE NOT NULL,

  -- Counters
  bundles_pushed INT DEFAULT 0,
  bundles_accepted INT DEFAULT 0,
  bundles_rejected INT DEFAULT 0,
  total_amount NUMERIC(18,2) DEFAULT 0,
  total_transactions INT DEFAULT 0,

  -- High-water marks
  max_single_amount NUMERIC(18,2) DEFAULT 0,

  -- Flags
  anomaly_detected BOOLEAN DEFAULT false,
  flagged_for_review BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- Unique constraint (one record per device per day)
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_activity_unique ON offline_device_activity(device_id, activity_date);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_device_activity_date ON offline_device_activity(activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_device_activity_anomaly ON offline_device_activity(anomaly_detected) WHERE anomaly_detected = true;

-- Comments
COMMENT ON TABLE offline_device_activity IS 'Daily activity tracking per device for fraud detection';

-- =====================================================================
-- 8. Helper Functions
-- =====================================================================

-- Function: Get active offline policy for country
CREATE OR REPLACE FUNCTION get_offline_policy(p_country TEXT)
RETURNS TABLE (
  max_offline_amount NUMERIC,
  max_offline_per_device_per_day INT,
  require_agent_approval_above NUMERIC,
  enabled BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    op.max_offline_amount,
    op.max_offline_per_device_per_day,
    op.require_agent_approval_above,
    op.enabled
  FROM offline_policies op
  WHERE op.country = p_country
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Record device activity
CREATE OR REPLACE FUNCTION record_device_activity(
  p_device_id TEXT,
  p_activity_date DATE,
  p_amount NUMERIC DEFAULT 0,
  p_transaction_count INT DEFAULT 0
) RETURNS VOID AS $$
BEGIN
  INSERT INTO offline_device_activity (device_id, activity_date, total_amount, total_transactions, max_single_amount)
  VALUES (p_device_id, p_activity_date, p_amount, p_transaction_count, p_amount)
  ON CONFLICT (device_id, activity_date)
  DO UPDATE SET
    total_amount = offline_device_activity.total_amount + p_amount,
    total_transactions = offline_device_activity.total_transactions + p_transaction_count,
    max_single_amount = GREATEST(offline_device_activity.max_single_amount, p_amount),
    updated_at = now();
END;
$$ LANGUAGE plpgsql;

-- Function: Check device daily limits
CREATE OR REPLACE FUNCTION check_device_daily_limits(
  p_device_id TEXT,
  p_country TEXT,
  p_additional_amount NUMERIC
) RETURNS TABLE (
  allowed BOOLEAN,
  reason TEXT
) AS $$
DECLARE
  v_policy RECORD;
  v_activity RECORD;
BEGIN
  -- Get policy
  SELECT * INTO v_policy FROM offline_policies WHERE country = p_country;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'no_policy_for_country';
    RETURN;
  END IF;

  IF NOT v_policy.enabled THEN
    RETURN QUERY SELECT false, 'offline_disabled_for_country';
    RETURN;
  END IF;

  -- Get today's activity
  SELECT * INTO v_activity FROM offline_device_activity
  WHERE device_id = p_device_id AND activity_date = CURRENT_DATE;

  -- Check transaction count limit
  IF v_activity.total_transactions IS NOT NULL AND
     v_activity.total_transactions >= v_policy.max_offline_per_device_per_day THEN
    RETURN QUERY SELECT false, 'daily_transaction_limit_exceeded';
    RETURN;
  END IF;

  -- Check value limit
  IF v_activity.total_amount IS NOT NULL AND
     v_policy.max_offline_value_per_device_per_day IS NOT NULL AND
     (v_activity.total_amount + p_additional_amount) > v_policy.max_offline_value_per_device_per_day THEN
    RETURN QUERY SELECT false, 'daily_value_limit_exceeded';
    RETURN;
  END IF;

  -- All checks passed
  RETURN QUERY SELECT true, 'allowed';
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- End of Migration
-- =====================================================================

-- Verify tables created
DO $$
BEGIN
  RAISE NOTICE 'Migration 001 completed successfully';
  RAISE NOTICE 'Created tables:';
  RAISE NOTICE '  - offline_devices';
  RAISE NOTICE '  - offline_tx_bundles';
  RAISE NOTICE '  - offline_transactions';
  RAISE NOTICE '  - offline_policies';
  RAISE NOTICE '  - offline_audit_logs';
  RAISE NOTICE '  - offline_sync_queue';
  RAISE NOTICE '  - offline_device_activity';
  RAISE NOTICE 'Created functions:';
  RAISE NOTICE '  - get_offline_policy()';
  RAISE NOTICE '  - record_device_activity()';
  RAISE NOTICE '  - check_device_daily_limits()';
END $$;
