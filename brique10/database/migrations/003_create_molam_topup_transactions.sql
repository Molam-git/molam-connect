// database/migrations/003_create_molam_topup_transactions.sql
CREATE TABLE molam_topup_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES molam_users(id),
  operator_id UUID NOT NULL REFERENCES molam_telecom_operators(id),
  product_id UUID REFERENCES molam_topup_products(id),
  phone_number TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  fx_rate NUMERIC(18,6),
  status TEXT NOT NULL DEFAULT 'pending',
  sira_score NUMERIC(5,2),
  fee_total NUMERIC(18,2) DEFAULT 0,
  fee_breakdown JSONB,
  provider_reference TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  confirmed_at TIMESTAMP,
  failed_at TIMESTAMP,
  refunded_at TIMESTAMP
);

CREATE INDEX idx_topup_status ON molam_topup_transactions(status);
CREATE INDEX idx_topup_user ON molam_topup_transactions(user_id);
CREATE INDEX idx_topup_phone ON molam_topup_transactions(phone_number);
CREATE INDEX idx_topup_created ON molam_topup_transactions(created_at);