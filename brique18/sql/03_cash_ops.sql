-- 03_cash_ops.sql
CREATE TABLE IF NOT EXISTS molam_cash_operations (
  op_id             BIGSERIAL PRIMARY KEY,
  idempotency_key   TEXT NOT NULL UNIQUE,
  op_type           TEXT NOT NULL,                 -- 'CASHIN_SELF'|'CASHIN_OTHER'|'CASHOUT'
  agent_id          BIGINT NOT NULL REFERENCES molam_agents(agent_id),
  terminal_id       BIGINT REFERENCES molam_agent_terminals(terminal_id),
  emitter_user_id   BIGINT,                        -- null si cashout (l'émetteur est le système/agent)
  receiver_user_id  BIGINT NOT NULL,               -- bénéficiaire final
  currency          TEXT NOT NULL,
  amount_minor      BIGINT NOT NULL,               -- montant principal
  fee_minor         BIGINT NOT NULL DEFAULT 0,     -- frais totaux facturés à l'émetteur
  agent_commission_minor BIGINT NOT NULL DEFAULT 0,
  net_amount_minor  BIGINT NOT NULL,               -- crédit/débit net du wallet
  status            TEXT NOT NULL,                 -- 'PENDING'|'APPROVED'|'DECLINED'|'SETTLED'|'CANCELLED'
  country_code      TEXT NOT NULL,
  kyc_level_applied TEXT NOT NULL,
  sira_score        NUMERIC(5,2),                  -- 0..100
  sira_flags        JSONB DEFAULT '{}'::JSONB,
  metadata          JSONB DEFAULT '{}'::JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON molam_cash_operations(agent_id, created_at);
CREATE INDEX ON molam_cash_operations(emitter_user_id, created_at);
CREATE INDEX ON molam_cash_operations(receiver_user_id, created_at);