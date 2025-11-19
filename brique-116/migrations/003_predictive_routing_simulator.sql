-- =====================================================================
-- Sous-Brique 116ter: Predictive Routing Simulator (Sira)
-- Extension de 116bis pour simuler le routing avant exécution
-- =====================================================================

-- Table des simulations de routing (pour preview avant exécution)
CREATE TABLE IF NOT EXISTS routing_simulations (
  id BIGSERIAL PRIMARY KEY,
  simulation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  user_id UUID,
  method TEXT NOT NULL,                    -- 'wallet' | 'card' | 'bank'
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  simulated_routes JSONB NOT NULL,         -- Résultats de simulation pour chaque route
  chosen_route TEXT,                       -- Route finalement choisie (NULL si pas encore exécuté)
  actual_outcome TEXT,                     -- 'success' | 'failed' (NULL si pas encore exécuté)
  was_prediction_correct BOOLEAN,          -- Si la prédiction était correcte
  sira_version TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  executed_at TIMESTAMPTZ
);

-- Index pour performances
CREATE INDEX idx_routing_simulations_merchant ON routing_simulations(merchant_id, created_at DESC);
CREATE INDEX idx_routing_simulations_sim_id ON routing_simulations(simulation_id);
CREATE INDEX idx_routing_simulations_accuracy ON routing_simulations(was_prediction_correct) WHERE was_prediction_correct IS NOT NULL;

-- Vue: Simulations avec résultats réels
CREATE OR REPLACE VIEW v_routing_simulations_accuracy AS
SELECT
  rs.id,
  rs.simulation_id,
  rs.merchant_id,
  rs.method,
  rs.amount,
  rs.currency,
  rs.simulated_routes,
  rs.chosen_route,
  rs.actual_outcome,
  rs.was_prediction_correct,
  rs.sira_version,
  rs.created_at,
  rs.executed_at,
  EXTRACT(EPOCH FROM (rs.executed_at - rs.created_at)) as preview_duration_sec
FROM routing_simulations rs
WHERE rs.executed_at IS NOT NULL;

-- Vue: Performance des prédictions par route
CREATE OR REPLACE VIEW v_prediction_accuracy_by_route AS
SELECT
  chosen_route,
  sira_version,
  COUNT(*) as total_predictions,
  SUM(CASE WHEN was_prediction_correct = true THEN 1 ELSE 0 END) as correct_predictions,
  ROUND(AVG(CASE WHEN was_prediction_correct = true THEN 1.0 ELSE 0.0 END) * 100, 2) as accuracy_pct,
  AVG((simulated_routes->chosen_route->>'success_rate_pct')::numeric) as avg_predicted_success_pct,
  AVG(CASE
    WHEN actual_outcome = 'success' THEN 100.0
    ELSE 0.0
  END) as avg_actual_success_pct
FROM routing_simulations
WHERE executed_at IS NOT NULL
  AND chosen_route IS NOT NULL
GROUP BY chosen_route, sira_version;

-- Fonction: Simuler les routes disponibles avec prédictions
CREATE OR REPLACE FUNCTION simulate_routing(
  p_merchant_id UUID,
  p_method TEXT,
  p_amount NUMERIC,
  p_currency TEXT,
  p_country_code TEXT DEFAULT NULL
)
RETURNS TABLE (
  route TEXT,
  predicted_success_rate_pct NUMERIC,
  predicted_latency_ms NUMERIC,
  predicted_fees_usd NUMERIC,
  confidence NUMERIC,
  risk_level TEXT,
  recommendation TEXT
) AS $$
DECLARE
  v_base_fee NUMERIC;
  v_route_record RECORD;
  v_recent_failures INT;
  v_avg_latency NUMERIC;
  v_success_rate NUMERIC;
BEGIN
  -- Pour chaque route disponible, calculer les métriques prédictives
  FOR v_route_record IN
    SELECT
      crl.route,
      COUNT(*) as total_attempts,
      AVG(CASE WHEN crl.status = 'success' THEN 1.0 ELSE 0.0 END) as success_rate,
      AVG(crl.latency_ms) as avg_latency,
      SUM(CASE WHEN crl.status = 'failed' AND crl.created_at >= now() - INTERVAL '1 hour' THEN 1 ELSE 0 END) as recent_failures_1h
    FROM charge_routing_logs crl
    WHERE crl.merchant_id = p_merchant_id
      AND crl.method = p_method
      AND crl.currency = p_currency
      AND crl.created_at >= now() - INTERVAL '30 days'
    GROUP BY crl.route
    HAVING COUNT(*) >= 3  -- Minimum de données
  LOOP
    v_success_rate := COALESCE(v_route_record.success_rate, 0.5);
    v_avg_latency := COALESCE(v_route_record.avg_latency, 2000);
    v_recent_failures := COALESCE(v_route_record.recent_failures_1h, 0);

    -- Calcul des frais estimés (logique simplifiée)
    v_base_fee := CASE
      WHEN v_route_record.route ILIKE '%VISA%' OR v_route_record.route ILIKE '%MASTERCARD%' THEN p_amount * 0.029 + 0.30
      WHEN v_route_record.route ILIKE '%MTN%' OR v_route_record.route ILIKE '%ORANGE%' THEN p_amount * 0.02
      WHEN v_route_record.route ILIKE '%SEPA%' THEN 0.50
      ELSE p_amount * 0.025
    END;

    -- Ajustement de la confiance basé sur le volume de données
    DECLARE
      v_confidence NUMERIC;
      v_risk_level TEXT;
      v_recommendation TEXT;
    BEGIN
      v_confidence := LEAST(v_route_record.total_attempts / 100.0, 1.0);

      -- Déterminer le niveau de risque
      IF v_success_rate >= 0.95 AND v_recent_failures = 0 THEN
        v_risk_level := 'low';
        v_recommendation := 'recommended';
      ELSIF v_success_rate >= 0.85 AND v_recent_failures <= 2 THEN
        v_risk_level := 'medium';
        v_recommendation := 'acceptable';
      ELSIF v_success_rate >= 0.70 THEN
        v_risk_level := 'high';
        v_recommendation := 'caution';
      ELSE
        v_risk_level := 'critical';
        v_recommendation := 'avoid';
      END IF;

      -- Pénaliser si échecs récents
      IF v_recent_failures >= 5 THEN
        v_risk_level := 'critical';
        v_recommendation := 'avoid';
      END IF;

      RETURN QUERY SELECT
        v_route_record.route,
        ROUND(v_success_rate * 100, 2) as predicted_success_rate_pct,
        ROUND(v_avg_latency, 0) as predicted_latency_ms,
        ROUND(v_base_fee, 2) as predicted_fees_usd,
        ROUND(v_confidence, 4) as confidence,
        v_risk_level,
        v_recommendation;
    END;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Fonction: Enregistrer l'exécution réelle après simulation
CREATE OR REPLACE FUNCTION record_simulation_outcome(
  p_simulation_id UUID,
  p_chosen_route TEXT,
  p_actual_outcome TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_predicted_success NUMERIC;
  v_was_correct BOOLEAN;
BEGIN
  -- Récupérer la prédiction
  SELECT (simulated_routes->p_chosen_route->>'predicted_success_rate_pct')::numeric
  INTO v_predicted_success
  FROM routing_simulations
  WHERE simulation_id = p_simulation_id;

  -- Déterminer si la prédiction était correcte
  -- Si on prédisait >80% de succès et ça a réussi → correct
  -- Si on prédisait <80% de succès et ça a échoué → correct
  v_was_correct := CASE
    WHEN v_predicted_success >= 80 AND p_actual_outcome = 'success' THEN true
    WHEN v_predicted_success < 80 AND p_actual_outcome = 'failed' THEN true
    ELSE false
  END;

  -- Mettre à jour la simulation
  UPDATE routing_simulations
  SET chosen_route = p_chosen_route,
      actual_outcome = p_actual_outcome,
      was_prediction_correct = v_was_correct,
      executed_at = now()
  WHERE simulation_id = p_simulation_id;

  RETURN v_was_correct;
END;
$$ LANGUAGE plpgsql;

-- Fonction: Analyser la précision des simulations
CREATE OR REPLACE FUNCTION analyze_simulation_accuracy(
  p_sira_version TEXT DEFAULT NULL,
  p_days_back INT DEFAULT 30
)
RETURNS TABLE (
  sira_version TEXT,
  total_simulations BIGINT,
  executed_simulations BIGINT,
  correct_predictions BIGINT,
  accuracy_pct NUMERIC,
  avg_preview_duration_sec NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rs.sira_version,
    COUNT(*) as total_simulations,
    COUNT(rs.executed_at) as executed_simulations,
    SUM(CASE WHEN rs.was_prediction_correct = true THEN 1 ELSE 0 END) as correct_predictions,
    ROUND(
      AVG(CASE WHEN rs.was_prediction_correct = true THEN 1.0 ELSE 0.0 END) * 100,
      2
    ) as accuracy_pct,
    ROUND(
      AVG(EXTRACT(EPOCH FROM (rs.executed_at - rs.created_at)))::numeric,
      2
    ) as avg_preview_duration_sec
  FROM routing_simulations rs
  WHERE rs.created_at >= now() - (p_days_back || ' days')::INTERVAL
    AND (p_sira_version IS NULL OR rs.sira_version = p_sira_version)
    AND rs.executed_at IS NOT NULL
  GROUP BY rs.sira_version;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE routing_simulations IS 'Simulations prédictives de routing avant exécution réelle';
COMMENT ON COLUMN routing_simulations.simulated_routes IS 'JSONB avec prédictions pour chaque route: {route: {success_rate_pct, latency_ms, fees_usd, risk_level}}';
COMMENT ON FUNCTION simulate_routing IS 'Prédit les résultats pour toutes les routes disponibles avant exécution';
COMMENT ON FUNCTION record_simulation_outcome IS 'Enregistre le résultat réel pour vérifier la précision de Sira';
COMMENT ON FUNCTION analyze_simulation_accuracy IS 'Analyse la précision des prédictions de Sira';
