-- ============================================================================
-- Brique 138 — Agent Dashboard
-- ============================================================================

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  molam_id TEXT UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  region TEXT,
  country TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  merchant_id UUID,
  amount NUMERIC(18, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  sale_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  region VARCHAR(100),
  country VARCHAR(5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_float (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL,
  last_update TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS agent_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  commission_rate NUMERIC(5, 2) NOT NULL,
  commission_amount NUMERIC(18, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  source VARCHAR(50) NOT NULL,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_sales_date ON agent_sales(sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_agent_sales_agent_currency ON agent_sales(agent_id, currency);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_date ON agent_commissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_agent_currency ON agent_commissions(agent_id, currency);
CREATE INDEX IF NOT EXISTS idx_agent_float_agent_currency ON agent_float(agent_id, currency);

