-- Brique 42 - Connect Payments
-- Migration: 001_b42_connect_payments
-- Dependencies: Brique 41 (Connect Accounts), Wallet (B33), Treasury (B34-35)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1) Payment Intents (checkout/session)
-- ============================================================================
CREATE TABLE IF NOT EXISTS connect_payment_intents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connect_account_id  UUID NOT NULL REFERENCES connect_accounts(id) ON DELETE CASCADE,
  external_key        TEXT UNIQUE,              -- idempotency from client
  amount              NUMERIC(18,2) NOT NULL,
  currency            TEXT NOT NULL,
  capture_method      TEXT NOT NULL DEFAULT 'automatic' CHECK (capture_method IN ('automatic','manual')),
  payment_method_opts JSONB NOT NULL DEFAULT '{}', -- {wallet:{..}, card:{..}}
  customer_ref        TEXT,
  description         TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}',
  status              TEXT NOT NULL DEFAULT 'requires_confirmation'
                      CHECK (status IN ('requires_confirmation','processing','requires_capture','succeeded','canceled','failed')),
  client_secret       TEXT NOT NULL,           -- short token to confirm client-side
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpi_account_status ON connect_payment_intents(connect_account_id,status);
CREATE INDEX IF NOT EXISTS idx_cpi_created ON connect_payment_intents(created_at);

-- ============================================================================
-- 2) Charges (actual funds movement authorizations/captures)
-- ============================================================================
CREATE TABLE IF NOT EXISTS connect_charges (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id           UUID NOT NULL REFERENCES connect_payment_intents(id) ON DELETE CASCADE,
  connect_account_id  UUID NOT NULL REFERENCES connect_accounts(id) ON DELETE CASCADE,
  method              TEXT NOT NULL CHECK (method IN ('wallet','card','bank')),
  amount_authorized   NUMERIC(18,2) NOT NULL,
  amount_captured     NUMERIC(18,2) DEFAULT 0,
  currency            TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'authorized'
                      CHECK (status IN ('authorized','captured','partially_refunded','refunded','canceled','failed')),
  provider_ref        TEXT,                     -- gateway/bank reference
  fraud_score         NUMERIC(6,2) DEFAULT 0,   -- SIRA score
  risk_label          TEXT DEFAULT 'normal' CHECK (risk_label IN ('low','normal','elevated','high','blocked')),
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_charges_intent ON connect_charges(intent_id);
CREATE INDEX IF NOT EXISTS idx_charges_account_status ON connect_charges(connect_account_id,status);
CREATE INDEX IF NOT EXISTS idx_charges_created ON connect_charges(created_at);

-- ============================================================================
-- 3) Refunds
-- ============================================================================
CREATE TABLE IF NOT EXISTS connect_refunds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id           UUID NOT NULL REFERENCES connect_charges(id) ON DELETE CASCADE,
  connect_account_id  UUID NOT NULL REFERENCES connect_accounts(id) ON DELETE CASCADE,
  amount              NUMERIC(18,2) NOT NULL,
  currency            TEXT NOT NULL,
  reason              TEXT,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')),
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refunds_charge ON connect_refunds(charge_id);
CREATE INDEX IF NOT EXISTS idx_refunds_account ON connect_refunds(connect_account_id);

-- ============================================================================
-- 4) Real-time event bus (outbox) + deliveries
-- ============================================================================
CREATE TABLE IF NOT EXISTS connect_events_outbox (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connect_account_id  UUID,
  type                TEXT NOT NULL,         -- payment.*, refund.*, charge.*
  data                JSONB NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_events_type_time ON connect_events_outbox(type,created_at);
CREATE INDEX IF NOT EXISTS idx_events_delivered ON connect_events_outbox(delivered_at) WHERE delivered_at IS NULL;

CREATE TABLE IF NOT EXISTS connect_webhook_deliveries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES connect_events_outbox(id) ON DELETE CASCADE,
  endpoint_id         UUID NOT NULL REFERENCES connect_webhooks(id) ON DELETE CASCADE,
  attempt             INT NOT NULL DEFAULT 1,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ok','retry','failed')),
  response_code       INT,
  response_ms         INT,
  next_attempt_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event ON connect_webhook_deliveries(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON connect_webhook_deliveries(status, next_attempt_at);

-- ============================================================================
-- 5) Ops-config live (marketing, payments, risk)
-- ============================================================================
CREATE TABLE IF NOT EXISTS connect_ops_configs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope               TEXT NOT NULL,          -- 'global' | 'account:{id}'
  key                 TEXT NOT NULL,          -- 'checkout.banner', 'payments.card.enabled'
  value               JSONB NOT NULL,
  updated_by          TEXT NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(scope,key)
);

CREATE INDEX IF NOT EXISTS idx_ops_configs_scope ON connect_ops_configs(scope);

-- ============================================================================
-- 6) Settlement rules (including 3-day minimum for manual payouts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS connect_settlement_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connect_account_id  UUID NOT NULL REFERENCES connect_accounts(id) ON DELETE CASCADE,
  mode                TEXT NOT NULL CHECK (mode IN ('weekly','monthly','manual')),
  weekday             TEXT,                   -- if weekly (e.g. 'friday')
  month_day           INT,                    -- if monthly (1..28)
  min_hold_days       INT NOT NULL DEFAULT 3, -- NEVER < 3 (anti-fraud)
  active              BOOLEAN NOT NULL DEFAULT true,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT min_hold_days_floor CHECK (min_hold_days >= 3)
);

CREATE INDEX IF NOT EXISTS idx_settlement_rules_acc ON connect_settlement_rules(connect_account_id,active);

-- ============================================================================
-- 7) Eligibility per charge for payout
-- ============================================================================
CREATE TABLE IF NOT EXISTS connect_payout_eligibility (
  charge_id           UUID PRIMARY KEY REFERENCES connect_charges(id) ON DELETE CASCADE,
  connect_account_id  UUID NOT NULL REFERENCES connect_accounts(id) ON DELETE CASCADE,
  eligible_at         TIMESTAMPTZ NOT NULL,   -- created_at + min_hold_days (+ dispute window if high risk)
  reason              TEXT NOT NULL,          -- explanation of hold period
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payout_eligibility_account ON connect_payout_eligibility(connect_account_id, eligible_at);
CREATE INDEX IF NOT EXISTS idx_payout_eligibility_date ON connect_payout_eligibility(eligible_at);
