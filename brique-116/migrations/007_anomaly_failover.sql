-- =====================================================================
-- Brique 116septies: AI Anomaly-Based Failover (Sira)
-- =====================================================================
-- Détection d'anomalies et failover automatique des routes de paiement
-- =====================================================================

-- Table de santé des connecteurs (banques, PSP, rails)
CREATE TABLE IF NOT EXISTS connector_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_name TEXT NOT NULL,
    region TEXT,
    currency TEXT,
    last_ping TIMESTAMPTZ NOT NULL,
    success_rate NUMERIC(5,4),          -- 0.9876 = 98.76%
    avg_latency_ms NUMERIC(8,2),
    error_count INT DEFAULT 0,
    last_error TEXT,
    status TEXT NOT NULL DEFAULT 'ok',  -- ok | degraded | down
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour recherches rapides
CREATE INDEX idx_connector_health_name ON connector_health(connector_name);
CREATE INDEX idx_connector_health_region_currency ON connector_health(region, currency);
CREATE INDEX idx_connector_health_status ON connector_health(status);

-- Table des événements d'anomalie détectés par Sira
CREATE TABLE IF NOT EXISTS anomaly_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_name TEXT NOT NULL,
    region TEXT,
    currency TEXT,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    anomaly_type TEXT,                  -- spike_latency, failure_rate, timeout_spike
    metric JSONB,                       -- snapshot des métriques
    anomaly_score NUMERIC(5,4),         -- 0-1, plus élevé = plus anormal
    sira_decision JSONB,                -- recommendation de Sira
    processed BOOLEAN DEFAULT FALSE,
    auto_failover_triggered BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour traitement
CREATE INDEX idx_anomaly_events_processed ON anomaly_events(processed, detected_at);
CREATE INDEX idx_anomaly_events_connector ON anomaly_events(connector_name);

-- Table des actions de failover
CREATE TABLE IF NOT EXISTS failover_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_ref TEXT UNIQUE NOT NULL,    -- clé d'idempotence
    connector_from TEXT NOT NULL,
    connector_to TEXT NOT NULL,
    region TEXT,
    currency TEXT,
    requested_by TEXT,                  -- 'sira_auto' ou user_id
    requested_at TIMESTAMPTZ DEFAULT now(),
    executed_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending',      -- pending|executing|executed|failed|rolled_back
    rationale JSONB,
    sira_score NUMERIC(5,4),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'executing', 'executed', 'failed', 'rolled_back', 'cancelled'))
);

-- Index pour exécution
CREATE INDEX idx_failover_actions_status ON failover_actions(status, requested_at);
CREATE INDEX idx_failover_actions_ref ON failover_actions(action_ref);
CREATE INDEX idx_failover_actions_connector ON failover_actions(connector_from, connector_to);

-- Table d'historique des failovers
CREATE TABLE IF NOT EXISTS failover_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_id UUID REFERENCES failover_actions(id) ON DELETE CASCADE,
    step TEXT NOT NULL,                 -- start, executing, executed, failed, rolled_back
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour historique
CREATE INDEX idx_failover_history_action ON failover_history(action_id, created_at);

-- Table des politiques Ops
CREATE TABLE IF NOT EXISTS ops_failover_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    config JSONB NOT NULL,              -- auto_threshold, cooldown_minutes, etc.
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Politique par défaut
INSERT INTO ops_failover_policies (name, config) VALUES
    ('auto_failover', '{"auto_threshold": 0.8, "cooldown_minutes": 15, "max_failovers_per_hour": 5}'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Vue des anomalies récentes non traitées
CREATE OR REPLACE VIEW anomaly_events_pending AS
SELECT
    e.id,
    e.connector_name,
    e.region,
    e.currency,
    e.detected_at,
    e.anomaly_type,
    e.anomaly_score,
    e.sira_decision,
    h.status AS connector_status,
    h.success_rate AS current_success_rate,
    h.avg_latency_ms AS current_latency
FROM anomaly_events e
LEFT JOIN LATERAL (
    SELECT status, success_rate, avg_latency_ms
    FROM connector_health
    WHERE connector_name = e.connector_name
      AND (region = e.region OR e.region IS NULL)
      AND (currency = e.currency OR e.currency IS NULL)
    ORDER BY updated_at DESC
    LIMIT 1
) h ON true
WHERE e.processed = FALSE
ORDER BY e.anomaly_score DESC, e.detected_at DESC;

-- Fonction pour détecter les anomalies (heuristique simple)
CREATE OR REPLACE FUNCTION detect_connector_anomalies()
RETURNS TABLE (
    connector_name TEXT,
    anomaly_type TEXT,
    anomaly_score NUMERIC,
    recommended_action TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        h.connector_name,
        CASE
            WHEN h.success_rate < 0.80 THEN 'critical_failure_rate'
            WHEN h.success_rate < 0.90 THEN 'high_failure_rate'
            WHEN h.avg_latency_ms > 2000 THEN 'critical_latency'
            WHEN h.avg_latency_ms > 1000 THEN 'high_latency'
            ELSE 'degraded'
        END AS anomaly_type,
        CASE
            WHEN h.success_rate < 0.80 THEN 0.95
            WHEN h.success_rate < 0.90 THEN 0.75
            WHEN h.avg_latency_ms > 2000 THEN 0.85
            WHEN h.avg_latency_ms > 1000 THEN 0.65
            ELSE 0.50
        END AS anomaly_score,
        'failover'::TEXT AS recommended_action
    FROM connector_health h
    WHERE h.status IN ('degraded', 'down')
       OR h.success_rate < 0.90
       OR h.avg_latency_ms > 1000
       AND h.updated_at > now() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

-- Fonction pour trouver un connecteur alternatif
CREATE OR REPLACE FUNCTION find_alternative_connector(
    p_connector_name TEXT,
    p_region TEXT,
    p_currency TEXT
) RETURNS TEXT AS $$
DECLARE
    alternative TEXT;
BEGIN
    SELECT connector_name INTO alternative
    FROM connector_health
    WHERE region = p_region
      AND currency = p_currency
      AND connector_name != p_connector_name
      AND status = 'ok'
      AND success_rate >= 0.95
    ORDER BY success_rate DESC, avg_latency_ms ASC
    LIMIT 1;

    RETURN alternative;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour vérifier si failover est autorisé (cooldown)
CREATE OR REPLACE FUNCTION can_failover(
    p_connector_name TEXT,
    p_cooldown_minutes INT DEFAULT 15
) RETURNS BOOLEAN AS $$
DECLARE
    last_failover TIMESTAMPTZ;
BEGIN
    SELECT MAX(requested_at) INTO last_failover
    FROM failover_actions
    WHERE connector_from = p_connector_name
      AND status IN ('executed', 'executing');

    IF last_failover IS NULL THEN
        RETURN TRUE;
    END IF;

    RETURN (now() - last_failover) > (p_cooldown_minutes || ' minutes')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER connector_health_updated
    BEFORE UPDATE ON connector_health
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER failover_actions_updated
    BEFORE UPDATE ON failover_actions
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- Commentaires
COMMENT ON TABLE connector_health IS 'État de santé des connecteurs de paiement en temps réel';
COMMENT ON TABLE anomaly_events IS 'Événements d''anomalie détectés par Sira';
COMMENT ON TABLE failover_actions IS 'Actions de failover automatique ou manuelle';
COMMENT ON TABLE failover_history IS 'Historique détaillé des étapes de failover';
COMMENT ON TABLE ops_failover_policies IS 'Politiques de failover configurables par Ops';

-- Données de test
INSERT INTO connector_health (connector_name, region, currency, last_ping, success_rate, avg_latency_ms, status)
VALUES
    ('bank_bci', 'SN', 'XOF', now(), 0.9850, 450, 'ok'),
    ('bank_coris', 'SN', 'XOF', now(), 0.9720, 520, 'ok'),
    ('mobile_money', 'SN', 'XOF', now(), 0.9920, 380, 'ok'),
    ('stripe_eu', 'EU', 'EUR', now(), 0.9890, 320, 'ok'),
    ('adyen_eu', 'EU', 'EUR', now(), 0.9750, 410, 'ok')
ON CONFLICT DO NOTHING;
