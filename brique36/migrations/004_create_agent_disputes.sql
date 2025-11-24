CREATE TABLE IF NOT EXISTS agent_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id BIGINT NOT NULL,
  batch_id UUID REFERENCES agent_settlement_batches(id),
  txn_id UUID,
  amount NUMERIC(18,2),
  reason TEXT,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);