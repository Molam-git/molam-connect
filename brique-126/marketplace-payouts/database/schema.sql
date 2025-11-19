-- ============================================================================
-- Sous-Brique 126-1 — Marketplace Bulk Payouts & Revenue-Sharing
-- ============================================================================

-- Split rules configuration per marketplace
CREATE TABLE IF NOT EXISTS marketplace_split_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL,
  rule_name TEXT NOT NULL,
  rule_json JSONB NOT NULL,
  -- Example: {"type":"percent","parts":[{"to":"seller","pct":90},{"to":"marketplace","pct":10}]}
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Payout batches for marketplace
CREATE TABLE IF NOT EXISTS marketplace_payout_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL,
  initiated_by UUID NOT NULL,
  batch_reference TEXT UNIQUE NOT NULL,
  currency TEXT NOT NULL,
  total_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','queued','processing','completed','failed')),
  schedule_type TEXT CHECK (schedule_type IN ('immediate','daily','weekly')),
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Payout lines per seller
CREATE TABLE IF NOT EXISTS marketplace_payout_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES marketplace_payout_batches(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL,
  gross_amount NUMERIC(18,2) NOT NULL,
  seller_amount NUMERIC(18,2) NOT NULL,
  marketplace_fee NUMERIC(18,2) NOT NULL,
  molam_fee NUMERIC(18,2) NOT NULL,
  net_amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','settled','skipped','failed')),
  settlement_instruction_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seller balances available for payout
CREATE TABLE IF NOT EXISTS marketplace_seller_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL,
  seller_id UUID NOT NULL,
  currency TEXT NOT NULL,
  available_to_payout NUMERIC(18,2) NOT NULL DEFAULT 0,
  held_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  last_payout_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(marketplace_id, seller_id, currency)
);

-- Audit snapshots
CREATE TABLE IF NOT EXISTS marketplace_payout_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seller KYC/verification status (simplified)
CREATE TABLE IF NOT EXISTS sellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL,
  email TEXT NOT NULL,
  kyc_level TEXT NOT NULL DEFAULT 'unverified' CHECK (kyc_level IN ('unverified','pending','verified')),
  min_payout_threshold NUMERIC(18,2) DEFAULT 10.00,
  currency TEXT DEFAULT 'USD',
  treasury_account_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_marketplace_batch_status ON marketplace_payout_batches(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_batch_marketplace ON marketplace_payout_batches(marketplace_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_lines_batch ON marketplace_payout_lines(batch_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_lines_seller ON marketplace_payout_lines(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_balances ON marketplace_seller_balances(marketplace_id, seller_id, currency);
