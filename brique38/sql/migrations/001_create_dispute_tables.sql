-- Migration pour les tables de gestion des litiges
CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref TEXT,
  origin TEXT NOT NULL,
  origin_id UUID,
  transaction_id UUID,
  amount NUMERIC(18,2),
  currency TEXT,
  dispute_type TEXT NOT NULL,
  status TEXT DEFAULT 'submitted',
  priority TEXT DEFAULT 'normal',
  assigned_to TEXT,
  sla_due TIMESTAMPTZ,
  resolution JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_disputes_status ON disputes(status);
CREATE INDEX idx_disputes_txn ON disputes(transaction_id);

CREATE TABLE IF NOT EXISTS dispute_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID REFERENCES disputes(id) ON DELETE CASCADE,
  uploader_id UUID,
  evidence_type TEXT,
  s3_key TEXT NOT NULL,
  hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispute_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID REFERENCES disputes(id) ON DELETE CASCADE,
  actor TEXT,
  action TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispute_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  conditions JSONB,
  action JSONB,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispute_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID REFERENCES disputes(id),
  escalated_by TEXT,
  reason TEXT,
  level INT DEFAULT 1,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now()
);