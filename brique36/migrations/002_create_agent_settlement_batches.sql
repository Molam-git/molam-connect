CREATE TABLE IF NOT EXISTS agent_settlement_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id BIGINT NOT NULL,
  currency TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT DEFAULT 'draft',
  total_gross NUMERIC(18,2) DEFAULT 0,
  total_fees NUMERIC(18,2) DEFAULT 0,
  total_agent_due NUMERIC(18,2) DEFAULT 0,
  reserved_buffer NUMERIC(18,2) DEFAULT 0,
  payout_id UUID,
  approved_by JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);