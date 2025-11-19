-- =====================================================================
-- Sous-Brique 116bis: Smart Auto-Routing by Sira
-- Extension de 116 pour décisions automatiques de routing par Sira
-- =====================================================================

-- Table des décisions automatiques de routing par Sira
CREATE TABLE IF NOT EXISTS routing_decisions (
  id BIGSERIAL PRIMARY KEY,
  transaction_id UUID NOT NULL,
  merchant_id UUID NOT NULL,
  user_id UUID,
  method TEXT NOT NULL,                    -- 'wallet' | 'card' | 'bank'
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  candidate_routes JSONB NOT NULL,         -- Ex: {"VISA_US": 0.92, "MTN_SN": 0.87, "SEPA_FR": 0.65}
  chosen_route TEXT NOT NULL,
  confidence NUMERIC(5,4) NOT NULL,        -- Entre 0 et 1
  fallback_route TEXT,
  sira_version TEXT NOT NULL,              -- Version du modèle Sira
  override_by TEXT,                        -- ID ops qui a fait un override manuel
  override_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_confidence CHECK (confidence >= 0 AND confidence <= 1)
);

-- Index pour performances
CREATE INDEX idx_routing_decisions_tx ON routing_decisions(transaction_id);
CREATE INDEX idx_routing_decisions_merchant ON routing_decisions(merchant_id, created_at DESC);
CREATE INDEX idx_routing_decisions_route ON routing_decisions(chosen_route);
CREATE INDEX idx_routing_decisions_confidence ON routing_decisions(confidence DESC);

-- Vue: Décisions avec résultats réels (join avec logs)
CREATE OR REPLACE VIEW v_routing_decisions_with_results AS
SELECT
  rd.id,
  rd.transaction_id,
  rd.merchant_id,
  rd.chosen_route,
  rd.confidence,
  rd.fallback_route,
  rd.sira_version,
  crl.status as actual_status,
  crl.latency_ms as actual_latency,
  crl.error_code,
  CASE
    WHEN crl.status = 'success' THEN true
    WHEN crl.status = 'failed' THEN false
    ELSE NULL
  END as was_correct,
  rd.created_at
FROM routing_decisions rd
LEFT JOIN charge_routing_logs crl ON rd.transaction_id = crl.transaction_id
  AND rd.chosen_route = crl.route;

-- Vue: Performance de Sira (taux de succès des décisions)
CREATE OR REPLACE VIEW v_sira_routing_performance AS
SELECT
  sira_version,
  chosen_route,
  COUNT(*) as total_decisions,
  SUM(CASE WHEN was_correct = true THEN 1 ELSE 0 END) as correct_decisions,
  SUM(CASE WHEN was_correct = false THEN 1 ELSE 0 END) as incorrect_decisions,
  ROUND(AVG(CASE WHEN was_correct = true THEN 1.0 ELSE 0.0 END) * 100, 2) as accuracy_pct,
  ROUND(AVG(confidence) * 100, 2) as avg_confidence_pct
FROM v_routing_decisions_with_results
WHERE was_correct IS NOT NULL
GROUP BY sira_version, chosen_route;

-- Fonction: Obtenir les routes candidates avec scores
CREATE OR REPLACE FUNCTION get_candidate_routes(
  p_merchant_id UUID,
  p_method TEXT,
  p_currency TEXT
)
RETURNS TABLE (
  route TEXT,
  success_rate NUMERIC,
  avg_latency_ms NUMERIC,
  score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    crl.route,
    ROUND(AVG(CASE WHEN crl.status = 'success' THEN 1.0 ELSE 0.0 END), 4) as success_rate,
    ROUND(AVG(crl.latency_ms)::numeric, 2) as avg_latency_ms,
    -- Score simple: 60% success rate + 30% vitesse + 10% récence
    ROUND(
      (AVG(CASE WHEN crl.status = 'success' THEN 1.0 ELSE 0.0 END) * 0.6) +
      ((1000.0 / (AVG(crl.latency_ms) + 1)) * 0.3) +
      (EXTRACT(EPOCH FROM (now() - MAX(crl.created_at))) / 86400.0 * 0.1)
    , 4) as score
  FROM charge_routing_logs crl
  WHERE crl.merchant_id = p_merchant_id
    AND crl.method = p_method
    AND crl.currency = p_currency
    AND crl.created_at >= now() - INTERVAL '30 days'
  GROUP BY crl.route
  HAVING COUNT(*) >= 5  -- Minimum de données
  ORDER BY score DESC;
END;
$$ LANGUAGE plpgsql;

-- Fonction: Comparer décision Sira vs résultat réel
CREATE OR REPLACE FUNCTION analyze_sira_accuracy(p_sira_version TEXT DEFAULT NULL)
RETURNS TABLE (
  sira_version TEXT,
  total_decisions BIGINT,
  correct_decisions BIGINT,
  accuracy_pct NUMERIC,
  avg_confidence NUMERIC,
  high_confidence_correct BIGINT,  -- Correct quand confidence > 0.8
  high_confidence_total BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.sira_version,
    SUM(v.total_decisions) as total_decisions,
    SUM(v.correct_decisions) as correct_decisions,
    ROUND(AVG(v.accuracy_pct), 2) as accuracy_pct,
    ROUND(AVG(v.avg_confidence_pct), 2) as avg_confidence,
    (SELECT COUNT(*) FROM v_routing_decisions_with_results
     WHERE sira_version = v.sira_version AND confidence > 0.8 AND was_correct = true) as high_confidence_correct,
    (SELECT COUNT(*) FROM v_routing_decisions_with_results
     WHERE sira_version = v.sira_version AND confidence > 0.8) as high_confidence_total
  FROM v_sira_routing_performance v
  WHERE p_sira_version IS NULL OR v.sira_version = p_sira_version
  GROUP BY v.sira_version;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE routing_decisions IS 'Décisions automatiques de routing prises par Sira en temps réel';
COMMENT ON COLUMN routing_decisions.candidate_routes IS 'Scores de tous les routes candidats évalués par Sira';
COMMENT ON COLUMN routing_decisions.confidence IS 'Niveau de confiance de Sira dans sa décision (0-1)';
COMMENT ON FUNCTION get_candidate_routes IS 'Calcule les scores des routes candidates pour un marchand/méthode/devise';
COMMENT ON FUNCTION analyze_sira_accuracy IS 'Analyse la précision des décisions de Sira vs résultats réels';
