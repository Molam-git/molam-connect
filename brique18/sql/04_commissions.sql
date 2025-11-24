-- 04_commissions.sql
CREATE TABLE IF NOT EXISTS molam_agent_commissions (
  commission_id      BIGSERIAL PRIMARY KEY,
  op_id              BIGINT NOT NULL REFERENCES molam_cash_operations(op_id),
  agent_id           BIGINT NOT NULL REFERENCES molam_agents(agent_id),
  currency           TEXT NOT NULL,
  fee_minor          BIGINT NOT NULL,
  agent_share_minor  BIGINT NOT NULL,          -- part de l'agent
  molam_share_minor  BIGINT NOT NULL,          -- part Molam
  status             TEXT NOT NULL DEFAULT 'ACCRUED', -- 'ACCRUED'|'PAID'
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at            TIMESTAMPTZ
);