-- 1) Payouts table (extends B34 payouts)
CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT, -- client-provided idempotency
  origin_module TEXT NOT NULL,
  origin_entity_id UUID, -- merchant/agent/user
  currency TEXT NOT NULL,
  amount NUMERIC(18,8) NOT NULL,
  molam_fee NUMERIC(18,8) DEFAULT 0,
  bank_fee NUMERIC(18,8) DEFAULT 0,
  total_deducted NUMERIC(18,8),
  beneficiary JSONB NOT NULL,
  bank_profile_id UUID,
  treasury_account_id UUID,
  provider_ref TEXT, -- provider transaction id
  status TEXT DEFAULT 'pending', -- pending, scheduled, processing, sent, settled, failed, reversed, cancelled
  priority INTEGER DEFAULT 100, -- lower => processed earlier
  scheduled_for TIMESTAMPTZ, -- null => immediate
  created_by TEXT, -- user/service creating
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  reference_code TEXT UNIQUE -- PAYOUT-YYYYMMDD-XXXX
);

CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);
CREATE INDEX IF NOT EXISTS idx_payouts_sched ON payouts(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_payouts_origin ON payouts(origin_module, origin_entity_id);
CREATE INDEX IF NOT EXISTS idx_payouts_external_id ON payouts(external_id);

-- 2) Payout audit / lifecycle (immutable)
CREATE TABLE IF NOT EXISTS payout_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID REFERENCES payouts(id),
  event_type TEXT NOT NULL, -- created, hold_created, routed, sent, settled, failed, retried, cancelled, reversed
  payload JSONB,
  actor TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payout_events_payout_id ON payout_events(payout_id);
CREATE INDEX IF NOT EXISTS idx_payout_events_created_at ON payout_events(created_at);

-- 3) Ledger holds (simple mapping)
CREATE TABLE IF NOT EXISTS ledger_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID REFERENCES payouts(id),
  ledger_entry_ref TEXT, -- link to central ledger model
  amount NUMERIC(18,8) NOT NULL,
  currency TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  released_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ledger_holds_payout_id ON ledger_holds(payout_id);

-- 4) Idempotency store
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT UNIQUE NOT NULL,
  response JSONB,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON idempotency_keys(created_at);