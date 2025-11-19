-- =====================================================================
-- Sous-Brique 115ter: Canary Release & Progressive Rollout
-- Extension de 115bis pour supporter les déploiements progressifs
-- =====================================================================

-- Table pour tracker les rollouts progressifs
CREATE TABLE IF NOT EXISTS plugin_rollouts (
  id SERIAL PRIMARY KEY,
  plugin_name TEXT NOT NULL,
  version TEXT NOT NULL,
  rollout_percentage INT NOT NULL DEFAULT 0,
  rollout_strategy TEXT NOT NULL DEFAULT 'random', -- 'random' | 'geo' | 'merchant_tier'
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'paused' | 'completed' | 'rolled_back'
  target_countries TEXT[], -- Pour stratégie 'geo': ['US', 'FR', 'SN']
  target_tiers TEXT[], -- Pour stratégie 'merchant_tier': ['enterprise', 'pro']
  sira_monitoring BOOLEAN DEFAULT TRUE,
  error_threshold NUMERIC(5,4) DEFAULT 0.03, -- 3% d'erreurs max
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB
);

CREATE INDEX idx_plugin_rollouts_status ON plugin_rollouts(plugin_name, status);
CREATE INDEX idx_plugin_rollouts_active ON plugin_rollouts(status) WHERE status = 'active';

-- Extension de plugin_rollback_history pour tracker déclencheur Sira
ALTER TABLE plugin_rollback_history
  ADD COLUMN IF NOT EXISTS sira_triggered BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS error_rate_detected NUMERIC(5,4);

-- Vue: Rollouts actifs avec métriques
CREATE OR REPLACE VIEW v_active_rollouts AS
SELECT
  r.id,
  r.plugin_name,
  r.version,
  r.rollout_percentage,
  r.rollout_strategy,
  r.status,
  r.created_at,
  COUNT(DISTINCT ul.merchant_id) as merchants_upgraded,
  AVG(CASE WHEN ul.status = 'failed' THEN 1 ELSE 0 END) as error_rate
FROM plugin_rollouts r
LEFT JOIN plugin_upgrade_logs ul ON r.plugin_name = ul.plugin_name AND r.version = ul.to_version
WHERE r.status IN ('active', 'paused')
GROUP BY r.id;

-- Fonction: Déterminer si un marchand doit recevoir l'upgrade
CREATE OR REPLACE FUNCTION should_merchant_upgrade(
  p_merchant_id UUID,
  p_plugin_name TEXT,
  p_merchant_country TEXT DEFAULT NULL,
  p_merchant_tier TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_rollout RECORD;
  v_random_val INT;
BEGIN
  -- Récupérer le rollout actif
  SELECT * INTO v_rollout
  FROM plugin_rollouts
  WHERE plugin_name = p_plugin_name
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  -- Pas de rollout actif
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Générer valeur aléatoire déterministe basée sur merchant_id
  v_random_val := (hashtext(p_merchant_id::text) % 100) + 1;

  -- Stratégie random
  IF v_rollout.rollout_strategy = 'random' THEN
    RETURN v_random_val <= v_rollout.rollout_percentage;
  END IF;

  -- Stratégie geo
  IF v_rollout.rollout_strategy = 'geo' THEN
    IF p_merchant_country IS NULL THEN
      RETURN FALSE;
    END IF;

    IF v_rollout.target_countries IS NOT NULL AND
       p_merchant_country = ANY(v_rollout.target_countries) THEN
      RETURN v_random_val <= v_rollout.rollout_percentage;
    END IF;

    RETURN FALSE;
  END IF;

  -- Stratégie merchant_tier
  IF v_rollout.rollout_strategy = 'merchant_tier' THEN
    IF p_merchant_tier IS NULL THEN
      RETURN FALSE;
    END IF;

    IF v_rollout.target_tiers IS NOT NULL AND
       p_merchant_tier = ANY(v_rollout.target_tiers) THEN
      RETURN v_random_val <= v_rollout.rollout_percentage;
    END IF;

    -- Fallback to random pour les autres tiers
    RETURN v_random_val <= v_rollout.rollout_percentage;
  END IF;

  -- Default
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Fonction: Calculer le taux d'erreur d'un rollout
CREATE OR REPLACE FUNCTION get_rollout_error_rate(p_rollout_id INT)
RETURNS NUMERIC AS $$
DECLARE
  v_error_rate NUMERIC;
BEGIN
  SELECT
    COALESCE(
      AVG(CASE WHEN ul.status = 'failed' THEN 1.0 ELSE 0.0 END),
      0
    ) INTO v_error_rate
  FROM plugin_rollouts r
  JOIN plugin_upgrade_logs ul ON r.plugin_name = ul.plugin_name AND r.version = ul.to_version
  WHERE r.id = p_rollout_id
    AND ul.created_at >= r.created_at;

  RETURN v_error_rate;
END;
$$ LANGUAGE plpgsql;

-- Fonction: Auto-pause rollout si taux d'erreur dépasse seuil
CREATE OR REPLACE FUNCTION auto_pause_failing_rollouts()
RETURNS INT AS $$
DECLARE
  v_rollout RECORD;
  v_error_rate NUMERIC;
  v_paused_count INT := 0;
BEGIN
  FOR v_rollout IN
    SELECT * FROM plugin_rollouts WHERE status = 'active' AND sira_monitoring = TRUE
  LOOP
    v_error_rate := get_rollout_error_rate(v_rollout.id);

    IF v_error_rate > v_rollout.error_threshold THEN
      -- Pause le rollout
      UPDATE plugin_rollouts
      SET status = 'paused',
          updated_at = now(),
          metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{auto_paused_reason}',
            to_jsonb('Error rate ' || v_error_rate::text || ' exceeded threshold ' || v_rollout.error_threshold::text)
          )
      WHERE id = v_rollout.id;

      v_paused_count := v_paused_count + 1;

      -- Log dans rollback_history (indication pour Sira)
      INSERT INTO plugin_rollback_history (
        merchant_id,
        plugin_name,
        from_version,
        to_version,
        rollback_trigger,
        rollback_reason,
        success,
        sira_triggered,
        error_rate_detected
      ) VALUES (
        gen_random_uuid(), -- Placeholder, pas spécifique à un marchand
        v_rollout.plugin_name,
        v_rollout.version,
        '(auto-paused)',
        'automatic',
        'Rollout paused: error rate exceeded threshold',
        TRUE,
        TRUE,
        v_error_rate
      );
    END IF;
  END LOOP;

  RETURN v_paused_count;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update updated_at
CREATE OR REPLACE FUNCTION update_rollout_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_rollout_timestamp
BEFORE UPDATE ON plugin_rollouts
FOR EACH ROW
EXECUTE FUNCTION update_rollout_timestamp();

COMMENT ON TABLE plugin_rollouts IS 'Tracks progressive plugin rollouts with canary release strategy';
COMMENT ON FUNCTION should_merchant_upgrade IS 'Determines if a merchant should receive an upgrade based on rollout strategy';
COMMENT ON FUNCTION get_rollout_error_rate IS 'Calculates error rate for a specific rollout';
COMMENT ON FUNCTION auto_pause_failing_rollouts IS 'Automatically pauses rollouts that exceed error threshold (Sira integration)';
