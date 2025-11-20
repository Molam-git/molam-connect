-- =====================================================================
-- Brique 116quinquies: Dynamic A/B Routing (Sira Live Testing)
-- =====================================================================
-- Permet à Sira de tester en temps réel plusieurs routes de paiement
-- et de choisir le meilleur chemin dynamique pour les futures transactions
-- =====================================================================

-- Table des tests A/B pour le routing
CREATE TABLE IF NOT EXISTS routing_ab_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL,
    currency TEXT NOT NULL,
    primary_route TEXT NOT NULL,      -- Route principale actuelle
    test_route TEXT NOT NULL,          -- Route alternative à tester
    allocation_percent INT DEFAULT 5,  -- % des transactions envoyées en test
    start_date TIMESTAMP DEFAULT now(),
    end_date TIMESTAMP,
    status TEXT DEFAULT 'active',      -- active, paused, completed
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    created_by TEXT,
    CONSTRAINT valid_allocation CHECK (allocation_percent BETWEEN 1 AND 50),
    CONSTRAINT valid_status CHECK (status IN ('active', 'paused', 'completed', 'cancelled'))
);

-- Index pour recherche rapide par merchant
CREATE INDEX idx_routing_ab_tests_merchant ON routing_ab_tests(merchant_id, status);
CREATE INDEX idx_routing_ab_tests_currency ON routing_ab_tests(currency);

-- Table des résultats de tests A/B
CREATE TABLE IF NOT EXISTS routing_ab_results (
    id BIGSERIAL PRIMARY KEY,
    ab_test_id UUID NOT NULL REFERENCES routing_ab_tests(id) ON DELETE CASCADE,
    txn_id UUID,
    route_used TEXT NOT NULL,          -- primary or test
    route_name TEXT NOT NULL,          -- Nom de la route utilisée
    success BOOLEAN NOT NULL,
    latency_ms NUMERIC(10,2),
    fee_percent NUMERIC(6,4),
    error_code TEXT,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT now()
);

-- Index pour analyse rapide des résultats
CREATE INDEX idx_routing_ab_results_test ON routing_ab_results(ab_test_id, route_used);
CREATE INDEX idx_routing_ab_results_created ON routing_ab_results(created_at);
CREATE INDEX idx_routing_ab_results_txn ON routing_ab_results(txn_id);

-- Table des décisions Sira basées sur les tests A/B
CREATE TABLE IF NOT EXISTS routing_ab_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ab_test_id UUID REFERENCES routing_ab_tests(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL,
    currency TEXT NOT NULL,
    winning_route TEXT NOT NULL,
    primary_score NUMERIC(6,4),
    test_score NUMERIC(6,4),
    decision_reason TEXT,
    transactions_analyzed INT,
    decision_date TIMESTAMP DEFAULT now(),
    auto_applied BOOLEAN DEFAULT false,
    applied_at TIMESTAMP
);

-- Index pour historique des décisions
CREATE INDEX idx_routing_ab_decisions_merchant ON routing_ab_decisions(merchant_id, currency);
CREATE INDEX idx_routing_ab_decisions_test ON routing_ab_decisions(ab_test_id);

-- Vue agrégée des performances par test
CREATE OR REPLACE VIEW routing_ab_performance AS
SELECT
    t.id AS test_id,
    t.merchant_id,
    t.currency,
    t.primary_route,
    t.test_route,
    t.status,
    -- Stats Primary Route
    COUNT(*) FILTER (WHERE r.route_used = 'primary') AS primary_count,
    AVG(r.latency_ms) FILTER (WHERE r.route_used = 'primary') AS primary_avg_latency,
    AVG(r.fee_percent) FILTER (WHERE r.route_used = 'primary') AS primary_avg_fee,
    (COUNT(*) FILTER (WHERE r.route_used = 'primary' AND r.success = true)::FLOAT /
     NULLIF(COUNT(*) FILTER (WHERE r.route_used = 'primary'), 0)) AS primary_success_rate,
    -- Stats Test Route
    COUNT(*) FILTER (WHERE r.route_used = 'test') AS test_count,
    AVG(r.latency_ms) FILTER (WHERE r.route_used = 'test') AS test_avg_latency,
    AVG(r.fee_percent) FILTER (WHERE r.route_used = 'test') AS test_avg_fee,
    (COUNT(*) FILTER (WHERE r.route_used = 'test' AND r.success = true)::FLOAT /
     NULLIF(COUNT(*) FILTER (WHERE r.route_used = 'test'), 0)) AS test_success_rate,
    -- Metadata
    t.start_date,
    t.end_date,
    MAX(r.created_at) AS last_result_at
FROM routing_ab_tests t
LEFT JOIN routing_ab_results r ON t.id = r.ab_test_id
GROUP BY t.id;

-- Fonction pour calculer le score d'une route
CREATE OR REPLACE FUNCTION calculate_route_score(
    success_rate NUMERIC,
    avg_latency NUMERIC,
    avg_fee NUMERIC
) RETURNS NUMERIC AS $$
BEGIN
    -- Score = Success Rate - (Fee Impact) - (Latency Impact)
    -- Success rate weight: 1.0
    -- Fee weight: 0.01 (1% fee = -0.01 score)
    -- Latency weight: 0.0005 (1000ms = -0.5 score)
    RETURN COALESCE(success_rate, 0)
           - COALESCE(avg_fee, 0) * 0.01
           - COALESCE(avg_latency, 0) * 0.0005;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Fonction pour obtenir les statistiques d'un test
CREATE OR REPLACE FUNCTION get_ab_test_stats(test_id UUID)
RETURNS TABLE(
    route_type TEXT,
    total_txn INT,
    success_rate NUMERIC,
    avg_latency NUMERIC,
    avg_fee NUMERIC,
    score NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.route_used,
        COUNT(*)::INT,
        (COUNT(*) FILTER (WHERE r.success = true)::FLOAT / COUNT(*))::NUMERIC(6,4),
        AVG(r.latency_ms)::NUMERIC(10,2),
        AVG(r.fee_percent)::NUMERIC(6,4),
        calculate_route_score(
            (COUNT(*) FILTER (WHERE r.success = true)::FLOAT / COUNT(*))::NUMERIC,
            AVG(r.latency_ms)::NUMERIC,
            AVG(r.fee_percent)::NUMERIC
        ) AS score
    FROM routing_ab_results r
    WHERE r.ab_test_id = test_id
    GROUP BY r.route_used;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_routing_ab_tests_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER routing_ab_tests_updated
    BEFORE UPDATE ON routing_ab_tests
    FOR EACH ROW
    EXECUTE FUNCTION update_routing_ab_tests_timestamp();

-- Commentaires
COMMENT ON TABLE routing_ab_tests IS 'Tests A/B pour optimiser les routes de paiement';
COMMENT ON TABLE routing_ab_results IS 'Résultats détaillés des transactions dans les tests A/B';
COMMENT ON TABLE routing_ab_decisions IS 'Décisions Sira basées sur l''analyse des tests A/B';
COMMENT ON VIEW routing_ab_performance IS 'Vue agrégée des performances des tests A/B';
COMMENT ON FUNCTION calculate_route_score IS 'Calcule un score global pour évaluer une route de paiement';

-- Données de test (optionnel)
INSERT INTO routing_ab_tests (merchant_id, currency, primary_route, test_route, allocation_percent, status)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'XOF', 'bank_bci', 'bank_coris', 10, 'active'),
    ('22222222-2222-2222-2222-222222222222', 'EUR', 'stripe', 'adyen', 5, 'active')
ON CONFLICT DO NOTHING;

-- Permissions (ajuster selon votre système RBAC)
-- GRANT SELECT, INSERT, UPDATE ON routing_ab_tests TO pay_admin;
-- GRANT SELECT, INSERT ON routing_ab_results TO payment_service;
-- GRANT SELECT ON routing_ab_performance TO ops_team;
