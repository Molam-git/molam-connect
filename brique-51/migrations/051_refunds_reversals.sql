/**
 * Brique 51 - Refunds & Reversals Engine
 * Database Schema
 */

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) Refunds & reversals core table
CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL, -- reference to payment/charge
  origin_module TEXT NOT NULL, -- 'connect','wallet','shop','ma'
  initiator TEXT NOT NULL, -- 'merchant','customer','ops','system'
  initiator_id UUID, -- user/merchant id
  type TEXT NOT NULL, -- 'reversal'|'refund'
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created', -- created|processing|succeeded|failed|requires_approval|cancelled
  reason TEXT,
  refund_method TEXT, -- 'to_card','to_wallet','to_bank','to_agent'
  idempotency_key TEXT,
  sira_score NUMERIC(5,4),
  fees JSONB DEFAULT '{}', -- {molam_fee:, merchant_fee:, bank_fee:, refund_fee:}
  ledger_ref JSONB, -- reference to ledger entries
  external_ref TEXT, -- provider reference
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CHECK (type IN ('reversal', 'refund')),
  CHECK (initiator IN ('merchant', 'customer', 'ops', 'system')),
  CHECK (status IN ('created', 'processing', 'succeeded', 'failed', 'requires_approval', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_idem ON refunds(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);
CREATE INDEX IF NOT EXISTS idx_refunds_initiator ON refunds(initiator, initiator_id);
CREATE INDEX IF NOT EXISTS idx_refunds_created ON refunds(created_at);

-- 2) Refund approvals (multi-signature workflow)
CREATE TABLE IF NOT EXISTS refund_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id UUID NOT NULL REFERENCES refunds(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL, -- Molam ID user
  approver_role TEXT NOT NULL,
  decision TEXT NOT NULL, -- 'approved'|'rejected'
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),

  CHECK (decision IN ('approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_refund_approvals_refund ON refund_approvals(refund_id);
CREATE INDEX IF NOT EXISTS idx_refund_approvals_approver ON refund_approvals(approver_id);

-- 3) Refund events history (immutable audit trail)
CREATE TABLE IF NOT EXISTS refund_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id UUID NOT NULL REFERENCES refunds(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'created','processing','sent','settled','failed','reversed','reconciled','approved','rejected'
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refund_events_refund ON refund_events(refund_id);
CREATE INDEX IF NOT EXISTS idx_refund_events_type ON refund_events(event_type);
CREATE INDEX IF NOT EXISTS idx_refund_events_created ON refund_events(created_at);

-- 4) Refund disputes (customer-initiated dispute resolution)
CREATE TABLE IF NOT EXISTS refund_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id UUID REFERENCES refunds(id),
  payment_id UUID,
  customer_id UUID,
  dispute_reason TEXT,
  status TEXT DEFAULT 'open', -- 'open','under_review','won','lost','closed'
  evidence JSONB,
  resolution TEXT,
  resolved_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,

  CHECK (status IN ('open', 'under_review', 'won', 'lost', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_refund_disputes_refund ON refund_disputes(refund_id);
CREATE INDEX IF NOT EXISTS idx_refund_disputes_payment ON refund_disputes(payment_id);
CREATE INDEX IF NOT EXISTS idx_refund_disputes_customer ON refund_disputes(customer_id);
CREATE INDEX IF NOT EXISTS idx_refund_disputes_status ON refund_disputes(status);

-- 5) Refund policies (merchant-specific rules)
CREATE TABLE IF NOT EXISTS refund_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  max_refund_age_days INT DEFAULT 180, -- refunds allowed within N days
  auto_approve_threshold NUMERIC(18,2), -- auto-approve refunds below this amount
  requires_approval_threshold NUMERIC(18,2), -- manual approval required above this
  refund_fee_policy TEXT DEFAULT 'merchant_pays', -- 'merchant_pays','customer_pays','shared'
  reversal_window_minutes INT DEFAULT 30, -- reversal allowed within N minutes
  sira_manual_threshold NUMERIC(5,4) DEFAULT 0.7, -- SIRA score above this requires manual review
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(merchant_id)
);

CREATE INDEX IF NOT EXISTS idx_refund_policies_merchant ON refund_policies(merchant_id);

-- Seed default policy
INSERT INTO refund_policies (merchant_id, max_refund_age_days, auto_approve_threshold, requires_approval_threshold) VALUES
  ('00000000-0000-0000-0000-000000000000', 180, 1000.00, 10000.00)
ON CONFLICT (merchant_id) DO NOTHING;

-- Comments
COMMENT ON TABLE refunds IS 'Core refunds and reversals tracking';
COMMENT ON TABLE refund_approvals IS 'Multi-signature approval workflow for high-value refunds';
COMMENT ON TABLE refund_events IS 'Immutable audit trail of refund lifecycle events';
COMMENT ON TABLE refund_disputes IS 'Customer-initiated dispute resolution linked to refunds';
COMMENT ON TABLE refund_policies IS 'Merchant-specific refund policies and thresholds';
