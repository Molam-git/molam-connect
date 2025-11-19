-- ============================================================================
-- Brique 126 — Payouts & Settlement Engine
-- ============================================================================

CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('instant', 'batch', 'priority')),
  destination_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','settled','failed')),
  reference TEXT UNIQUE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  failure_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS settlement_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,
  bank_profile_id UUID NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  rail TEXT NOT NULL CHECK (rail IN ('SEPA','SWIFT','ACH','RTGS','local')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','confirmed','failed')),
  bank_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settlement_sla (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_profile_id UUID NOT NULL,
  rail TEXT NOT NULL,
  expected_delay INTERVAL NOT NULL,
  actual_delay INTERVAL,
  payout_id UUID,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payouts_merchant ON payouts(merchant_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);
CREATE INDEX IF NOT EXISTS idx_payouts_requested ON payouts(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlement_status ON settlement_instructions(status);
CREATE INDEX IF NOT EXISTS idx_settlement_payout ON settlement_instructions(payout_id);
