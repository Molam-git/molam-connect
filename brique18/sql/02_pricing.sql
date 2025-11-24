-- 02_pricing.sql
CREATE TABLE IF NOT EXISTS molam_pricing_agents (
  pricing_id      BIGSERIAL PRIMARY KEY,
  country_code    TEXT NOT NULL,            -- SN, CI, US...
  currency        TEXT NOT NULL,            -- XOF, USD...
  kyc_level       TEXT NOT NULL,            -- P1/P2
  op_type         TEXT NOT NULL,            -- 'CASHIN_SELF'|'CASHIN_OTHER'|'CASHOUT'
  fee_type        TEXT NOT NULL,            -- 'PERCENT'|'FLAT'|'MIXED'|'FREE'
  percent_bp      INTEGER NOT NULL DEFAULT 0,   -- basis points (1% = 100 bp)
  flat_minor      BIGINT  NOT NULL DEFAULT 0,   -- en minor units (XOF=1, USD=cent)
  min_fee_minor   BIGINT  NOT NULL DEFAULT 0,
  max_fee_minor   BIGINT  NOT NULL DEFAULT 0,
  agent_share_bp  INTEGER NOT NULL DEFAULT 0,   -- part de commission agent (en bp du fee)
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to        TIMESTAMPTZ
);

CREATE INDEX ON molam_pricing_agents(country_code, currency, kyc_level, op_type, is_active);