-- =====================================================================
-- Sous-Brique 116quater: AI Adaptive Routing Over Time (Sira)
-- Extension de 116ter pour routing adaptatif temporel
-- =====================================================================

-- Table: Historique de performance par période
CREATE TABLE IF NOT EXISTS routing_performance_history (
  id BIGSERIAL PRIMARY KEY,
  route TEXT NOT NULL,
  merchant_id UUID NOT NULL,
  method TEXT NOT NULL,                    -- 'wallet' | 'card' | 'bank'
  currency TEXT NOT NULL,
  period DATE NOT NULL,                    -- Granularité journalière (ex: 2025-09-01)
  total_txn INT DEFAULT 0,
  success_txn INT DEFAULT 0,
  fail_txn INT DEFAULT 0,
  retry_txn INT DEFAULT 0,
  avg_latency_ms NUMERIC(10,2),
  p95_latency_ms NUMERIC(10,2),
  avg_fee_percent NUMERIC(5,4),
  total_volume NUMERIC(18,2) DEFAULT 0,
  anomaly_score NUMERIC(5,4) DEFAULT 0,    -- Score d'anomalie (0-1)
  seasonal_factor NUMERIC(5,4) DEFAULT 1.0, -- Facteur saisonnier
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(route, merchant_id, method, currency, period)
);

-- Index pour requêtes time-series rapides
CREATE INDEX idx_route_period ON routing_performance_history(route, period DESC);
CREATE INDEX idx_merchant_period ON routing_performance_history(merchant_id, period DESC);
CREATE INDEX idx_route_merchant_period ON routing_performance_history(route, merchant_id, period DESC);
CREATE INDEX idx_anomaly_score ON routing_performance_history(anomaly_score DESC) WHERE anomaly_score > 0.5;

-- Table: Patterns saisonniers détectés
CREATE TABLE IF NOT EXISTS routing_seasonal_patterns (
  id BIGSERIAL PRIMARY KEY,
  route TEXT NOT NULL,
  merchant_id UUID,
  pattern_type TEXT NOT NULL,              -- 'weekly' | 'monthly' | 'yearly' | 'holiday'
  pattern_name TEXT,                       -- 'black_friday' | 'ramadan' | 'christmas'
  start_period DATE NOT NULL,
  end_period DATE NOT NULL,
  impact_factor NUMERIC(5,4) NOT NULL,     -- Multiplicateur de performance
  confidence NUMERIC(5,4) NOT NULL,        -- Confiance de la détection
  detected_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_seasonal_route ON routing_seasonal_patterns(route, start_period, end_period);

-- Vue: Performance agrégée par route (derniers 30 jours)
CREATE OR REPLACE VIEW v_routing_performance_30d AS
SELECT
  route,
  merchant_id,
  method,
  currency,
  SUM(total_txn) as total_txn,
  SUM(success_txn) as success_txn,
  SUM(fail_txn) as fail_txn,
  ROUND(AVG(CASE WHEN total_txn > 0 THEN (success_txn::numeric / total_txn) ELSE 0 END) * 100, 2) as avg_success_rate_pct,
  ROUND(AVG(avg_latency_ms)::numeric, 2) as avg_latency_ms,
  ROUND(AVG(avg_fee_percent)::numeric, 4) as avg_fee_percent,
  SUM(total_volume) as total_volume,
  ROUND(AVG(anomaly_score)::numeric, 4) as avg_anomaly_score
FROM routing_performance_history
WHERE period >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY route, merchant_id, method, currency;

-- Vue: Heatmap quotidienne (7 derniers jours)
CREATE OR REPLACE VIEW v_routing_heatmap_7d AS
SELECT
  route,
  merchant_id,
  period,
  total_txn,
  ROUND((success_txn::numeric / NULLIF(total_txn, 0)) * 100, 2) as success_rate_pct,
  avg_latency_ms,
  anomaly_score,
  CASE
    WHEN anomaly_score >= 0.7 THEN 'critical'
    WHEN anomaly_score >= 0.5 THEN 'warning'
    ELSE 'normal'
  END as health_status
FROM routing_performance_history
WHERE period >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY merchant_id, route, period DESC;

-- Fonction: Mettre à jour les performances quotidiennes
CREATE OR REPLACE FUNCTION update_daily_performance(
  p_route TEXT,
  p_merchant_id UUID,
  p_method TEXT,
  p_currency TEXT,
  p_success BOOLEAN,
  p_latency_ms INT,
  p_fee_percent NUMERIC,
  p_amount NUMERIC
)
RETURNS BOOLEAN AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_existing_id BIGINT;
BEGIN
  -- Vérifier si un enregistrement existe pour aujourd'hui
  SELECT id INTO v_existing_id
  FROM routing_performance_history
  WHERE route = p_route
    AND merchant_id = p_merchant_id
    AND method = p_method
    AND currency = p_currency
    AND period = v_today;

  IF v_existing_id IS NOT NULL THEN
    -- Mettre à jour l'enregistrement existant
    UPDATE routing_performance_history
    SET total_txn = total_txn + 1,
        success_txn = success_txn + CASE WHEN p_success THEN 1 ELSE 0 END,
        fail_txn = fail_txn + CASE WHEN NOT p_success THEN 1 ELSE 0 END,
        avg_latency_ms = (avg_latency_ms * total_txn + p_latency_ms) / (total_txn + 1),
        avg_fee_percent = (avg_fee_percent * total_txn + p_fee_percent) / (total_txn + 1),
        total_volume = total_volume + p_amount,
        updated_at = now()
    WHERE id = v_existing_id;
  ELSE
    -- Créer un nouvel enregistrement
    INSERT INTO routing_performance_history (
      route, merchant_id, method, currency, period,
      total_txn, success_txn, fail_txn,
      avg_latency_ms, avg_fee_percent, total_volume
    ) VALUES (
      p_route, p_merchant_id, p_method, p_currency, v_today,
      1,
      CASE WHEN p_success THEN 1 ELSE 0 END,
      CASE WHEN NOT p_success THEN 1 ELSE 0 END,
      p_latency_ms, p_fee_percent, p_amount
    );
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Fonction: Calculer le score adaptatif pour une route
CREATE OR REPLACE FUNCTION calculate_adaptive_score(
  p_merchant_id UUID,
  p_method TEXT,
  p_currency TEXT,
  p_route TEXT,
  p_days_back INT DEFAULT 30
)
RETURNS TABLE (
  route TEXT,
  adaptive_score NUMERIC,
  success_rate_pct NUMERIC,
  avg_latency NUMERIC,
  avg_fee NUMERIC,
  trend TEXT,
  seasonal_boost NUMERIC
) AS $$
DECLARE
  v_history RECORD;
  v_score NUMERIC;
  v_trend TEXT;
  v_recent_success NUMERIC;
  v_older_success NUMERIC;
BEGIN
  -- Calculer les métriques récentes (derniers 7 jours)
  SELECT
    COALESCE(AVG(CASE WHEN total_txn > 0 THEN (success_txn::numeric / total_txn) ELSE 0 END), 0) as recent_success,
    COALESCE(AVG(avg_latency_ms), 2000) as recent_latency,
    COALESCE(AVG(avg_fee_percent), 0.03) as recent_fee
  INTO v_recent_success, avg_latency, avg_fee
  FROM routing_performance_history
  WHERE merchant_id = p_merchant_id
    AND method = p_method
    AND currency = p_currency
    AND route = p_route
    AND period >= CURRENT_DATE - INTERVAL '7 days';

  -- Calculer les métriques plus anciennes (8-30 jours)
  SELECT
    COALESCE(AVG(CASE WHEN total_txn > 0 THEN (success_txn::numeric / total_txn) ELSE 0 END), 0)
  INTO v_older_success
  FROM routing_performance_history
  WHERE merchant_id = p_merchant_id
    AND method = p_method
    AND currency = p_currency
    AND route = p_route
    AND period >= CURRENT_DATE - INTERVAL '30 days'
    AND period < CURRENT_DATE - INTERVAL '7 days';

  -- Déterminer la tendance
  IF v_recent_success > v_older_success + 0.05 THEN
    v_trend := 'improving';
  ELSIF v_recent_success < v_older_success - 0.05 THEN
    v_trend := 'degrading';
  ELSE
    v_trend := 'stable';
  END IF;

  -- Calculer le facteur saisonnier (récupérer depuis patterns)
  SELECT COALESCE(MAX(impact_factor), 1.0)
  INTO seasonal_boost
  FROM routing_seasonal_patterns
  WHERE route = p_route
    AND (merchant_id = p_merchant_id OR merchant_id IS NULL)
    AND CURRENT_DATE BETWEEN start_period AND end_period;

  -- Score adaptatif :
  -- 50% success rate + 30% latency + 15% fees + 5% trend + seasonal boost
  v_score := (
    (v_recent_success * 0.5) +
    ((1000.0 / (avg_latency + 1)) * 0.3) +
    ((1.0 - avg_fee) * 0.15) +
    (CASE v_trend WHEN 'improving' THEN 0.05 WHEN 'degrading' THEN -0.05 ELSE 0 END)
  ) * seasonal_boost;

  RETURN QUERY SELECT
    p_route as route,
    ROUND(v_score, 4) as adaptive_score,
    ROUND(v_recent_success * 100, 2) as success_rate_pct,
    avg_latency,
    avg_fee,
    v_trend as trend,
    seasonal_boost;
END;
$$ LANGUAGE plpgsql;

-- Fonction: Obtenir la meilleure route adaptative pour un marchand
CREATE OR REPLACE FUNCTION get_adaptive_route_recommendation(
  p_merchant_id UUID,
  p_method TEXT,
  p_currency TEXT,
  p_days_back INT DEFAULT 30
)
RETURNS TABLE (
  best_route TEXT,
  adaptive_score NUMERIC,
  success_rate_pct NUMERIC,
  avg_latency NUMERIC,
  trend TEXT,
  alternatives JSONB
) AS $$
DECLARE
  v_routes TEXT[];
  v_route TEXT;
  v_results JSONB := '[]'::JSONB;
  v_best RECORD;
BEGIN
  -- Obtenir toutes les routes utilisées récemment
  SELECT ARRAY_AGG(DISTINCT route)
  INTO v_routes
  FROM routing_performance_history
  WHERE merchant_id = p_merchant_id
    AND method = p_method
    AND currency = p_currency
    AND period >= CURRENT_DATE - (p_days_back || ' days')::INTERVAL;

  -- Calculer le score pour chaque route
  FOR v_route IN SELECT UNNEST(v_routes) LOOP
    SELECT jsonb_build_object(
      'route', s.route,
      'score', s.adaptive_score,
      'success_rate', s.success_rate_pct,
      'latency', s.avg_latency,
      'trend', s.trend
    )
    INTO v_results
    FROM calculate_adaptive_score(p_merchant_id, p_method, p_currency, v_route, p_days_back) s;
  END LOOP;

  -- Sélectionner la meilleure route
  SELECT s.*
  INTO v_best
  FROM calculate_adaptive_score(p_merchant_id, p_method, p_currency, v_routes[1], p_days_back) s
  ORDER BY s.adaptive_score DESC
  LIMIT 1;

  RETURN QUERY SELECT
    v_best.route as best_route,
    v_best.adaptive_score,
    v_best.success_rate_pct,
    v_best.avg_latency,
    v_best.trend,
    v_results as alternatives;
END;
$$ LANGUAGE plpgsql;

-- Fonction: Détecter les anomalies quotidiennes
CREATE OR REPLACE FUNCTION detect_daily_anomalies()
RETURNS INT AS $$
DECLARE
  v_count INT := 0;
  v_record RECORD;
  v_avg_success NUMERIC;
  v_std_success NUMERIC;
  v_anomaly_score NUMERIC;
BEGIN
  FOR v_record IN
    SELECT * FROM routing_performance_history
    WHERE period = CURRENT_DATE - INTERVAL '1 day'
      AND total_txn >= 10  -- Minimum de transactions
  LOOP
    -- Calculer la moyenne et écart-type des 30 derniers jours
    SELECT
      AVG(CASE WHEN total_txn > 0 THEN (success_txn::numeric / total_txn) ELSE 0 END),
      STDDEV(CASE WHEN total_txn > 0 THEN (success_txn::numeric / total_txn) ELSE 0 END)
    INTO v_avg_success, v_std_success
    FROM routing_performance_history
    WHERE route = v_record.route
      AND merchant_id = v_record.merchant_id
      AND period >= CURRENT_DATE - INTERVAL '30 days'
      AND period < CURRENT_DATE - INTERVAL '1 day';

    -- Calculer le score d'anomalie (basé sur z-score)
    IF v_std_success > 0 THEN
      v_anomaly_score := ABS(
        ((v_record.success_txn::numeric / NULLIF(v_record.total_txn, 0)) - v_avg_success) / v_std_success
      );

      -- Mettre à jour si anomalie détectée
      IF v_anomaly_score > 2.0 THEN  -- 2 sigma = anomalie
        UPDATE routing_performance_history
        SET anomaly_score = LEAST(v_anomaly_score / 3.0, 1.0)  -- Normaliser entre 0 et 1
        WHERE id = v_record.id;

        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE routing_performance_history IS 'Historique quotidien de performance par route pour routing adaptatif temporel';
COMMENT ON TABLE routing_seasonal_patterns IS 'Patterns saisonniers détectés (Black Friday, Ramadan, Noël, etc.)';
COMMENT ON FUNCTION update_daily_performance IS 'Met à jour les performances quotidiennes d\'une route';
COMMENT ON FUNCTION calculate_adaptive_score IS 'Calcule le score adaptatif basé sur historique et tendances';
COMMENT ON FUNCTION get_adaptive_route_recommendation IS 'Retourne la meilleure route adaptative pour un marchand';
COMMENT ON FUNCTION detect_daily_anomalies IS 'Détecte les anomalies dans les performances quotidiennes';
