-- Brique 55 - Disputes & Chargebacks Engine
-- Migration: 055_disputes.sql
-- 5 tables for industrial-grade dispute management

-- 1) Dispute master table
CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_dispute_id TEXT UNIQUE, -- from network/bank (nullable)
  payment_id UUID NOT NULL, -- reference to payments table
  merchant_id UUID NOT NULL,
  customer_id UUID,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  reason_code TEXT NOT NULL, -- e.g., 'fraud', 'authorization', 'product_not_received'
  status TEXT NOT NULL DEFAULT 'open', -- open|responding|won|lost|cancelled|escalated|closed
  origin TEXT NOT NULL, -- 'network','bank_statement','customer_claim'
  response_due_at TIMESTAMPTZ, -- network deadline
  response_submitted_at TIMESTAMPTZ, -- when we submitted response
  sla_tier TEXT DEFAULT 'standard',
  sira_score NUMERIC(5,2), -- risk score suggested by SIRA
  sira_recommendation TEXT, -- 'auto_accept', 'auto_refute', 'escalate'
  assigned_to UUID, -- user id in internal Molam ID
  priority INTEGER DEFAULT 3, -- 1=critical, 2=high, 3=normal, 4=low
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2) Evidence (immutable references)
CREATE TABLE IF NOT EXISTS dispute_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID REFERENCES disputes(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL, -- who uploaded (merchant/ops)
  type TEXT NOT NULL, -- 'receipt','conversation','tracking','photo','video','signature','invoice','proof_of_delivery'
  s3_key TEXT NOT NULL, -- WORM location
  hash TEXT NOT NULL, -- sha256 hash of file for integrity
  size_bytes BIGINT NOT NULL,
  content_meta JSONB DEFAULT '{}', -- filename, mimetype, etc.
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- 3) Timeline events / audit trail
CREATE TABLE IF NOT EXISTS dispute_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID REFERENCES disputes(id) ON DELETE CASCADE,
  actor_id UUID, -- who performed the action
  actor_type TEXT, -- 'merchant', 'ops', 'system', 'network'
  action TEXT NOT NULL, -- 'created', 'evidence_uploaded', 'assigned', 'responded', 'resolved', etc.
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4) Network callbacks received (raw)
CREATE TABLE IF NOT EXISTS dispute_callbacks_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE, -- idempotency
  network TEXT NOT NULL, -- 'visa','mastercard','amex','x_network'
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ DEFAULT now(),
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  error_message TEXT
);

-- 5) Dispute resolutions meta (for audit + billing)
CREATE TABLE IF NOT EXISTS dispute_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID REFERENCES disputes(id) ON DELETE CASCADE,
  resolved_by UUID NOT NULL,
  resolved_at TIMESTAMPTZ DEFAULT now(),
  outcome TEXT NOT NULL, -- 'merchant_won','merchant_lost','voided','cancelled'
  network_fee NUMERIC(18,2) DEFAULT 0,
  adjustment_reference TEXT, -- invoice/credit_note id from B46
  ledger_entry_id TEXT, -- reference to B34/35 ledger entry
  details JSONB DEFAULT '{}'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_disputes_merchant_status ON disputes(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_disputes_due ON disputes(response_due_at) WHERE response_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_disputes_payment ON disputes(payment_id);
CREATE INDEX IF NOT EXISTS idx_disputes_external_id ON disputes(external_dispute_id) WHERE external_dispute_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_disputes_assigned ON disputes(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dispute_evidences_dispute ON dispute_evidences(dispute_id);
CREATE INDEX IF NOT EXISTS idx_dispute_timeline_dispute ON dispute_timeline(dispute_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispute_callbacks_processed ON dispute_callbacks_raw(processed) WHERE NOT processed;

-- Comments for documentation
COMMENT ON TABLE disputes IS 'Master table for all disputes and chargebacks';
COMMENT ON TABLE dispute_evidences IS 'Immutable evidence files stored in WORM S3';
COMMENT ON TABLE dispute_timeline IS 'Audit trail of all dispute actions';
COMMENT ON TABLE dispute_callbacks_raw IS 'Raw network webhook payloads for ingestion';
COMMENT ON TABLE dispute_resolutions IS 'Final resolution outcomes with billing/ledger references';
