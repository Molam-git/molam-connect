-- Brique 58: Disputes & Chargebacks Engine
-- Industrial-grade dispute management system

-- 1) Main disputes table
CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_ref TEXT UNIQUE NOT NULL,               -- external ref from network e.g. CB-XXXX
  origin TEXT NOT NULL,                           -- 'network'|'bank'|'merchant'|'internal'
  origin_details JSONB DEFAULT '{}',              -- raw payload from source
  payment_id UUID,                                -- optional link to payments table
  merchant_id UUID NOT NULL,                      -- related merchant
  customer_id UUID,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  country TEXT,
  status TEXT NOT NULL DEFAULT 'reported',        -- reported|evidence_requested|submitted|network_review|won|lost|settled|closed
  reason_code TEXT,                               -- network reason code (e.g. 'fraud','product_not_received')
  reason_description TEXT,
  network TEXT,                                   -- visa|mastercard|amex
  network_deadline TIMESTAMPTZ,                   -- when evidence must be submitted
  submitted_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  outcome TEXT,                                   -- won|lost|settled|withdrawn
  network_response JSONB,                         -- response from network after submission
  sira_score JSONB,                               -- SIRA fraud analysis
  hold_amount NUMERIC(18,2),                      -- amount held from merchant
  fees_charged NUMERIC(18,2) DEFAULT 0,           -- network + Molam fees
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disputes_merchant_status ON disputes(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_disputes_payment ON disputes(payment_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status) WHERE status IN ('reported', 'evidence_requested', 'submitted', 'network_review');
CREATE INDEX IF NOT EXISTS idx_disputes_deadline ON disputes(network_deadline) WHERE network_deadline IS NOT NULL AND status IN ('evidence_requested', 'submitted');
CREATE INDEX IF NOT EXISTS idx_disputes_created ON disputes(created_at DESC);

-- 2) Dispute evidence attachments & metadata
CREATE TABLE IF NOT EXISTS dispute_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL,                      -- merchant or ops user id
  file_s3_key TEXT NOT NULL,                      -- S3 location of evidence (pdf, zip, images)
  file_name TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  file_hash TEXT,                                 -- SHA-256 for integrity
  evidence_type TEXT,                             -- 'invoice','shipping_proof','communication','receipt','refund_policy'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute ON dispute_evidence(dispute_id);

-- 3) Dispute events / timeline (immutable audit trail)
CREATE TABLE IF NOT EXISTS dispute_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  actor UUID,                                     -- who triggered (system, merchant, ops user id)
  actor_type TEXT,                                -- 'system'|'merchant'|'ops'|'network'
  action TEXT NOT NULL,                           -- 'ingested','evidence_uploaded','submitted','network_response','resolved','closed'
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispute_events_dispute ON dispute_events(dispute_id, created_at DESC);

-- 4) Dispute actions (ops queue for async processing)
CREATE TABLE IF NOT EXISTS dispute_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,                      -- 'submit_to_network','refund','issue_credit','escalate','close','request_evidence'
  payload JSONB DEFAULT '{}',
  status TEXT DEFAULT 'queued',                   -- queued|processing|done|failed
  assigned_to UUID,                               -- ops user
  priority INTEGER DEFAULT 0,                     -- higher = more urgent
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  last_error TEXT,
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispute_actions_status ON dispute_actions(status, scheduled_at) WHERE status IN ('queued', 'processing');
CREATE INDEX IF NOT EXISTS idx_dispute_actions_dispute ON dispute_actions(dispute_id);

-- 5) Dispute daily statistics (for analytics)
CREATE TABLE IF NOT EXISTS dispute_daily_stats (
  day DATE NOT NULL,
  merchant_id UUID,
  disputes_reported BIGINT DEFAULT 0,
  disputes_won BIGINT DEFAULT 0,
  disputes_lost BIGINT DEFAULT 0,
  disputes_settled BIGINT DEFAULT 0,
  chargeback_amount NUMERIC(18,2) DEFAULT 0,
  fees_charged NUMERIC(18,2) DEFAULT 0,
  win_rate NUMERIC(5,2) DEFAULT 0,
  PRIMARY KEY(day, merchant_id)
);

CREATE INDEX IF NOT EXISTS idx_dispute_daily_stats_merchant ON dispute_daily_stats(merchant_id, day DESC);

-- 6) Dispute reconciliation (for network settlement messages)
CREATE TABLE IF NOT EXISTS dispute_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID REFERENCES disputes(id) ON DELETE SET NULL,
  network_ref TEXT NOT NULL,                      -- settlement reference from network
  amount NUMERIC(18,2),
  currency TEXT,
  settlement_date DATE,
  status TEXT DEFAULT 'pending',                  -- pending|matched|unmatched|disputed
  raw_message JSONB,
  matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispute_reconciliations_network_ref ON dispute_reconciliations(network_ref);
CREATE INDEX IF NOT EXISTS idx_dispute_reconciliations_status ON dispute_reconciliations(status);

-- 7) Audit logs (shared table)
CREATE TABLE IF NOT EXISTS molam_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor_id UUID,
  changes JSONB,
  merchant_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON molam_audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_merchant ON molam_audit_logs(merchant_id, created_at DESC);

-- Trigger to update updated_at on disputes
CREATE OR REPLACE FUNCTION update_disputes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER disputes_updated_at_trigger
BEFORE UPDATE ON disputes
FOR EACH ROW
EXECUTE FUNCTION update_disputes_updated_at();

-- Trigger to update updated_at on dispute_actions
CREATE TRIGGER dispute_actions_updated_at_trigger
BEFORE UPDATE ON dispute_actions
FOR EACH ROW
EXECUTE FUNCTION update_disputes_updated_at();
