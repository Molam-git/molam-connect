-- Pivots de float (banque/route/caisse agent)
CREATE TABLE float_accounts (
  id                BIGSERIAL PRIMARY KEY,
  kind              TEXT NOT NULL CHECK (kind IN ('BANK_ROUTE','AGENT_POOL','CENTRAL')),
  ref_id            BIGINT,                         -- partner_bank_routes.id | agents_pool.id | NULL
  currency          CHAR(3) NOT NULL,
  name              TEXT NOT NULL,
  country_code      CHAR(2) NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kind, ref_id, currency)
);

-- Solde courant et encours réservés
CREATE TABLE float_balances (
  account_id        BIGINT PRIMARY KEY REFERENCES float_accounts(id),
  balance_available NUMERIC(20,4) NOT NULL DEFAULT 0,   -- disponible
  balance_reserved  NUMERIC(20,4) NOT NULL DEFAULT 0,   -- holds (ordres en vol)
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Règles / limites par compte
CREATE TABLE float_policies (
  account_id        BIGINT PRIMARY KEY REFERENCES float_accounts(id),
  min_target        NUMERIC(20,4) NOT NULL DEFAULT 0,   -- cible min SIRA (ajustée dynamiquement)
  max_target        NUMERIC(20,4) NOT NULL DEFAULT 0,   -- plafond
  hard_floor        NUMERIC(20,4) NOT NULL DEFAULT 0,   -- en-dessous => alerte & blocage retraits
  hard_ceiling      NUMERIC(20,4) NOT NULL DEFAULT 0,   -- au-dessus => rebalancement sortant
  daily_withdraw_cap NUMERIC(20,4) NOT NULL DEFAULT 0,  -- cap réglementaire
  allow_outbound    BOOLEAN NOT NULL DEFAULT TRUE,
  allow_inbound     BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prévisions SIRA par fenêtre temporelle glissante
CREATE TABLE float_forecasts (
  id                BIGSERIAL PRIMARY KEY,
  account_id        BIGINT NOT NULL REFERENCES float_accounts(id),
  window_start      TIMESTAMPTZ NOT NULL,
  window_end        TIMESTAMPTZ NOT NULL,
  expected_outflow  NUMERIC(20,4) NOT NULL DEFAULT 0,
  expected_inflow   NUMERIC(20,4) NOT NULL DEFAULT 0,
  target_min        NUMERIC(20,4) NOT NULL DEFAULT 0,   -- écrit par SIRA
  target_max        NUMERIC(20,4) NOT NULL DEFAULT 0,
  model_version     TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, window_start, window_end)
);

-- Ordres de rebalancement inter-comptes (automatiques ou manuels)
CREATE TABLE float_rebalance_orders (
  id                BIGSERIAL PRIMARY KEY,
  order_uuid        UUID NOT NULL UNIQUE,
  src_account_id    BIGINT NOT NULL REFERENCES float_accounts(id),
  dst_account_id    BIGINT NOT NULL REFERENCES float_accounts(id),
  currency          CHAR(3) NOT NULL,
  amount            NUMERIC(20,4) NOT NULL CHECK (amount > 0),
  status            TEXT NOT NULL DEFAULT 'pending',  -- pending|processing|succeeded|failed|canceled
  reason            TEXT NOT NULL,                    -- 'HARD_FLOOR','CEILING','SCHEDULE','MANUAL'
  sira_score        NUMERIC(9,4) NOT NULL DEFAULT 0,
  cost_estimate     NUMERIC(20,4) NOT NULL DEFAULT 0, -- frais estimés
  ext_ref           TEXT,
  created_by        BIGINT,                           -- user_id pour manuel
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Journal (audit simple)
CREATE TABLE float_events (
  id           BIGSERIAL PRIMARY KEY,
  account_id   BIGINT NOT NULL REFERENCES float_accounts(id),
  kind         TEXT NOT NULL, -- 'ALERT','BLOCK','UNBLOCK','ADJUST_TARGET','REBALANCE_CREATED','REBALANCE_SETTLED'
  message      TEXT NOT NULL,
  data         JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour les performances
CREATE INDEX idx_float_accounts_currency ON float_accounts(currency, is_active);
CREATE INDEX idx_float_forecasts_window ON float_forecasts(window_start, window_end);
CREATE INDEX idx_float_rebalance_orders_status ON float_rebalance_orders(status, created_at);
CREATE INDEX idx_float_events_account_created ON float_events(account_id, created_at);