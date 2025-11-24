-- 1) Agents (référentiel) — déjà existant, on complète si besoin
CREATE TABLE IF NOT EXISTS molam_agents (
  agent_id           UUID PRIMARY KEY,
  user_id            UUID NOT NULL,
  country_code       TEXT NOT NULL,
  default_currency   TEXT NOT NULL,
  bank_profile_id    UUID,
  status             TEXT NOT NULL CHECK (status IN ('ACTIVE','SUSPENDED')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Profils bancaires agents
CREATE TABLE IF NOT EXISTS agent_bank_profiles (
  bank_profile_id    UUID PRIMARY KEY,
  agent_id           UUID NOT NULL REFERENCES molam_agents(agent_id),
  payout_channel     TEXT NOT NULL CHECK (payout_channel IN ('BANK','WALLET')),
  bank_name          TEXT,
  bank_account_iban  TEXT,
  bank_account_no    TEXT,
  bank_swift         TEXT,
  wallet_provider    TEXT,
  wallet_msisdn      TEXT,
  currency           TEXT NOT NULL,
  is_verified        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, currency)
);

-- 3) Paramétrage des préférences de versement
CREATE TABLE IF NOT EXISTS agent_payout_preferences (
  agent_id           UUID NOT NULL REFERENCES molam_agents(agent_id),
  currency           TEXT NOT NULL,
  frequency          TEXT NOT NULL CHECK (frequency IN ('WEEKLY','MONTHLY')),
  min_payout_threshold NUMERIC(18,6) NOT NULL DEFAULT 10.00,
  auto_withhold      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, currency)
);

-- 4) Solde de commissions agent
CREATE TABLE IF NOT EXISTS agent_commission_balances (
  agent_id           UUID NOT NULL REFERENCES molam_agents(agent_id),
  currency           TEXT NOT NULL,
  available_amount   NUMERIC(18,6) NOT NULL DEFAULT 0,
  pending_amount     NUMERIC(18,6) NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, currency)
);

-- 5) Événements de commission
CREATE TABLE IF NOT EXISTS agent_commission_events (
  event_id           UUID PRIMARY KEY,
  agent_id           UUID NOT NULL REFERENCES molam_agents(agent_id),
  currency           TEXT NOT NULL,
  amount             NUMERIC(18,6) NOT NULL CHECK (amount > 0),
  source_txn_id      UUID NOT NULL,
  source_type        TEXT NOT NULL CHECK (source_type IN ('CASH_IN_OTHER','CASH_OUT_INTERMEDIATION')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  accounted          BOOLEAN NOT NULL DEFAULT FALSE
);

-- 6) Cycles de versement
CREATE TABLE IF NOT EXISTS agent_payout_cycles (
  cycle_id           UUID PRIMARY KEY,
  agent_id           UUID NOT NULL REFERENCES molam_agents(agent_id),
  currency           TEXT NOT NULL,
  frequency          TEXT NOT NULL CHECK (frequency IN ('WEEKLY','MONTHLY')),
  period_start       TIMESTAMPTZ NOT NULL,
  period_end         TIMESTAMPTZ NOT NULL,
  sira_risk_score    INT NOT NULL DEFAULT 0,
  status             TEXT NOT NULL CHECK (status IN ('DRAFT','READY','ON_HOLD','PROCESSING','PAID','REJECTED','CANCELLED')),
  total_events       INT NOT NULL DEFAULT 0,
  gross_amount       NUMERIC(18,6) NOT NULL DEFAULT 0,
  fees_amount        NUMERIC(18,6) NOT NULL DEFAULT 0,
  net_amount         NUMERIC(18,6) NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, currency, period_start, period_end)
);

-- 7) Détail des éléments d'un cycle
CREATE TABLE IF NOT EXISTS agent_payout_items (
  item_id            UUID PRIMARY KEY,
  cycle_id           UUID NOT NULL REFERENCES agent_payout_cycles(cycle_id),
  event_id           UUID NOT NULL REFERENCES agent_commission_events(event_id),
  amount             NUMERIC(18,6) NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, event_id)
);

-- 8) Exécution de virement
CREATE TABLE IF NOT EXISTS agent_payouts (
  payout_id          UUID PRIMARY KEY,
  cycle_id           UUID NOT NULL REFERENCES agent_payout_cycles(cycle_id),
  agent_id           UUID NOT NULL REFERENCES molam_agents(agent_id),
  currency           TEXT NOT NULL,
  destination        JSONB NOT NULL,
  requested_amount   NUMERIC(18,6) NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('REQUESTED','SENT','CONFIRMED','FAILED')),
  provider_name      TEXT,
  provider_ref       TEXT,
  requested_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key    TEXT NOT NULL,
  UNIQUE (idempotency_key)
);

-- 9) Audit des actions
CREATE TABLE IF NOT EXISTS agent_payout_approvals (
  approval_id        UUID PRIMARY KEY,
  payout_id          UUID NOT NULL REFERENCES agent_payouts(payout_id),
  approver_user_id   UUID NOT NULL,
  level              INT NOT NULL CHECK (level IN (1,2)),
  status             TEXT NOT NULL CHECK (status IN ('APPROVED','REJECTED')),
  comment            TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payout_id, level)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_agent_commission_events_agent ON agent_commission_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_payout_cycles_agent ON agent_payout_cycles(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_commission_balances_agent ON agent_commission_balances(agent_id);