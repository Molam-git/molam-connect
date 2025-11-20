/**
 * Brique 119: Bank Profiles & Treasury Accounts
 * Migration pour la gestion des banques partenaires et comptes de trésorerie
 */

-- Extension pour UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Table des banques partenaires
CREATE TABLE IF NOT EXISTS bank_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    bic_code VARCHAR(11) UNIQUE NOT NULL,
    country_code CHAR(2) NOT NULL,
    api_endpoint TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    status VARCHAR(20) CHECK (status IN ('active', 'inactive', 'suspended', 'pending')) DEFAULT 'pending',

    -- SLAs
    sla_settlement_days INT NOT NULL DEFAULT 3,
    sla_availability NUMERIC(5,2) DEFAULT 99.99,
    sla_max_failure_rate NUMERIC(5,2) DEFAULT 1.00,

    -- Certification & Compliance
    certification_status VARCHAR(20) CHECK (certification_status IN ('certified', 'pending', 'expired', 'revoked')) DEFAULT 'pending',
    certification_expiry DATE,
    pci_dss_compliant BOOLEAN DEFAULT false,

    -- Integration
    api_version VARCHAR(10),
    supports_webhooks BOOLEAN DEFAULT false,
    webhook_url TEXT,

    -- Metadata
    onboarding_date DATE,
    last_health_check TIMESTAMP,
    health_status VARCHAR(20) CHECK (health_status IN ('healthy', 'degraded', 'down')) DEFAULT 'healthy',

    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    created_by UUID,
    updated_by UUID
);

-- Table des comptes de trésorerie liés aux banques
CREATE TABLE IF NOT EXISTS treasury_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_id UUID REFERENCES bank_profiles(id) ON DELETE CASCADE,

    -- Account Details
    account_number TEXT NOT NULL,
    account_name TEXT,
    currency VARCHAR(3) NOT NULL,
    account_type VARCHAR(20) CHECK (account_type IN ('reserve', 'operational', 'payout', 'collection', 'settlement')) NOT NULL,

    -- Balance & Limits
    balance NUMERIC(20,6) DEFAULT 0,
    reserved_balance NUMERIC(20,6) DEFAULT 0, -- Montant réservé pour settlements
    available_balance NUMERIC(20,6) GENERATED ALWAYS AS (balance - reserved_balance) STORED,
    min_balance NUMERIC(20,6) DEFAULT 0, -- Solde minimum requis
    max_balance NUMERIC(20,6), -- Limite maximale (optionnel)

    -- Reconciliation
    last_reconciled TIMESTAMP,
    reconciliation_status VARCHAR(20) CHECK (reconciliation_status IN ('reconciled', 'pending', 'mismatch', 'error')) DEFAULT 'pending',
    reconciliation_frequency VARCHAR(20) DEFAULT 'daily', -- daily, weekly, monthly

    -- Flags
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    auto_sweep_enabled BOOLEAN DEFAULT false, -- Auto-transfer vers compte principal
    sweep_threshold NUMERIC(20,6), -- Seuil pour auto-sweep

    -- Metadata
    last_transaction_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    created_by UUID,
    updated_by UUID,

    UNIQUE(bank_id, account_number, currency)
);

-- Table des SLA tracking (historique performance)
CREATE TABLE IF NOT EXISTS bank_sla_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_id UUID REFERENCES bank_profiles(id) ON DELETE CASCADE,

    -- Période de mesure
    measurement_period VARCHAR(20) NOT NULL, -- daily, weekly, monthly
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,

    -- Métriques
    total_transactions INT DEFAULT 0,
    successful_transactions INT DEFAULT 0,
    failed_transactions INT DEFAULT 0,
    failure_rate NUMERIC(5,2) GENERATED ALWAYS AS (
        CASE
            WHEN total_transactions > 0 THEN (failed_transactions::NUMERIC / total_transactions::NUMERIC) * 100
            ELSE 0
        END
    ) STORED,

    -- Settlement metrics
    avg_settlement_time_hours NUMERIC(10,2),
    max_settlement_time_hours NUMERIC(10,2),
    on_time_settlements INT DEFAULT 0,
    late_settlements INT DEFAULT 0,

    -- Availability metrics
    uptime_seconds INT DEFAULT 0,
    downtime_seconds INT DEFAULT 0,
    availability_percent NUMERIC(5,2) GENERATED ALWAYS AS (
        CASE
            WHEN (uptime_seconds + downtime_seconds) > 0
            THEN (uptime_seconds::NUMERIC / (uptime_seconds + downtime_seconds)::NUMERIC) * 100
            ELSE 0
        END
    ) STORED,

    -- SLA Compliance
    sla_met BOOLEAN DEFAULT true,
    sla_violations TEXT[], -- Liste des violations

    created_at TIMESTAMP DEFAULT now(),

    UNIQUE(bank_id, measurement_period, period_start)
);

-- Table des certifications bancaires
CREATE TABLE IF NOT EXISTS bank_certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_id UUID REFERENCES bank_profiles(id) ON DELETE CASCADE,

    certification_type VARCHAR(50) NOT NULL, -- PCI-DSS, ISO27001, SOC2, etc.
    certification_number TEXT,
    issuing_authority TEXT,
    issue_date DATE NOT NULL,
    expiry_date DATE NOT NULL,

    status VARCHAR(20) CHECK (status IN ('valid', 'expired', 'suspended', 'revoked')) DEFAULT 'valid',

    -- Documents
    certificate_url TEXT,
    verification_url TEXT,

    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),

    UNIQUE(bank_id, certification_type, certification_number)
);

-- Table des événements bancaires (audit trail)
CREATE TABLE IF NOT EXISTS bank_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_id UUID REFERENCES bank_profiles(id) ON DELETE CASCADE,

    event_type VARCHAR(50) NOT NULL, -- onboarded, suspended, status_changed, sla_violation, etc.
    event_category VARCHAR(20) CHECK (event_category IN ('operational', 'compliance', 'financial', 'technical')) NOT NULL,
    severity VARCHAR(20) CHECK (severity IN ('info', 'warning', 'error', 'critical')) DEFAULT 'info',

    description TEXT,
    metadata JSONB,

    triggered_by UUID, -- User ID qui a déclenché l'événement

    created_at TIMESTAMP DEFAULT now()
);

-- Indexes pour performance
CREATE INDEX IF NOT EXISTS idx_bank_country ON bank_profiles(country_code);
CREATE INDEX IF NOT EXISTS idx_bank_status ON bank_profiles(status);
CREATE INDEX IF NOT EXISTS idx_bank_health ON bank_profiles(health_status);
CREATE INDEX IF NOT EXISTS idx_bank_bic ON bank_profiles(bic_code);

CREATE INDEX IF NOT EXISTS idx_treasury_bank ON treasury_accounts(bank_id);
CREATE INDEX IF NOT EXISTS idx_treasury_currency ON treasury_accounts(currency);
CREATE INDEX IF NOT EXISTS idx_treasury_type ON treasury_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_treasury_active ON treasury_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_treasury_default ON treasury_accounts(is_default) WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_sla_bank ON bank_sla_tracking(bank_id);
CREATE INDEX IF NOT EXISTS idx_sla_period ON bank_sla_tracking(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_sla_violations ON bank_sla_tracking(sla_met) WHERE sla_met = false;

CREATE INDEX IF NOT EXISTS idx_cert_bank ON bank_certifications(bank_id);
CREATE INDEX IF NOT EXISTS idx_cert_status ON bank_certifications(status);
CREATE INDEX IF NOT EXISTS idx_cert_expiry ON bank_certifications(expiry_date);

CREATE INDEX IF NOT EXISTS idx_events_bank ON bank_events(bank_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON bank_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON bank_events(created_at DESC);

-- Vue pour les banques actives avec leurs comptes
CREATE OR REPLACE VIEW active_banks_with_accounts AS
SELECT
    bp.id,
    bp.name,
    bp.bic_code,
    bp.country_code,
    bp.status,
    bp.sla_settlement_days,
    bp.sla_availability,
    bp.health_status,
    COUNT(ta.id) as total_accounts,
    COUNT(ta.id) FILTER (WHERE ta.is_active = true) as active_accounts,
    COALESCE(SUM(ta.balance), 0) as total_balance,
    COALESCE(SUM(ta.available_balance), 0) as total_available_balance
FROM bank_profiles bp
LEFT JOIN treasury_accounts ta ON bp.id = ta.bank_id
WHERE bp.status = 'active'
GROUP BY bp.id;

-- Vue pour les SLA violations récentes
CREATE OR REPLACE VIEW recent_sla_violations AS
SELECT
    bp.name as bank_name,
    bp.bic_code,
    sla.measurement_period,
    sla.period_start,
    sla.period_end,
    sla.failure_rate,
    sla.availability_percent,
    sla.late_settlements,
    sla.sla_violations
FROM bank_sla_tracking sla
JOIN bank_profiles bp ON sla.bank_id = bp.id
WHERE sla.sla_met = false
ORDER BY sla.period_start DESC
LIMIT 100;

-- Fonction pour calculer le solde disponible
CREATE OR REPLACE FUNCTION update_treasury_balance()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour mettre à jour updated_at
CREATE TRIGGER update_bank_profiles_timestamp
    BEFORE UPDATE ON bank_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_treasury_balance();

CREATE TRIGGER update_treasury_accounts_timestamp
    BEFORE UPDATE ON treasury_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_treasury_balance();

-- Fonction pour logger les événements bancaires
CREATE OR REPLACE FUNCTION log_bank_event(
    p_bank_id UUID,
    p_event_type VARCHAR(50),
    p_event_category VARCHAR(20),
    p_severity VARCHAR(20),
    p_description TEXT,
    p_metadata JSONB DEFAULT NULL,
    p_triggered_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    event_id UUID;
BEGIN
    INSERT INTO bank_events (
        bank_id,
        event_type,
        event_category,
        severity,
        description,
        metadata,
        triggered_by
    ) VALUES (
        p_bank_id,
        p_event_type,
        p_event_category,
        p_severity,
        p_description,
        p_metadata,
        p_triggered_by
    ) RETURNING id INTO event_id;

    RETURN event_id;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour vérifier les SLAs
CREATE OR REPLACE FUNCTION check_bank_sla_compliance(p_bank_id UUID)
RETURNS TABLE(
    compliance_status TEXT,
    failure_rate_ok BOOLEAN,
    availability_ok BOOLEAN,
    settlement_time_ok BOOLEAN
) AS $$
DECLARE
    v_bank_profile RECORD;
    v_latest_sla RECORD;
BEGIN
    -- Récupérer le profil bancaire
    SELECT * INTO v_bank_profile
    FROM bank_profiles
    WHERE id = p_bank_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bank not found: %', p_bank_id;
    END IF;

    -- Récupérer les dernières métriques SLA
    SELECT * INTO v_latest_sla
    FROM bank_sla_tracking
    WHERE bank_id = p_bank_id
    ORDER BY period_end DESC
    LIMIT 1;

    IF NOT FOUND THEN
        -- Pas de données SLA
        RETURN QUERY SELECT
            'no_data'::TEXT,
            true,
            true,
            true;
        RETURN;
    END IF;

    -- Vérifier la conformité
    RETURN QUERY SELECT
        CASE
            WHEN v_latest_sla.sla_met THEN 'compliant'::TEXT
            ELSE 'non_compliant'::TEXT
        END,
        v_latest_sla.failure_rate <= v_bank_profile.sla_max_failure_rate,
        v_latest_sla.availability_percent >= v_bank_profile.sla_availability,
        v_latest_sla.avg_settlement_time_hours <= (v_bank_profile.sla_settlement_days * 24);
END;
$$ LANGUAGE plpgsql;

-- Commentaires
COMMENT ON TABLE bank_profiles IS 'Profils des banques partenaires avec SLAs et certifications';
COMMENT ON TABLE treasury_accounts IS 'Comptes de trésorerie multi-banques pour gestion des fonds';
COMMENT ON TABLE bank_sla_tracking IS 'Historique des performances SLA par banque';
COMMENT ON TABLE bank_certifications IS 'Certifications et conformité des banques';
COMMENT ON TABLE bank_events IS 'Audit trail des événements bancaires';
