-- Brique 26 — Float Management (Sira)
-- Modèle de données PostgreSQL

-- 1) Entités de float (agents, banques, MMO)
CREATE TABLE IF NOT EXISTS float_entities (
  id              BIGSERIAL PRIMARY KEY,
  entity_type     TEXT NOT NULL,         -- 'agent' | 'bank' | 'mmo'
  ref_id          TEXT NOT NULL,         -- agent_id / bank_account_id / mmo_pool_id
  country         TEXT NOT NULL,
  currency        TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active', -- active|paused
  meta            JSONB NOT NULL DEFAULT '{}',
  UNIQUE(entity_type, ref_id)
);

-- 2) Position temps-réel (vue matérialisée + table)
CREATE TABLE IF NOT EXISTS float_positions (
  entity_id       BIGINT NOT NULL REFERENCES float_entities(id) ON DELETE CASCADE,
  as_of           TIMESTAMPTZ NOT NULL,
  balance         NUMERIC(18,2) NOT NULL DEFAULT 0,
  reserved        NUMERIC(18,2) NOT NULL DEFAULT 0,     -- montants bloqués
  available       NUMERIC(18,2) NOT NULL DEFAULT 0,     -- balance - reserved
  currency        TEXT NOT NULL,
  PRIMARY KEY(entity_id, as_of)
);

-- 3) Seuils/paramètres (par entité, ajustables)
CREATE TABLE IF NOT EXISTS float_rules (
  entity_id       BIGINT PRIMARY KEY REFERENCES float_entities(id) ON DELETE CASCADE,
  min_level       NUMERIC(18,2) NOT NULL DEFAULT 0,
  target_level    NUMERIC(18,2) NOT NULL DEFAULT 0,
  max_level       NUMERIC(18,2) NOT NULL DEFAULT 0,
  daily_growth_bp INTEGER NOT NULL DEFAULT 0,           -- tendance (basis points)
  volatility_bp   INTEGER NOT NULL DEFAULT 0,           -- écart-type approximatif
  lead_minutes    INTEGER NOT NULL DEFAULT 120,         -- temps de transfert typique
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4) Prévisions Sira (horizon court)
CREATE TABLE IF NOT EXISTS float_forecasts (
  entity_id       BIGINT NOT NULL REFERENCES float_entities(id) ON DELETE CASCADE,
  horizon_min     INTEGER NOT NULL,                     -- 15, 60, 180...
  forecast_avail  NUMERIC(18,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(entity_id, horizon_min, created_at)
);

-- 5) Ordres de rééquilibrage (plan + exécution)
CREATE TABLE IF NOT EXISTS float_transfers (
  id              BIGSERIAL PRIMARY KEY,
  plan_id         UUID NOT NULL,                        -- regroupement d'un cycle
  from_entity_id  BIGINT NOT NULL REFERENCES float_entities(id),
  to_entity_id    BIGINT NOT NULL REFERENCES float_entities(id),
  amount          NUMERIC(18,2) NOT NULL,
  currency        TEXT NOT NULL,
  reason          TEXT NOT NULL,                        -- replenish|collect|settlement
  status          TEXT NOT NULL DEFAULT 'planned',      -- planned|sent|confirmed|failed|canceled
  eta_minutes     INTEGER NOT NULL DEFAULT 60,
  external_ref    TEXT,
  created_by      BIGINT,                               -- user id (ops) si manuel
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6) Alertes
CREATE TABLE IF NOT EXISTS float_alerts (
  id              BIGSERIAL PRIMARY KEY,
  entity_id       BIGINT NOT NULL REFERENCES float_entities(id),
  alert_type      TEXT NOT NULL,                        -- low_liquidity|breach|min_violation|volatility|fraud_pattern
  severity        TEXT NOT NULL,                        -- info|warn|critical
  message         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged    BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by BIGINT,
  acknowledged_at TIMESTAMPTZ
);

-- 7) Index utiles
CREATE INDEX IF NOT EXISTS idx_float_positions_latest ON float_positions(entity_id, as_of DESC);
CREATE INDEX IF NOT EXISTS idx_float_transfers_status ON float_transfers(status, created_at DESC);