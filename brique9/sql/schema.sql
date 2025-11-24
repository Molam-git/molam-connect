-- 1. Master data for billers (utilities, TV, internet providers...)
CREATE TABLE IF NOT EXISTS molam_billers (
  biller_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  legal_name       TEXT,
  country_code     TEXT NOT NULL,          -- ISO-3166-1 alpha-2
  currency         TEXT NOT NULL,          -- ISO-4217
  category         TEXT NOT NULL,          -- WATER, POWER, TV, INTERNET, STREAMING
  status           TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE
  settlement_schedule TEXT NOT NULL DEFAULT 'WEEKLY', -- WEEKLY, MONTHLY
  settlement_day   INT DEFAULT 1,          -- For MONTHLY: day of month; for WEEKLY: weekday(1..7)
  webhook_url      TEXT,                   -- Biller callback for payment ack
  webhook_secret   TEXT,                   -- HMAC secret for callbacks we send
  integration_kind TEXT NOT NULL DEFAULT 'API', -- API, FILE, MANUAL
  api_base_url     TEXT,                   -- if integration_kind = API
  api_auth_type    TEXT,                   -- MTLS, OAUTH2, BASIC
  api_client_id    TEXT,
  api_client_secret TEXT,
  api_cert_ref     TEXT,                   -- reference to mTLS cert in Vault/HSM
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Bill products (e.g., electricity prepaid/postpaid, water postpaid, specific bouquet for TV)
CREATE TABLE IF NOT EXISTS molam_biller_products (
  product_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  biller_id        UUID NOT NULL REFERENCES molam_billers(biller_id),
  product_code     TEXT NOT NULL,
  product_name     TEXT NOT NULL,
  kind             TEXT NOT NULL,         -- PREPAID, POSTPAID, SUBSCRIPTION
  min_amount       NUMERIC(18,2) DEFAULT 0,
  max_amount       NUMERIC(18,2),
  metadata         JSONB DEFAULT '{}'::jsonb,
  status           TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (biller_id, product_code)
);

-- 3. Customer bill accounts (contract reference binding to a Molam user)
CREATE TABLE IF NOT EXISTS molam_bill_accounts (
  account_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES molam_users(user_id),
  biller_id        UUID NOT NULL REFERENCES molam_billers(biller_id),
  product_id       UUID REFERENCES molam_biller_products(product_id),
  customer_ref     TEXT NOT NULL,         -- e.g., meter number, subscriber number
  nickname         TEXT,
  country_code     TEXT NOT NULL,
  currency         TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'ACTIVE',
  last_verified_at TIMESTAMPTZ,
  extra            JSONB DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, biller_id, customer_ref)
);

-- 4. Bill invoices (for POSTPAID/SUBSCRIPTION; PREPAID may not have invoice_id)
CREATE TABLE IF NOT EXISTS molam_bill_invoices (
  invoice_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  biller_id        UUID NOT NULL REFERENCES molam_billers(biller_id),
  account_id       UUID NOT NULL REFERENCES molam_bill_accounts(account_id),
  period_start     DATE,
  period_end       DATE,
  amount_due       NUMERIC(18,2) NOT NULL,
  currency         TEXT NOT NULL,
  due_date         DATE,
  external_ref     TEXT,                   -- biller reference
  status           TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, PARTIAL, PAID, CANCELLED
  metadata         JSONB DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  INDEX (biller_id, status)
);

-- 5. Bill payments (core transactions)
CREATE TABLE IF NOT EXISTS molam_bill_payments (
  bill_payment_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES molam_users(user_id),
  account_id       UUID NOT NULL REFERENCES molam_bill_accounts(account_id),
  biller_id        UUID NOT NULL REFERENCES molam_billers(biller_id),
  product_id       UUID REFERENCES molam_biller_products(product_id),
  invoice_id       UUID REFERENCES molam_bill_invoices(invoice_id),
  wallet_id        UUID NOT NULL REFERENCES molam_wallets(wallet_id),
  amount           NUMERIC(18,2) NOT NULL,
  currency         TEXT NOT NULL,
  fx_rate          NUMERIC(18,8),          -- if conversion happened
  user_fee         NUMERIC(18,2) NOT NULL DEFAULT 0, -- 0 for free categories
  partner_fee      NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_debit      NUMERIC(18,2) NOT NULL, -- amount + user_fee
  status           TEXT NOT NULL DEFAULT 'INIT', -- INIT, AUTHORIZED, SENT_TO_BILLER, CONFIRMED, FAILED, REFUNDED
  idempotency_key  TEXT NOT NULL,
  sira_score       NUMERIC(5,2),
  audit_id         UUID,                   -- link to molam_audit_logs
  external_tx_id   TEXT,                   -- partner payment ref
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at     TIMESTAMPTZ,
  failure_reason   TEXT,
  metadata         JSONB DEFAULT '{}'::jsonb,
  UNIQUE (idempotency_key),
  INDEX (user_id, status),
  INDEX (biller_id, status)
);

-- 6. Webhook logs (callbacks we send to billers or receive from them)
CREATE TABLE IF NOT EXISTS molam_bill_webhooks (
  webhook_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction        TEXT NOT NULL,          -- OUTBOUND, INBOUND
  biller_id        UUID REFERENCES molam_billers(biller_id),
  url              TEXT NOT NULL,
  payload          JSONB NOT NULL,
  headers          JSONB NOT NULL,
  status_code      INT,
  signature_valid  BOOLEAN,
  delivery_status  TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, SUCCESS, FAILED, RETRYING
  attempts         INT NOT NULL DEFAULT 0,
  next_retry_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Reconciliation (file/API result vs Molam ledger)
CREATE TABLE IF NOT EXISTS molam_bill_recon (
  recon_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  biller_id        UUID NOT NULL REFERENCES molam_billers(biller_id),
  period_date      DATE NOT NULL,
  partner_total    NUMERIC(18,2) NOT NULL,
  molam_total      NUMERIC(18,2) NOT NULL,
  variance         NUMERIC(18,2) NOT NULL,
  status           TEXT NOT NULL DEFAULT 'OPEN', -- OPEN, RESOLVED
  details          JSONB DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (biller_id, period_date)
);