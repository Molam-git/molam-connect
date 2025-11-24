// database/migrations/002_create_molam_topup_products.sql
CREATE TABLE molam_topup_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES molam_telecom_operators(id),
  product_code TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  validity_days INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_products_operator ON molam_topup_products(operator_id);
CREATE INDEX idx_products_active ON molam_topup_products(is_active);