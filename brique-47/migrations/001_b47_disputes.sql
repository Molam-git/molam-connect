-- ============================================================================
-- Brique 47 - Disputes & Chargebacks
-- Migration 001: Disputes, Evidence, Investigations, Chargebacks
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1) Core disputes table
-- ============================================================================
CREATE TABLE IF NOT EXISTS disputes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_dispute_id   TEXT,                        -- ID from network/acquirer (nullable for internal)
  payment_id            UUID,                        -- Reference to charges/transactions table
  merchant_id           UUID NOT NULL,
  merchant_account_id   UUID,                        -- Connect account ID
  amount                NUMERIC(18,2) NOT NULL,      -- Amount disputed in payment currency
  currency              TEXT NOT NULL,
  reason_code           TEXT,                        -- Network code (FRAUD, PRODUCT_NOT_AS_DESCRIBED, etc.)
  status                TEXT NOT NULL DEFAULT 'received',  -- received|evidence_requested|under_review|decided|closed
  outcome               TEXT,                        -- merchant_won|cardholder_won|partial|null
  outcome_amount        NUMERIC(18,2),               -- Amount to credit/debit
  dispute_fee           NUMERIC(10,2) DEFAULT 0,
  sira_score            NUMERIC(5,2),                -- AI fraud score (0-100)
  evidence_deadline     TIMESTAMPTZ,                 -- Deadline for evidence submission
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dispute_status_check CHECK (status IN ('received', 'evidence_requested', 'under_review', 'decided', 'closed')),
  CONSTRAINT dispute_outcome_check CHECK (outcome IS NULL OR outcome IN ('merchant_won', 'cardholder_won', 'partial'))
);

-- Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_disputes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER disputes_updated_at_trigger
BEFORE UPDATE ON disputes
FOR EACH ROW
EXECUTE FUNCTION update_disputes_updated_at();

-- ============================================================================
-- 2) Evidence documents (immutable WORM storage references)
-- ============================================================================
CREATE TABLE IF NOT EXISTS dispute_evidence (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id            UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  uploaded_by           TEXT NOT NULL,               -- 'merchant'|'ops'|'system'
  uploader_id           UUID,                        -- User ID or ops ID
  doc_type              TEXT NOT NULL,               -- receipt|delivery_proof|communication_log|photo|video|other
  s3_key                TEXT NOT NULL,               -- WORM or S3 versioned key
  file_name             TEXT,
  file_size             BIGINT,
  content_type          TEXT,
  hash                  TEXT NOT NULL,               -- SHA256 to assert immutability
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT evidence_uploaded_by_check CHECK (uploaded_by IN ('merchant', 'ops', 'system'))
);

-- ============================================================================
-- 3) Investigation logs (audit trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS dispute_investigations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id            UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  actor                 TEXT NOT NULL,               -- 'ops'|'sira'|'system'|'merchant'
  actor_id              UUID,
  action                TEXT NOT NULL,               -- 'assign'|'note'|'escalate'|'evidence_requested'|'decision'|'evidence_uploaded'
  details               JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT investigation_actor_check CHECK (actor IN ('ops', 'sira', 'system', 'merchant'))
);

-- ============================================================================
-- 4) Chargebacks ledger (for bank/treasury reconciliation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS chargebacks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id            UUID UNIQUE REFERENCES disputes(id),  -- Linked dispute
  payment_id            UUID,
  posted_at             TIMESTAMPTZ NOT NULL,
  amount                NUMERIC(18,2) NOT NULL,
  currency              TEXT NOT NULL,
  bank_reference        TEXT,
  status                TEXT NOT NULL DEFAULT 'posted',  -- posted|reversed|recovered
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chargeback_status_check CHECK (status IN ('posted', 'reversed', 'recovered'))
);

-- ============================================================================
-- 5) Ops assignments (who is working on what)
-- ============================================================================
CREATE TABLE IF NOT EXISTS dispute_assignments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id            UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  assigned_to           UUID NOT NULL,               -- Ops user ID
  assigned_by           UUID,                        -- Who assigned (system or manager)
  priority              TEXT NOT NULL DEFAULT 'normal',  -- low|normal|high|critical
  status                TEXT NOT NULL DEFAULT 'open',    -- open|in_progress|resolved
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at           TIMESTAMPTZ,
  CONSTRAINT assignment_priority_check CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  CONSTRAINT assignment_status_check CHECK (status IN ('open', 'in_progress', 'resolved'))
);

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_merchant ON disputes(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disputes_external_id ON disputes(external_dispute_id);
CREATE INDEX IF NOT EXISTS idx_disputes_payment ON disputes(payment_id);
CREATE INDEX IF NOT EXISTS idx_evidence_dispute ON dispute_evidence(dispute_id);
CREATE INDEX IF NOT EXISTS idx_investigations_dispute ON dispute_investigations(dispute_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chargebacks_dispute ON chargebacks(dispute_id);
CREATE INDEX IF NOT EXISTS idx_assignments_assigned_to ON dispute_assignments(assigned_to, status);

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE disputes IS 'Core disputes from card networks, banks, or internal sources';
COMMENT ON TABLE dispute_evidence IS 'Immutable evidence documents (WORM storage) with SHA256 hashes';
COMMENT ON TABLE dispute_investigations IS 'Audit trail of all actions on disputes';
COMMENT ON TABLE chargebacks IS 'Posted chargebacks for treasury reconciliation and ledger entries';
COMMENT ON TABLE dispute_assignments IS 'Ops team assignments and priority tracking';
