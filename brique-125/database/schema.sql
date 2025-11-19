-- ============================================================================
-- Brique 125 — Multi-currency FX execution & cost evaluation
-- ============================================================================

CREATE TABLE IF NOT EXISTS fx_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency CHAR(3) NOT NULL,
  to_currency CHAR(3) NOT NULL,
  rate NUMERIC(20,10) NOT NULL,
  spread NUMERIC(12,6),
  provider TEXT NOT NULL,
  cost NUMERIC(20,6),
  valid_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fx_quotes_pair ON fx_quotes(from_currency,to_currency);

CREATE TABLE IF NOT EXISTS fx_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES fx_quotes(id),
  plan_id UUID REFERENCES treasury_plans(id),
  amount_from NUMERIC(24,6),
  amount_to NUMERIC(24,6),
  executed_by TEXT,
  status TEXT DEFAULT 'pending',
  provider TEXT,
  ledger_txn_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
