-- Migration pour la brique 17 - Cash-In
BEGIN;

-- Ajouter le type de transaction CASHIN
ALTER TYPE tx_type ADD VALUE IF NOT EXISTS 'CASHIN';

-- Table pour les OTP utilisateurs
CREATE TABLE IF NOT EXISTS user_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES molam_users(id),
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index pour les recherches OTP
CREATE INDEX IF NOT EXISTS idx_user_otps_user_id ON user_otps(user_id);
CREATE INDEX IF NOT EXISTS idx_user_otps_code ON user_otps(code);
CREATE INDEX IF NOT EXISTS idx_user_otps_expires ON user_otps(expires_at);

-- Table des logs d'audit cash-in
CREATE TABLE IF NOT EXISTS cashin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL,
    agent_id UUID NOT NULL,
    user_id UUID NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    status VARCHAR(20) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Métriques Prometheus pour le monitoring
CREATE TABLE IF NOT EXISTS cashin_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL,
    country VARCHAR(3) NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    success BOOLEAN NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

COMMIT;