-- Brique 111: Merchant Config UI (Plugin Settings & Webhooks)
-- Migration: 001_merchant_config.sql
-- Description: Schéma complet pour la gestion des plugins marchands, webhooks, mises à jour et audit

-- ============================================================================
-- 1. Plugins installés par marchand
-- ============================================================================
CREATE TABLE IF NOT EXISTS merchant_plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  cms TEXT NOT NULL CHECK (cms IN ('woocommerce', 'shopify', 'magento', 'prestashop', 'wix', 'node', 'php', 'python')),
  plugin_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'error', 'pending_update', 'blocked')),
  
  -- Configuration
  settings JSONB NOT NULL DEFAULT '{}',
  -- Exemple settings:
  -- {
  --   "mode": "production|test",
  --   "api_key": "sk_live_xxx",
  --   "branding": { "logo": "url", "colors": {...} },
  --   "languages": ["fr", "en"],
  --   "currencies": ["XOF", "EUR"],
  --   "sales_zones": ["SN", "ML"]
  -- }
  
  -- Télémetry
  telemetry JSONB NOT NULL DEFAULT '{}',
  -- Exemple telemetry:
  -- {
  --   "last_heartbeat": "2025-01-18T10:00:00Z",
  --   "error_rate": 0.5,
  --   "incidents": [...],
  --   "auto_fixes": [...]
  -- }
  
  last_heartbeat TIMESTAMPTZ,
  error_count_24h INTEGER DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(merchant_id, cms)
);

CREATE INDEX idx_merchant_plugins_merchant_id ON merchant_plugins(merchant_id);
CREATE INDEX idx_merchant_plugins_status ON merchant_plugins(status);
CREATE INDEX idx_merchant_plugins_cms ON merchant_plugins(cms);
CREATE INDEX idx_merchant_plugins_last_heartbeat ON merchant_plugins(last_heartbeat);

-- ============================================================================
-- 2. Paramètres webhooks
-- ============================================================================
CREATE TABLE IF NOT EXISTS merchant_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  -- Exemples: 'payment.succeeded', 'payment.failed', 'refund.issued', 'charge.disputed'
  url TEXT NOT NULL,
  secret BYTEA NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'error')),
  
  -- Monitoring
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  failure_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER,
  
  -- Auto-config & failover
  auto_configured BOOLEAN DEFAULT false,
  failover_url TEXT,
  retry_config JSONB DEFAULT '{"max_retries": 3, "backoff": "exponential"}',
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(merchant_id, event_type, url)
);

CREATE INDEX idx_merchant_webhooks_merchant_id ON merchant_webhooks(merchant_id);
CREATE INDEX idx_merchant_webhooks_status ON merchant_webhooks(status);
CREATE INDEX idx_merchant_webhooks_event_type ON merchant_webhooks(event_type);

-- ============================================================================
-- 3. Historique de mises à jour
-- ============================================================================
CREATE TABLE IF NOT EXISTS plugin_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_plugin_id UUID NOT NULL REFERENCES merchant_plugins(id) ON DELETE CASCADE,
  old_version TEXT,
  new_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'success', 'failed', 'rolled_back')),
  
  -- Logs détaillés
  logs JSONB DEFAULT '[]',
  -- Exemple logs:
  -- [
  --   {"timestamp": "...", "level": "info", "message": "Starting update..."},
  --   {"timestamp": "...", "level": "error", "message": "Failed to download"}
  -- ]
  
  error_message TEXT,
  rollback_reason TEXT,
  
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_plugin_updates_merchant_plugin_id ON plugin_updates(merchant_plugin_id);
CREATE INDEX idx_plugin_updates_status ON plugin_updates(status);
CREATE INDEX idx_plugin_updates_created_at ON plugin_updates(created_at DESC);

-- ============================================================================
-- 4. Audit immuable
-- ============================================================================
CREATE TABLE IF NOT EXISTS plugin_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  merchant_plugin_id UUID REFERENCES merchant_plugins(id) ON DELETE SET NULL,
  actor_id UUID, -- User ID qui a effectué l'action
  actor_type TEXT CHECK (actor_type IN ('merchant', 'ops', 'sira', 'system')),
  action TEXT NOT NULL,
  -- Exemples: 'plugin.installed', 'plugin.updated', 'plugin.rolled_back',
  --           'webhook.created', 'webhook.deleted', 'settings.updated',
  --           'sira.auto_fix', 'sira.auto_rollback'
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_plugin_audit_merchant_id ON plugin_audit(merchant_id);
CREATE INDEX idx_plugin_audit_merchant_plugin_id ON plugin_audit(merchant_plugin_id);
CREATE INDEX idx_plugin_audit_action ON plugin_audit(action);
CREATE INDEX idx_plugin_audit_created_at ON plugin_audit(created_at DESC);

-- ============================================================================
-- 5. Self-Healing: Détections Sira
-- ============================================================================
CREATE TABLE IF NOT EXISTS sira_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_plugin_id UUID NOT NULL REFERENCES merchant_plugins(id) ON DELETE CASCADE,
  detection_type TEXT NOT NULL,
  -- Exemples: 'invalid_api_key', 'corrupted_plugin', 'webhook_failure_pattern',
  --           'config_mismatch', 'version_incompatibility'
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,
  detected_at TIMESTAMPTZ DEFAULT now(),
  
  -- Auto-fix
  auto_fixed BOOLEAN DEFAULT false,
  fix_applied_at TIMESTAMPTZ,
  fix_method TEXT,
  -- Exemples: 'auto_patch', 'auto_rollback', 'config_correction', 'key_regeneration'
  fix_details JSONB DEFAULT '{}',
  
  -- Notification
  merchant_notified BOOLEAN DEFAULT false,
  merchant_notified_at TIMESTAMPTZ,
  
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sira_detections_merchant_plugin_id ON sira_detections(merchant_plugin_id);
CREATE INDEX idx_sira_detections_detection_type ON sira_detections(detection_type);
CREATE INDEX idx_sira_detections_severity ON sira_detections(severity);
CREATE INDEX idx_sira_detections_auto_fixed ON sira_detections(auto_fixed);
CREATE INDEX idx_sira_detections_detected_at ON sira_detections(detected_at DESC);

-- ============================================================================
-- 6. Fonctions utilitaires
-- ============================================================================

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers pour updated_at
CREATE TRIGGER update_merchant_plugins_updated_at
  BEFORE UPDATE ON merchant_plugins
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_merchant_webhooks_updated_at
  BEFORE UPDATE ON merchant_webhooks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plugin_updates_updated_at
  BEFORE UPDATE ON plugin_updates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Fonction pour logger les actions dans l'audit
CREATE OR REPLACE FUNCTION log_plugin_audit(
  p_merchant_id UUID,
  p_merchant_plugin_id UUID DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_actor_type TEXT DEFAULT 'system',
  p_action TEXT,
  p_details JSONB DEFAULT '{}',
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  audit_id UUID;
BEGIN
  INSERT INTO plugin_audit (
    merchant_id, merchant_plugin_id, actor_id, actor_type,
    action, details, ip_address, user_agent
  ) VALUES (
    p_merchant_id, p_merchant_plugin_id, p_actor_id, p_actor_type,
    p_action, p_details, p_ip_address, p_user_agent
  ) RETURNING id INTO audit_id;
  
  RETURN audit_id;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour calculer le taux d'erreur d'un plugin
CREATE OR REPLACE FUNCTION get_plugin_error_rate(p_plugin_id UUID, p_hours INTEGER DEFAULT 24)
RETURNS NUMERIC AS $$
DECLARE
  error_rate NUMERIC;
BEGIN
  SELECT COALESCE(
    (error_count_24h::NUMERIC / NULLIF(EXTRACT(EPOCH FROM (now() - last_heartbeat)) / 3600, 0)),
    0
  ) INTO error_rate
  FROM merchant_plugins
  WHERE id = p_plugin_id;
  
  RETURN COALESCE(error_rate, 0);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. Vues utiles
-- ============================================================================

-- Vue pour les plugins avec statistiques
CREATE OR REPLACE VIEW merchant_plugins_stats AS
SELECT 
  mp.*,
  COUNT(DISTINCT mw.id) as webhook_count,
  COUNT(DISTINCT pu.id) FILTER (WHERE pu.status = 'pending') as pending_updates,
  COUNT(DISTINCT sd.id) FILTER (WHERE sd.auto_fixed = false) as active_detections,
  get_plugin_error_rate(mp.id) as error_rate
FROM merchant_plugins mp
LEFT JOIN merchant_webhooks mw ON mw.merchant_id = mp.merchant_id
LEFT JOIN plugin_updates pu ON pu.merchant_plugin_id = mp.id
LEFT JOIN sira_detections sd ON sd.merchant_plugin_id = mp.id
GROUP BY mp.id;

-- Vue pour les webhooks avec monitoring
CREATE OR REPLACE VIEW merchant_webhooks_monitoring AS
SELECT 
  mw.*,
  CASE 
    WHEN mw.last_failure_at > mw.last_success_at THEN 'failing'
    WHEN mw.last_success_at IS NULL THEN 'never_successful'
    WHEN mw.last_success_at > now() - interval '1 hour' THEN 'healthy'
    ELSE 'stale'
  END as health_status,
  CASE 
    WHEN mw.failure_count > 10 THEN 'critical'
    WHEN mw.failure_count > 5 THEN 'warning'
    ELSE 'ok'
  END as alert_level
FROM merchant_webhooks mw;

-- ============================================================================
-- 8. Données de test (optionnel, commenté en production)
-- ============================================================================

-- INSERT INTO merchant_plugins (merchant_id, cms, plugin_version, status, settings)
-- VALUES 
--   ('00000000-0000-0000-0000-000000000001', 'woocommerce', '1.3.5', 'active', 
--    '{"mode": "production", "languages": ["fr", "en"], "currencies": ["XOF"]}');

COMMENT ON TABLE merchant_plugins IS 'Plugins installés par marchand avec configuration et télémetry';
COMMENT ON TABLE merchant_webhooks IS 'Configuration webhooks avec monitoring et failover';
COMMENT ON TABLE plugin_updates IS 'Historique des mises à jour avec rollback capability';
COMMENT ON TABLE plugin_audit IS 'Audit trail immuable de toutes les actions';
COMMENT ON TABLE sira_detections IS 'Détections Sira de problèmes et auto-fixes appliqués';


