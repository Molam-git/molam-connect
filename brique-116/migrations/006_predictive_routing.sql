-- =====================================================================
-- Brique 116sexies: Predictive Routing (Sira Forecasting)
-- =====================================================================
-- Prédictions ML pour optimiser le routage avant les transactions
-- =====================================================================

-- Table des prévisions de routage
CREATE TABLE IF NOT EXISTS routing_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL,
    currency TEXT NOT NULL,
    route TEXT NOT NULL,
    forecast_date DATE NOT NULL,
    predicted_success_rate NUMERIC(5,4),  -- 0.9876 = 98.76%
    predicted_latency_ms NUMERIC(8,2),
    predicted_fee_percent NUMERIC(6,4),
    sira_confidence NUMERIC(5,4),          -- niveau de confiance 0-1
    model_version TEXT DEFAULT 'v1',
    created_at TIMESTAMP DEFAULT now(),
    UNIQUE (merchant_id, currency, route, forecast_date)
);

-- Index pour recherches rapides
CREATE INDEX idx_routing_forecasts_lookup ON routing_forecasts(merchant_id, currency, forecast_date);
CREATE INDEX idx_routing_forecasts_confidence ON routing_forecasts(sira_confidence DESC);
CREATE INDEX idx_routing_forecasts_date ON routing_forecasts(forecast_date DESC);

-- Table pour historique d'entraînement des modèles
CREATE TABLE IF NOT EXISTS routing_model_training (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name TEXT NOT NULL,
    model_version TEXT NOT NULL,
    training_date TIMESTAMP DEFAULT now(),
    records_used INT,
    accuracy_score NUMERIC(5,4),
    rmse NUMERIC(10,4),
    status TEXT DEFAULT 'completed',  -- training, completed, failed
    metadata JSONB,
    UNIQUE (model_name, model_version)
);

-- Vue des meilleures prévisions par merchant/currency
CREATE OR REPLACE VIEW routing_best_forecasts AS
SELECT DISTINCT ON (merchant_id, currency, forecast_date)
    id,
    merchant_id,
    currency,
    route,
    forecast_date,
    predicted_success_rate,
    predicted_latency_ms,
    predicted_fee_percent,
    sira_confidence,
    created_at
FROM routing_forecasts
WHERE forecast_date >= CURRENT_DATE
ORDER BY merchant_id, currency, forecast_date, sira_confidence DESC;

-- Fonction pour obtenir la meilleure route prédite
CREATE OR REPLACE FUNCTION get_best_predicted_route(
    p_merchant_id UUID,
    p_currency TEXT,
    p_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
    route TEXT,
    predicted_success_rate NUMERIC,
    predicted_latency_ms NUMERIC,
    predicted_fee_percent NUMERIC,
    sira_confidence NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.route,
        f.predicted_success_rate,
        f.predicted_latency_ms,
        f.predicted_fee_percent,
        f.sira_confidence
    FROM routing_forecasts f
    WHERE f.merchant_id = p_merchant_id
      AND f.currency = p_currency
      AND f.forecast_date = p_date
    ORDER BY f.sira_confidence DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour calculer le score composite d'une prévision
CREATE OR REPLACE FUNCTION calculate_forecast_score(
    success_rate NUMERIC,
    latency_ms NUMERIC,
    fee_percent NUMERIC
) RETURNS NUMERIC AS $$
BEGIN
    -- Score similaire à calculate_route_score
    RETURN COALESCE(success_rate, 0)
           - COALESCE(fee_percent, 0) * 0.01
           - COALESCE(latency_ms, 0) * 0.0005;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Nettoyage automatique des vieilles prévisions (> 30 jours)
CREATE OR REPLACE FUNCTION cleanup_old_forecasts()
RETURNS void AS $$
BEGIN
    DELETE FROM routing_forecasts
    WHERE forecast_date < CURRENT_DATE - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Commentaires
COMMENT ON TABLE routing_forecasts IS 'Prévisions ML des performances de routage par Sira';
COMMENT ON TABLE routing_model_training IS 'Historique des entraînements de modèles ML';
COMMENT ON VIEW routing_best_forecasts IS 'Meilleures prévisions par merchant/currency';
COMMENT ON FUNCTION get_best_predicted_route IS 'Retourne la meilleure route prédite pour un contexte donné';

-- Données de test
INSERT INTO routing_forecasts (merchant_id, currency, route, forecast_date, predicted_success_rate, predicted_latency_ms, predicted_fee_percent, sira_confidence)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'XOF', 'bank_bci', CURRENT_DATE, 0.9650, 480, 2.8, 0.89),
    ('11111111-1111-1111-1111-111111111111', 'XOF', 'bank_coris', CURRENT_DATE, 0.9820, 420, 2.5, 0.94),
    ('22222222-2222-2222-2222-222222222222', 'EUR', 'stripe', CURRENT_DATE, 0.9700, 350, 2.9, 0.91),
    ('22222222-2222-2222-2222-222222222222', 'EUR', 'adyen', CURRENT_DATE, 0.9750, 380, 3.1, 0.88)
ON CONFLICT (merchant_id, currency, route, forecast_date) DO NOTHING;
