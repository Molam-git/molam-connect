-- Migration initiale pour le module Reporting Agents (Brique 21)
-- Tables et vues matérialisées pour les rapports agents

-- 1) Table d'exports (traçabilité + signature)
CREATE TABLE IF NOT EXISTS report_exports (
  export_id         UUID PRIMARY KEY,
  scope_type        TEXT NOT NULL CHECK (scope_type IN ('AGENT','INTERNAL')),
  scope_ref         UUID,               -- agent_id si AGENT
  report_type       TEXT NOT NULL CHECK (report_type IN ('KPIS','EVENTS','PAYOUTS','BALANCES')),
  params            JSONB NOT NULL,     -- période/devise/filtre
  file_path         TEXT NOT NULL,
  file_sha256       TEXT NOT NULL,
  signature_algo    TEXT NOT NULL CHECK (signature_algo IN ('ED25519','HMAC-SHA256')),
  signature_value   TEXT NOT NULL,
  created_by        UUID,               -- user_id (employé ou agent)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour les recherches par scope et date
CREATE INDEX IF NOT EXISTS idx_report_exports_scope ON report_exports(scope_type, scope_ref);
CREATE INDEX IF NOT EXISTS idx_report_exports_created_at ON report_exports(created_at DESC);

-- 2) KPI quotidiens par agent/devise (vue matérialisée)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_agent_kpis_daily AS
SELECT
  date_trunc('day', wt.ts) AS day,
  wt.agent_id,
  wt.currency,
  COUNT(*)                                       AS txn_count,
  SUM(CASE WHEN wt.type='CASH_IN'  AND wt.channel='AGENT' THEN wt.amount ELSE 0 END) AS cash_in_total,
  SUM(CASE WHEN wt.type='CASH_OUT' AND wt.channel='AGENT' THEN wt.amount ELSE 0 END) AS cash_out_total,
  SUM(CASE WHEN wt.type='P2P'      AND wt.channel='AGENT' THEN wt.amount ELSE 0 END) AS p2p_agent_total,
  SUM(CASE WHEN wt.type='P2P'      AND wt.channel='APP'   THEN wt.amount ELSE 0 END) AS p2p_app_total
FROM wallet_transactions wt
WHERE wt.status='SUCCESS' AND wt.agent_id IS NOT NULL
GROUP BY 1,2,3;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_agent_kpis_daily
ON mv_agent_kpis_daily(day, agent_id, currency);

-- 3) Vue matérialisée commissions/parité
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_agent_commissions_daily AS
SELECT
  date_trunc('day', e.created_at) AS day,
  e.agent_id,
  e.currency,
  COUNT(*)                       AS events_count,
  SUM(e.amount)                  AS commission_gross
FROM agent_commission_events e
GROUP BY 1,2,3;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_agent_comm_daily
ON mv_agent_commissions_daily(day, agent_id, currency);

-- 4) Vue payouts (confirmés) par jour
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_agent_payouts_daily AS
SELECT
  date_trunc('day', p.updated_at) AS day,
  p.agent_id,
  p.currency,
  COUNT(*)                        AS payouts_count,
  SUM(CASE WHEN p.status='CONFIRMED' THEN p.requested_amount ELSE 0 END) AS payouts_net
FROM agent_payouts p
GROUP BY 1,2,3;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_agent_payouts_daily
ON mv_agent_payouts_daily(day, agent_id, currency);

-- Commentaires pour la documentation
COMMENT ON TABLE report_exports IS 'Table de traçabilité des exports de rapports agents (signés cryptographiquement)';
COMMENT ON MATERIALIZED VIEW mv_agent_kpis_daily IS 'Vue matérialisée des KPI quotidiens par agent et devise';
COMMENT ON MATERIALIZED VIEW mv_agent_commissions_daily IS 'Vue matérialisée des commissions quotidiennes par agent';
COMMENT ON MATERIALIZED VIEW mv_agent_payouts_daily IS 'Vue matérialisée des versements quotidiens par agent';