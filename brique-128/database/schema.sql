-- ============================================================================
-- Brique 128 — Settlement Engine Scaling & Atomic Settlement
-- ============================================================================

-- Settlement instructions (atomic units of work)
CREATE TABLE IF NOT EXISTS settlement_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID,
  bank_profile_id UUID NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  rail TEXT NOT NULL CHECK (rail IN ('REST','SEPA','SWIFT','ACH','RTGS','ISO20022','MT940','local')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','confirmed','failed','rerouted')),
  retries INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 5,
  bank_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  failure_reason TEXT,
  idempotency_key TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_settlement_status ON settlement_instructions(status);
CREATE INDEX IF NOT EXISTS idx_settlement_payout ON settlement_instructions(payout_id);
CREATE INDEX IF NOT EXISTS idx_settlement_created ON settlement_instructions(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_settlement_idempot ON settlement_instructions(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Settlement logs (immutable audit trail)
CREATE TABLE IF NOT EXISTS settlement_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instruction_id UUID NOT NULL REFERENCES settlement_instructions(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_logs_instr ON settlement_logs(instruction_id);
CREATE INDEX IF NOT EXISTS idx_settlement_logs_created ON settlement_logs(created_at DESC);

-- Settlement batches (for bulk processing)
CREATE TABLE IF NOT EXISTS settlement_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_ref TEXT UNIQUE NOT NULL,
  total_instructions INTEGER NOT NULL DEFAULT 0,
  confirmed_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','partial','failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Link instructions to batches
ALTER TABLE settlement_instructions ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES settlement_batches(id);
CREATE INDEX IF NOT EXISTS idx_settlement_batch ON settlement_instructions(batch_id);
