-- Add approval related fields to payouts
ALTER TABLE payouts 
ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'auto_approved',
ADD COLUMN IF NOT EXISTS approved_by JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS threshold_amount NUMERIC(18,8),
ADD COLUMN IF NOT EXISTS compliance_level TEXT;

-- Create approval events table
CREATE TABLE IF NOT EXISTS payout_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID REFERENCES payouts(id),
  approver_id TEXT NOT NULL,
  approver_role TEXT NOT NULL,
  decision TEXT NOT NULL, -- approved, rejected
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payout_approvals_payout_id ON payout_approvals(payout_id);