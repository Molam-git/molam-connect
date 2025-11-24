-- 005_transfers.sql

CREATE TYPE transfer_status AS ENUM ('created','pending','confirmed','succeeded','cancelled','failed');

CREATE TABLE IF NOT EXISTS molam_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES molam_users(id),
  sender_wallet_id UUID NOT NULL REFERENCES molam_wallets(id),
  receiver_id UUID NOT NULL REFERENCES molam_users(id),
  receiver_wallet_id UUID NOT NULL REFERENCES molam_wallets(id),
  currency TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  fee_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  status transfer_status NOT NULL DEFAULT 'created',
  reference TEXT UNIQUE NOT NULL,
  idempotency_key TEXT NOT NULL,
  initiated_via TEXT NOT NULL CHECK (initiated_via IN ('app','web','ussd','qr_dynamic','qr_static')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_transfers_idem_sender
  ON molam_transfers (sender_wallet_id, idempotency_key);

CREATE INDEX idx_transfers_status ON molam_transfers(status);
CREATE INDEX idx_transfers_sender ON molam_transfers(sender_id);
CREATE INDEX idx_transfers_receiver ON molam_transfers(receiver_id);
CREATE INDEX idx_transfers_created ON molam_transfers(created_at);

-- Events (history, audit, webhooks)
CREATE TABLE IF NOT EXISTS molam_transfer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES molam_transfers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transfer_events_transfer_id ON molam_transfer_events(transfer_id);
CREATE INDEX idx_transfer_events_created ON molam_transfer_events(created_at);

-- QR Codes for transfers
CREATE TABLE IF NOT EXISTS molam_transfer_qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES molam_users(id),
  wallet_id UUID NOT NULL REFERENCES molam_wallets(id),
  qr_type TEXT NOT NULL CHECK (qr_type IN ('dynamic', 'static')),
  amount NUMERIC(18,2),
  currency TEXT,
  reference TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_qr_codes_user ON molam_transfer_qr_codes(user_id);
CREATE INDEX idx_qr_codes_reference ON molam_transfer_qr_codes(reference);
CREATE INDEX idx_qr_codes_active ON molam_transfer_qr_codes(is_active);