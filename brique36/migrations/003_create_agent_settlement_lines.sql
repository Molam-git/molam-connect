CREATE TABLE IF NOT EXISTS agent_settlement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES agent_settlement_batches(id) ON DELETE CASCADE,
  wallet_txn_id UUID,
  type TEXT,
  amount NUMERIC(18,2),
  fee_molam NUMERIC(18,2) DEFAULT 0,
  fee_partner NUMERIC(18,2) DEFAULT 0,
  agent_share NUMERIC(18,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);