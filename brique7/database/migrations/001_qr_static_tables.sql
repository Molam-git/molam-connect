-- Création des tables pour la brique QR Statique

-- Merchant profile (simplified; full KYC/AML elsewhere in Phase 2)
CREATE TABLE molam_merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES molam_users(id),
  legal_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  country_code CHAR(2) NOT NULL,
  currency TEXT NOT NULL,
  kyc_level TEXT NOT NULL DEFAULT 'P1', -- escalates to P2/P3
  status TEXT NOT NULL DEFAULT 'active', -- active, suspended
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Physical/virtual acceptance point for a merchant
CREATE TABLE molam_terminals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES molam_merchants(id),
  label TEXT NOT NULL, -- e.g., "Front Desk", "Kiosk #2"
  location_lat NUMERIC, 
  location_lon NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Agent partner profile (physical agent); simplified here
CREATE TABLE molam_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES molam_users(id), -- the agent owner
  country_code CHAR(2) NOT NULL,
  kyc_level TEXT NOT NULL DEFAULT 'P2',
  status TEXT NOT NULL DEFAULT 'active', -- active, suspended
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Static QR assigned to a merchant terminal OR an agent
-- one of (merchant_id+terminal_id) OR agent_id is set
CREATE TABLE molam_qr_static (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES molam_merchants(id),
  terminal_id UUID REFERENCES molam_terminals(id),
  agent_id UUID REFERENCES molam_agents(id),
  qr_payload TEXT NOT NULL,         -- base64(payload) + HMAC signature
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, terminal_id),
  UNIQUE (agent_id)
);

-- Optional preset amounts associated with a static QR (menus, common prices)
CREATE TABLE molam_qr_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_id UUID NOT NULL REFERENCES molam_qr_static(id) ON DELETE CASCADE,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  label TEXT, -- "Lunch Menu", "Recharge 2000"
  position INTEGER NOT NULL DEFAULT 0
);

-- Payment intents generated from scanning a static QR (amount entered by payer)
CREATE TABLE molam_qr_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_id UUID NOT NULL REFERENCES molam_qr_static(id),
  payer_user_id UUID NOT NULL REFERENCES molam_users(id),
  payee_type TEXT NOT NULL, -- merchant|agent
  payee_id UUID NOT NULL,   -- merchant_id or agent_id
  terminal_id UUID,         -- for merchant flows
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, confirmed, cancelled, expired, failed
  fee_total NUMERIC(18,2) DEFAULT 0,
  fee_breakdown JSONB,      -- {"molam":x,"partner":y,"agent_share":z}
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMP,
  cancelled_at TIMESTAMP
);

-- Indexes
CREATE INDEX idx_qr_static_active ON molam_qr_static(is_active);
CREATE INDEX idx_qr_payments_status ON molam_qr_payments(status);
CREATE INDEX idx_qr_payments_payee ON molam_qr_payments(payee_type, payee_id);