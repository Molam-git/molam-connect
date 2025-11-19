-- =====================================================================
-- Brique 116: Charge Routing Logs (Debugging & SIRA Learning)
-- =====================================================================

-- Table principale : logs de routing de paiements
CREATE TABLE IF NOT EXISTS charge_routing_logs (
  id BIGSERIAL PRIMARY KEY,
  transaction_id UUID NOT NULL,
  merchant_id UUID NOT NULL,
  user_id UUID,
  method TEXT NOT NULL,              -- 'wallet' | 'card' | 'bank'
  route TEXT NOT NULL,               -- Ex: 'VISA_US', 'MTN_SN', 'SEPA_FR', 'ORANGE_CI'
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,            -- ISO 4217: 'USD', 'XOF', 'EUR'
  status TEXT NOT NULL,              -- 'success' | 'failed' | 'retried'
  latency_ms INT,                    -- Latence en millisecondes
  error_code TEXT,                   -- Code erreur si échec
  fallback_route TEXT,               -- Route de secours utilisée si rerouté
  country_code TEXT,                 -- Pays du paiement (ISO 3166-1)
  provider TEXT,                     -- Fournisseur de paiement (Stripe, Wave, etc.)
  metadata JSONB,                    -- Données additionnelles
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_method CHECK (method IN ('wallet', 'card', 'bank')),
  CONSTRAINT valid_status CHECK (status IN ('success', 'failed', 'retried')),
  CONSTRAINT positive_amount CHECK (amount > 0),
  CONSTRAINT positive_latency CHECK (latency_ms >= 0)
);

-- Index pour performances
CREATE INDEX idx_charge_routing_tx ON charge_routing_logs(transaction_id);
CREATE INDEX idx_charge_routing_merchant ON charge_routing_logs(merchant_id, created_at DESC);
CREATE INDEX idx_charge_routing_route ON charge_routing_logs(route, status);
CREATE INDEX idx_charge_routing_status ON charge_routing_logs(status, created_at DESC);
CREATE INDEX idx_charge_routing_method ON charge_routing_logs(method, route);

-- Vue : statistiques par route pour un marchand
CREATE OR REPLACE VIEW v_routing_stats_by_route AS
SELECT
  merchant_id,
  route,
  method,
  COUNT(*) as total_attempts,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_attempts,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_attempts,
  ROUND(AVG(CASE WHEN status = 'success' THEN 1.0 ELSE 0.0 END) * 100, 2) as success_rate_pct,
  ROUND(AVG(latency_ms)::numeric, 2) as avg_latency_ms,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms)::numeric, 2) as p50_latency_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric, 2) as p95_latency_ms,
  MIN(created_at) as first_use,
  MAX(created_at) as last_use
FROM charge_routing_logs
GROUP BY merchant_id, route, method;

-- Vue : performance globale par méthode de paiement
CREATE OR REPLACE VIEW v_routing_stats_by_method AS
SELECT
  merchant_id,
  method,
  COUNT(*) as total_attempts,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_attempts,
  ROUND(AVG(CASE WHEN status = 'success' THEN 1.0 ELSE 0.0 END) * 100, 2) as success_rate_pct,
  ROUND(AVG(latency_ms)::numeric, 2) as avg_latency_ms,
  SUM(amount) as total_volume,
  currency
FROM charge_routing_logs
GROUP BY merchant_id, method, currency;

-- Vue : routes avec taux d'échec élevé (> 10%)
CREATE OR REPLACE VIEW v_failing_routes AS
SELECT
  merchant_id,
  route,
  method,
  COUNT(*) as total_attempts,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_attempts,
  ROUND(AVG(CASE WHEN status = 'failed' THEN 1.0 ELSE 0.0 END) * 100, 2) as failure_rate_pct,
  MAX(created_at) as last_failure
FROM charge_routing_logs
WHERE created_at >= now() - INTERVAL '24 hours'
GROUP BY merchant_id, route, method
HAVING AVG(CASE WHEN status = 'failed' THEN 1.0 ELSE 0.0 END) > 0.10
ORDER BY failure_rate_pct DESC;

-- Vue : routes lentes (p95 > 2000ms)
CREATE OR REPLACE VIEW v_slow_routes AS
SELECT
  merchant_id,
  route,
  method,
  COUNT(*) as total_attempts,
  ROUND(AVG(latency_ms)::numeric, 2) as avg_latency_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric, 2) as p95_latency_ms,
  MAX(created_at) as last_use
FROM charge_routing_logs
WHERE created_at >= now() - INTERVAL '24 hours'
  AND latency_ms IS NOT NULL
GROUP BY merchant_id, route, method
HAVING PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) > 2000
ORDER BY p95_latency_ms DESC;

-- Fonction : Recommandations Sira pour optimisation de routes
CREATE OR REPLACE FUNCTION get_route_recommendations(p_merchant_id UUID, p_method TEXT DEFAULT NULL)
RETURNS TABLE (
  route TEXT,
  recommendation TEXT,
  reason TEXT,
  metrics JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.route,
    CASE
      WHEN r.failure_rate_pct > 20 THEN 'disable'
      WHEN r.failure_rate_pct > 10 THEN 'monitor'
      WHEN r.p95_latency_ms > 3000 THEN 'optimize_latency'
      WHEN r.success_rate_pct > 95 AND r.avg_latency_ms < 1000 THEN 'prioritize'
      ELSE 'ok'
    END as recommendation,
    CASE
      WHEN r.failure_rate_pct > 20 THEN 'Taux d''échec critique (' || r.failure_rate_pct || '%)'
      WHEN r.failure_rate_pct > 10 THEN 'Taux d''échec élevé (' || r.failure_rate_pct || '%)'
      WHEN r.p95_latency_ms > 3000 THEN 'Latence p95 excessive (' || r.p95_latency_ms || 'ms)'
      WHEN r.success_rate_pct > 95 AND r.avg_latency_ms < 1000 THEN 'Performance excellente'
      ELSE 'Performance normale'
    END as reason,
    jsonb_build_object(
      'total_attempts', r.total_attempts,
      'success_rate_pct', r.success_rate_pct,
      'avg_latency_ms', r.avg_latency_ms,
      'p95_latency_ms', r.p95_latency_ms
    ) as metrics
  FROM v_routing_stats_by_route r
  WHERE r.merchant_id = p_merchant_id
    AND (p_method IS NULL OR r.method = p_method)
    AND r.total_attempts >= 10  -- Minimum statistique
  ORDER BY
    CASE
      WHEN r.failure_rate_pct > 20 THEN 1
      WHEN r.failure_rate_pct > 10 THEN 2
      WHEN r.p95_latency_ms > 3000 THEN 3
      ELSE 4
    END;
END;
$$ LANGUAGE plpgsql;

-- Fonction : Détection d'anomalies en temps réel
CREATE OR REPLACE FUNCTION detect_routing_anomalies()
RETURNS TABLE (
  merchant_id UUID,
  route TEXT,
  anomaly_type TEXT,
  current_value NUMERIC,
  threshold NUMERIC,
  detected_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Anomalie : spike de failures dans les 15 dernières minutes
  RETURN QUERY
  SELECT
    crl.merchant_id,
    crl.route,
    'failure_spike'::TEXT,
    ROUND(AVG(CASE WHEN crl.status = 'failed' THEN 1.0 ELSE 0.0 END) * 100, 2),
    15.0 as threshold,
    now() as detected_at
  FROM charge_routing_logs crl
  WHERE crl.created_at >= now() - INTERVAL '15 minutes'
  GROUP BY crl.merchant_id, crl.route
  HAVING AVG(CASE WHEN crl.status = 'failed' THEN 1.0 ELSE 0.0 END) > 0.15;

  -- Anomalie : latence anormalement élevée
  RETURN QUERY
  SELECT
    crl.merchant_id,
    crl.route,
    'latency_spike'::TEXT,
    ROUND(AVG(crl.latency_ms)::numeric, 2),
    2000.0 as threshold,
    now() as detected_at
  FROM charge_routing_logs crl
  WHERE crl.created_at >= now() - INTERVAL '15 minutes'
    AND crl.latency_ms IS NOT NULL
  GROUP BY crl.merchant_id, crl.route
  HAVING AVG(crl.latency_ms) > 2000;
END;
$$ LANGUAGE plpgsql;

-- Commentaires
COMMENT ON TABLE charge_routing_logs IS 'Logs détaillés de routing de paiements pour debugging et apprentissage Sira';
COMMENT ON COLUMN charge_routing_logs.route IS 'Identifiant du rail de paiement utilisé (ex: VISA_US, MTN_SN, SEPA_FR)';
COMMENT ON COLUMN charge_routing_logs.fallback_route IS 'Route de secours si la route principale a échoué';
COMMENT ON FUNCTION get_route_recommendations IS 'Recommandations Sira pour optimiser les routes de paiement';
COMMENT ON FUNCTION detect_routing_anomalies IS 'Détection temps réel d''anomalies de routing (spike failures, latence)';
