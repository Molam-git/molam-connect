-- src/migrations/19_02_statements.sql
-- Etats de commissions (pré-payout)
CREATE TABLE IF NOT EXISTS molam_agent_statements (
  statement_id      BIGSERIAL PRIMARY KEY,
  agent_id          BIGINT NOT NULL REFERENCES molam_agents(agent_id),
  currency          TEXT   NOT NULL,
  period_start      TIMESTAMPTZ NOT NULL,
  period_end        TIMESTAMPTZ NOT NULL,
  status            TEXT NOT NULL DEFAULT 'OPEN', -- OPEN|LOCKED|CANCELLED|PAID
  gross_minor       BIGINT NOT NULL DEFAULT 0,    -- commissions brutes des ops incluses
  adjustments_minor BIGINT NOT NULL DEFAULT 0,    -- somme des ajustements (peut être +/-)
  net_minor         BIGINT NOT NULL DEFAULT 0,    -- gross + adjustments
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at         TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  UNIQUE(agent_id, currency, period_start, period_end)
);

-- Détail des opérations incluses dans un statement (lignes)
CREATE TABLE IF NOT EXISTS molam_agent_statement_lines (
  line_id           BIGSERIAL PRIMARY KEY,
  statement_id      BIGINT NOT NULL REFERENCES molam_agent_statements(statement_id) ON DELETE CASCADE,
  op_id             BIGINT NOT NULL REFERENCES molam_cash_operations(op_id),
  fee_minor         BIGINT NOT NULL,
  agent_share_minor BIGINT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(statement_id, op_id)
);

-- Ajustements manuels/automatiques (chargeback, pénalité fraude, bonus commercial…)
CREATE TABLE IF NOT EXISTS molam_agent_commission_adjustments (
  adjustment_id     BIGSERIAL PRIMARY KEY,
  agent_id          BIGINT NOT NULL REFERENCES molam_agents(agent_id),
  currency          TEXT   NOT NULL,
  amount_minor      BIGINT NOT NULL,            -- +/- (positif = bonus, négatif = pénalité)
  reason_code       TEXT   NOT NULL,            -- 'CHARGEBACK'|'FRAUD'|'MANUAL_FIX'|'PROMO'...
  related_statement BIGINT REFERENCES molam_agent_statements(statement_id),
  related_op_id     BIGINT REFERENCES molam_cash_operations(op_id),
  created_by        BIGINT,                     -- employee user id (auditable)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ajout d'un champ statement_line_id sur molam_agent_commissions pour traçabilité
ALTER TABLE molam_agent_commissions
  ADD COLUMN IF NOT EXISTS statement_line_id BIGINT;

-- Index utiles
CREATE INDEX IF NOT EXISTS idx_statements_agent ON molam_agent_statements(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_adj_agent ON molam_agent_commission_adjustments(agent_id, created_at);