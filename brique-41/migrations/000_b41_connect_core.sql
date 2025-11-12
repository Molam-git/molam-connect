-- Brique 41 - Molam Connect - Core Schema
-- Migration: 000_b41_connect_core
-- Dependencies: Wallet (B33), Treasury (B34-35)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1) Core Connect Accounts
-- ============================================================================
CREATE TABLE IF NOT EXISTS connect_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_key        TEXT UNIQUE,             -- idempotency/external reference
  owner_user_id       UUID NOT NULL,           -- Molam ID user (account owner)
  wallet_id           UUID NOT NULL,           -- link to molam_wallets(id)
  business_type       TEXT NOT NULL CHECK (business_type IN ('individual','company','platform')),
  display_name        TEXT NOT NULL,
  legal_name          TEXT,
  country             TEXT NOT NULL,
  default_currency    TEXT NOT NULL,
  email               TEXT,
  phone               TEXT,
  website             TEXT,
  category_mcc        TEXT,                    -- merchant category code
  tos_accepted_at     TIMESTAMPTZ,
  onboarding_status   TEXT NOT NULL DEFAULT 'pending'
                      CHECK (onboarding_status IN ('pending','review','approved','rejected','blocked')),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
                      CHECK (verification_status IN ('unverified','pending','verified','failed')),
  risk_level          TEXT NOT NULL DEFAULT 'normal'
                      CHECK (risk_level IN ('low','normal','elevated','high','blocked')),
  payout_schedule     JSONB NOT NULL DEFAULT '{"interval":"weekly","day":"friday","delay_days":2}',
  capabilities        JSONB NOT NULL DEFAULT '{"wallet_payments":false,"card_payments":false,"bank_transfers":false,"marketplace":false}',
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_connect_accounts_owner ON connect_accounts(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_connect_accounts_wallet ON connect_accounts(wallet_id);
CREATE INDEX IF NOT EXISTS idx_connect_accounts_country ON connect_accounts(country);
CREATE INDEX IF NOT EXISTS idx_connect_accounts_status ON connect_accounts(onboarding_status, verification_status);

-- ============================================================================
-- 2) Persons (representatives / UBOs) - reuses Wallet docs when available
-- ============================================================================
CREATE TABLE IF NOT EXISTS connect_persons (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connect_account_id UUID NOT NULL REFERENCES connect_accounts(id) ON DELETE CASCADE,
  linked_wallet_id  UUID,                            -- if person already has Wallet
  role              TEXT NOT NULL CHECK (role IN ('owner','representative','ubo','director')),
  full_name         TEXT NOT NULL,
  email             TEXT,
  phone             TEXT,
  dob               DATE,
  kyc_source        TEXT NOT NULL DEFAULT 'wallet',  -- 'wallet' or 'upload'
  verification_status TEXT NOT NULL DEFAULT 'unverified'
                      CHECK (verification_status IN ('unverified','pending','verified','failed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_connect_persons_account ON connect_persons(connect_account_id);

-- ============================================================================
-- 3) External payout accounts (bank or wallet destination)
-- ============================================================================
CREATE TABLE IF NOT EXISTS connect_external_accounts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connect_account_id UUID NOT NULL REFERENCES connect_accounts(id) ON DELETE CASCADE,
  type               TEXT NOT NULL CHECK (type IN ('bank','wallet')),
  bank_profile_id    UUID,                   -- treasury bank profile (if bank)
  beneficiary        JSONB NOT NULL,         -- masked IBAN/account or wallet ref; encrypted app-side
  currency           TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  is_default         BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_connect_external_accounts_acc ON connect_external_accounts(connect_account_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_connect_external_default
  ON connect_external_accounts(connect_account_id, is_default) WHERE is_default;

-- ============================================================================
-- 4) Onboarding tasks (driven by Ops rules)
-- ============================================================================
CREATE TABLE IF NOT EXISTS connect_onboarding_tasks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connect_account_id UUID NOT NULL REFERENCES connect_accounts(id) ON DELETE CASCADE,
  code               TEXT NOT NULL,                      -- e.g. 'VERIFY_BUSINESS_DOCS'
  title              TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','done','rejected','waived')),
  severity           TEXT NOT NULL DEFAULT 'normal' CHECK (severity IN ('low','normal','high','critical')),
  details            JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_connect_onboarding_tasks_acc ON connect_onboarding_tasks(connect_account_id);
CREATE INDEX IF NOT EXISTS idx_connect_onboarding_tasks_status ON connect_onboarding_tasks(status);

-- ============================================================================
-- 5) Fee & pricing profiles (inherit from global defaults, override per account)
-- ============================================================================
CREATE TABLE IF NOT EXISTS connect_fee_profiles (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connect_account_id UUID REFERENCES connect_accounts(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,                       -- e.g. 'default', 'enterprise'
  fees               JSONB NOT NULL,                      -- {"card":{"percent":2.25,"fixed":0.23}, "wallet":{"percent":0.9,"fixed":0}}
  active             BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_connect_fee_profiles_acc ON connect_fee_profiles(connect_account_id);

-- ============================================================================
-- 6) Webhook endpoints (per merchant)
-- ============================================================================
CREATE TABLE IF NOT EXISTS connect_webhooks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connect_account_id UUID NOT NULL REFERENCES connect_accounts(id) ON DELETE CASCADE,
  url                TEXT NOT NULL,
  secret             TEXT NOT NULL,          -- HMAC secret (rotate-able)
  enabled            BOOLEAN NOT NULL DEFAULT true,
  events             TEXT[] NOT NULL DEFAULT ARRAY['payment.succeeded','payment.failed','payout.sent','payout.settled'],
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 7) Audit logs (immutable-ish)
-- ============================================================================
CREATE TABLE IF NOT EXISTS connect_audit_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connect_account_id UUID,
  actor              TEXT NOT NULL,          -- user id or system
  action             TEXT NOT NULL,
  details            JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_connect_audit_logs_acc ON connect_audit_logs(connect_account_id);
CREATE INDEX IF NOT EXISTS idx_connect_audit_logs_action ON connect_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_connect_audit_logs_created ON connect_audit_logs(created_at);
