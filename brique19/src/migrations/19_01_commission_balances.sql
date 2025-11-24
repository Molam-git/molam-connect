-- src/migrations/19_01_commission_balances.sql
-- Vue et soldes courants par agent/devise
CREATE TABLE IF NOT EXISTS molam_agent_commission_balances (
  agent_id          BIGINT NOT NULL,
  currency          TEXT   NOT NULL,
  accrued_minor     BIGINT NOT NULL DEFAULT 0,  -- total accumulé (non verrouillé)
  locked_minor      BIGINT NOT NULL DEFAULT 0,  -- total verrouillé (dans un statement)
  paid_minor        BIGINT NOT NULL DEFAULT 0,  -- total payé (Brique 20)
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(agent_id, currency)
);

-- Index utiles
CREATE INDEX IF NOT EXISTS idx_comm_balances_agent ON molam_agent_commission_balances(agent_id);