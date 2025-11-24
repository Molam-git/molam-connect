-- database/migrations/006_create_molam_qr_codes.sql
CREATE TABLE molam_qr_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES molam_users(id),
    transaction_id UUID REFERENCES molam_wallet_transactions(id),
    qr_value TEXT NOT NULL,
    amount NUMERIC(18,2),
    currency TEXT NOT NULL DEFAULT 'XOF',
    expires_at TIMESTAMP NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    used_at TIMESTAMP
);

CREATE INDEX idx_qr_user ON molam_qr_codes(user_id);
CREATE INDEX idx_qr_status ON molam_qr_codes(status);
CREATE INDEX idx_qr_expiry ON molam_qr_codes(expires_at);