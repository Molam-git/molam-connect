-- ============================================================================
-- Brique 132 - Payouts & Settlement Engine Schema
-- ============================================================================

-- 1) Payouts table (core)
CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE,           -- idempotency key from caller
  origin_module TEXT NOT NULL,       -- 'connect','shop','agents','ops'
  origin_entity_id UUID,             -- merchant_id / agent_id / user_id
  origin_owner_type TEXT,            -- 'merchant'|'agent'|'user'
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scheduled_for TIMESTAMPTZ,         -- when to execute
  priority INTEGER DEFAULT 50,       -- 0 = highest priority
  treasury_account_id UUID,          -- REFERENCES treasury_accounts(id)
  bank_profile_id UUID,              -- REFERENCES bank_profiles(id)
  payee_bank_account JSONB NOT NULL, -- beneficiary details (IBAN, account_number, etc.)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reserved','processing','sent','settled','failed','cancelled','reversed')),
  attempt_count INTEGER DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  provider_ref TEXT,                 -- provider reference from bank connector
  molam_fee NUMERIC(18,2) DEFAULT 0,
  bank_fee NUMERIC(18,2) DEFAULT 0,
  total_deducted NUMERIC(18,2),      -- amount + fees
  reference_code TEXT UNIQUE,        -- human readable ref for reconciliation
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payouts_status_sched ON payouts(status, scheduled_for) WHERE status IN ('pending','reserved');
CREATE INDEX IF NOT EXISTS idx_payouts_origin ON payouts(origin_module, origin_entity_id);
CREATE INDEX IF NOT EXISTS idx_payouts_reference ON payouts(reference_code);
CREATE INDEX IF NOT EXISTS idx_payouts_provider_ref ON payouts(provider_ref) WHERE provider_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payouts_external_id ON payouts(external_id);

-- 2) Payout batches (for grouping multiple payouts)
CREATE TABLE IF NOT EXISTS payout_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_ref TEXT UNIQUE NOT NULL,
  treasury_account_id UUID,          -- REFERENCES treasury_accounts(id)
  scheduled_for TIMESTAMPTZ,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','locked','processing','completed','failed')),
  total_amount NUMERIC(18,2) DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  currency TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payout_batches_status ON payout_batches(status, scheduled_for);

-- 3) Batch items (many-to-many)
CREATE TABLE IF NOT EXISTS payout_batch_items (
  batch_id UUID REFERENCES payout_batches(id) ON DELETE CASCADE,
  payout_id UUID REFERENCES payouts(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(batch_id, payout_id)
);

CREATE INDEX IF NOT EXISTS idx_batch_items_payout ON payout_batch_items(payout_id);

-- 4) Payout attempts log (immutable audit trail)
CREATE TABLE IF NOT EXISTS payout_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID REFERENCES payouts(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  attempt_ts TIMESTAMPTZ DEFAULT now(),
  provider_ref TEXT,
  status TEXT NOT NULL,              -- 'sent','retry','failed'
  response_code INTEGER,
  response_body JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payout_attempts_payout ON payout_attempts(payout_id, attempt_ts DESC);

-- 5) Payout holds (links to ledger)
CREATE TABLE IF NOT EXISTS payout_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID REFERENCES payouts(id) ON DELETE CASCADE,
  ledger_hold_ref TEXT NOT NULL,    -- reference to ledger hold entry
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','released','expired')),
  created_at TIMESTAMPTZ DEFAULT now(),
  released_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payout_holds_payout ON payout_holds(payout_id);
CREATE INDEX IF NOT EXISTS idx_payout_holds_ledger_ref ON payout_holds(ledger_hold_ref);

-- 6) Reconciliation matches (link payouts to bank statement lines)
CREATE TABLE IF NOT EXISTS payout_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID REFERENCES payouts(id),
  statement_line_id UUID,            -- REFERENCES bank_statement_lines(id)
  matched_by TEXT,                   -- 'auto'|'manual'|'sira'
  matched_at TIMESTAMPTZ DEFAULT now(),
  confidence_score NUMERIC(3,2),     -- 0-1 for auto-matching
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_payout_recon_payout ON payout_reconciliation(payout_id);
CREATE INDEX IF NOT EXISTS idx_payout_recon_statement ON payout_reconciliation(statement_line_id);
