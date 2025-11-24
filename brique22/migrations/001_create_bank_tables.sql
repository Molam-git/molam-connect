-- banks
CREATE TABLE partner_banks (
  id              BIGSERIAL PRIMARY KEY,
  code            TEXT UNIQUE NOT NULL,         -- e.g. "CBA-KE", "BNP-FR"
  name            TEXT NOT NULL,
  country_code    CHAR(2) NOT NULL,             -- ISO-3166
  currency        CHAR(3) NOT NULL,             -- default settlement currency
  status          TEXT NOT NULL DEFAULT 'active', -- active|paused
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- bank routes (rails)
CREATE TABLE partner_bank_routes (
  id              BIGSERIAL PRIMARY KEY,
  bank_id         BIGINT NOT NULL REFERENCES partner_banks(id),
  rail            TEXT NOT NULL,                -- 'SEPA'|'SWIFT'|'ACH'|'RTGS'|'LOCAL'
  min_kyc_level   TEXT NOT NULL DEFAULT 'P1',   -- P1|P2|P3
  min_amount      NUMERIC(18,2) NOT NULL DEFAULT 0,
  max_amount      NUMERIC(18,2) NOT NULL DEFAULT 100000000,
  fee_fixed_bank  NUMERIC(18,2) NOT NULL DEFAULT 0,     -- bank fixed fee in route currency
  fee_percent_bank NUMERIC(9,4) NOT NULL DEFAULT 0,     -- e.g. 1.0000 = 1%
  fee_fixed_molam  NUMERIC(18,2) NOT NULL DEFAULT 0,    -- optional fixed Molam fee
  fee_percent_molam NUMERIC(9,4) NOT NULL DEFAULT 0.0090, -- 0.90% default
  currency        CHAR(3) NOT NULL,             -- fee currency on this rail
  sla_seconds     INT NOT NULL DEFAULT 86400,   -- expected completion
  success_rate_30d NUMERIC(5,2) NOT NULL DEFAULT 99.00, -- SIRA signal
  is_deposit_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  is_withdraw_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- route-specific constraints by geography (optional)
CREATE TABLE partner_bank_route_regions (
  id            BIGSERIAL PRIMARY KEY,
  route_id      BIGINT NOT NULL REFERENCES partner_bank_routes(id),
  from_country  CHAR(2) NOT NULL, -- sender country
  to_country    CHAR(2) NOT NULL  -- receiver country
);

-- mapping comptes de règlement de Molam dans la banque
CREATE TABLE bank_settlement_accounts (
  id            BIGSERIAL PRIMARY KEY,
  route_id      BIGINT NOT NULL REFERENCES partner_bank_routes(id),
  account_iban  TEXT,
  account_number TEXT,
  account_name  TEXT NOT NULL,
  metadata      JSONB NOT NULL DEFAULT '{}',
  active        BOOLEAN NOT NULL DEFAULT TRUE
);

-- demandes d'interop bancaires (ordres)
CREATE TABLE bank_transfer_orders (
  id               BIGSERIAL PRIMARY KEY,
  order_uuid       UUID NOT NULL UNIQUE,
  user_id          BIGINT NOT NULL REFERENCES molam_users(id),
  wallet_id        BIGINT NOT NULL REFERENCES molam_wallets(id),
  direction        TEXT NOT NULL,              -- 'deposit' | 'withdraw'
  bank_id          BIGINT NOT NULL REFERENCES partner_banks(id),
  route_id         BIGINT NOT NULL REFERENCES partner_bank_routes(id),
  amount           NUMERIC(18,2) NOT NULL,     -- amount before fees
  currency         CHAR(3) NOT NULL,
  fee_bank_fixed   NUMERIC(18,2) NOT NULL,
  fee_bank_percent NUMERIC(18,2) NOT NULL,
  fee_molam_fixed  NUMERIC(18,2) NOT NULL,
  fee_molam_percent NUMERIC(18,2) NOT NULL,
  fee_total        NUMERIC(18,2) NOT NULL,
  amount_net       NUMERIC(18,2) NOT NULL,     -- user sees this (credited/debited)
  status           TEXT NOT NULL DEFAULT 'pending', -- pending|processing|succeeded|failed|canceled
  reason_code      TEXT,
  external_ref     TEXT,                       -- bank reference
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- index
CREATE INDEX idx_bank_transfer_orders_user ON bank_transfer_orders(user_id, created_at DESC);

-- Seed data
INSERT INTO partner_banks(code, name, country_code, currency) VALUES
('BOA-US', 'Bank of America', 'US', 'USD'),
('CBA-KE', 'Commercial Bank of Africa', 'KE', 'KES');

INSERT INTO partner_bank_routes(bank_id, rail, min_kyc_level, currency, fee_fixed_bank, fee_percent_bank, fee_fixed_molam, fee_percent_molam, sla_seconds, success_rate_30d)
SELECT id, 'SWIFT', 'P2', 'USD', 2.00, 0.0100, 0.00, 0.0090, 86400, 98.50 FROM partner_banks WHERE code='BOA-US';

INSERT INTO partner_bank_routes(bank_id, rail, min_kyc_level, currency, fee_fixed_bank, fee_percent_bank, fee_fixed_molam, fee_percent_molam, sla_seconds, success_rate_30d)
SELECT id, 'LOCAL', 'P1', 'KES', 50.00, 0.0020, 0.00, 0.0090, 3600, 99.20 FROM partner_banks WHERE code='CBA-KE';