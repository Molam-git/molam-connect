-- 0) Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1) Bank partners master
CREATE TABLE IF NOT EXISTS bank_partners (
  id              BIGSERIAL PRIMARY KEY,
  code            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  countries       TEXT[] NOT NULL,
  currencies      TEXT[] NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  webhook_url     TEXT,
  ip_allowlist    INET[] DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Partner API keys / mTLS material
CREATE TABLE IF NOT EXISTS bank_partner_keys (
  id              BIGSERIAL PRIMARY KEY,
  partner_id      BIGINT NOT NULL REFERENCES bank_partners(id) ON DELETE CASCADE,
  hmac_secret     TEXT NOT NULL,
  mtls_cert_cn    TEXT,
  mtls_cert_pem   TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) Settlement rails config
CREATE TABLE IF NOT EXISTS bank_settlement_rails (
  id              BIGSERIAL PRIMARY KEY,
  partner_id      BIGINT NOT NULL REFERENCES bank_partners(id) ON DELETE CASCADE,
  rail_code       TEXT NOT NULL,
  country         TEXT NOT NULL,
  currency        TEXT NOT NULL,
  supports_in     BOOLEAN NOT NULL DEFAULT true,
  supports_out    BOOLEAN NOT NULL DEFAULT true,
  bank_fee_fixed  NUMERIC(18,4) NOT NULL DEFAULT 0,
  bank_fee_pct    NUMERIC(6,4)  NOT NULL DEFAULT 0,
  molam_fee_fixed NUMERIC(18,4) NOT NULL DEFAULT 0,
  molam_fee_pct   NUMERIC(6,4)  NOT NULL DEFAULT 0.009,
  min_amount      NUMERIC(18,2) NOT NULL DEFAULT 0,
  max_amount      NUMERIC(18,2) NOT NULL DEFAULT 0,
  sla_minutes     INTEGER NOT NULL DEFAULT 1440,
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(partner_id, rail_code, country, currency)
);

-- 4) Molam settlement accounts
CREATE TABLE IF NOT EXISTS bank_partner_accounts (
  id              BIGSERIAL PRIMARY KEY,
  partner_id      BIGINT NOT NULL REFERENCES bank_partners(id) ON DELETE CASCADE,
  country         TEXT NOT NULL,
  currency        TEXT NOT NULL,
  account_name    TEXT NOT NULL,
  account_number  TEXT NOT NULL,
  bank_identifier TEXT,
  meta            JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(partner_id, country, currency, account_number)
);

-- 5) User-linked bank accounts
CREATE TABLE IF NOT EXISTS bank_links (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL,
  country         TEXT NOT NULL,
  currency        TEXT NOT NULL,
  account_name    TEXT NOT NULL,
  account_number  TEXT NOT NULL,
  bank_identifier TEXT,
  verified        BOOLEAN NOT NULL DEFAULT false,
  verification_at TIMESTAMPTZ,
  partner_id      BIGINT REFERENCES bank_partners(id),
  rail_code       TEXT,
  meta            JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, country, currency, account_number)
);

-- 6) Transfers (bank <-> wallet)
CREATE TABLE IF NOT EXISTS bank_transfers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  direction         TEXT NOT NULL,
  user_id           BIGINT NOT NULL,
  wallet_id         BIGINT NOT NULL,
  partner_id        BIGINT NOT NULL REFERENCES bank_partners(id),
  rail_code         TEXT NOT NULL,
  bank_link_id      BIGINT,
  amount            NUMERIC(18,2) NOT NULL,
  currency          TEXT NOT NULL,
  country           TEXT NOT NULL,
  bank_fee          NUMERIC(18,2) NOT NULL DEFAULT 0,
  molam_fee         NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_fee         NUMERIC(18,2) NOT NULL DEFAULT 0,
  amount_net        NUMERIC(18,2) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'created',
  external_ref      TEXT,
  idempotency_key   TEXT NOT NULL,
  initiated_by      BIGINT NOT NULL,
  initiated_via     TEXT NOT NULL,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at      TIMESTAMPTZ,
  failure_reason    TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT uniq_idem UNIQUE(idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_bank_transfers_user ON bank_transfers(user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_transfers_partner ON bank_transfers(partner_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_transfers_status ON bank_transfers(status);

-- 7) Webhook ingestion
CREATE TABLE IF NOT EXISTS bank_webhook_events (
  id             BIGSERIAL PRIMARY KEY,
  partner_id     BIGINT NOT NULL REFERENCES bank_partners(id),
  event_id       TEXT NOT NULL,
  event_type     TEXT NOT NULL,
  payload        JSONB NOT NULL,
  signature_ok   BOOLEAN NOT NULL DEFAULT false,
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed      BOOLEAN NOT NULL DEFAULT false,
  processed_at   TIMESTAMPTZ
);

-- 8) Reconciliation gaps
CREATE TABLE IF NOT EXISTS bank_recon_discrepancies (
  id            BIGSERIAL PRIMARY KEY,
  partner_id    BIGINT NOT NULL REFERENCES bank_partners(id),
  date_value    DATE NOT NULL,
  currency      TEXT NOT NULL,
  amount_stmt   NUMERIC(18,2) NOT NULL,
  amount_ledger NUMERIC(18,2) NOT NULL,
  delta         NUMERIC(18,2) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);