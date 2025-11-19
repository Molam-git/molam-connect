-- Brique 115: Versioning & Migration Strategy for Plugin (Backwards Compat)
-- Migration: 001_plugin_versioning_migration.sql
-- Description: Tables pour registry des versions, upgrade logs, compatibilité

-- ============================================================================
-- 1. Plugin Versions Registry - Registry centralisé des versions
-- ============================================================================
CREATE TABLE IF NOT EXISTS plugin_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- Plugin names: 'woocommerce', 'prestashop', 'shopify', 'magento', 
  --               'sdk-php', 'sdk-node', 'sdk-python'
  
  version TEXT NOT NULL,
  -- Semantic versioning: '1.2.3', '2.0.0-beta.1'
  
  api_min_version TEXT NOT NULL,
  -- Minimum API version required (format: 'YYYY-MM' or semver)
  -- Exemple: '2025-01', '1.0.0'
  
  api_max_version TEXT NOT NULL,
  -- Maximum API version supported (format: 'YYYY-MM' or semver)
  -- Exemple: '2026-01', '2.0.0'
  
  checksum TEXT NOT NULL,
  -- SHA-256 checksum of plugin package for integrity verification
  -- Format: 'sha256-abcdef123456...'
  
  build_date TIMESTAMPTZ NOT NULL,
  release_notes TEXT,
  -- Markdown release notes
  
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'blocked', 'beta', 'rc')),
  -- active: Available for installation/upgrade
  -- deprecated: Still works but not recommended
  -- blocked: Security issue, must upgrade
  -- beta/rc: Pre-release versions
  
  -- Compatibility metadata
  backwards_compatible BOOLEAN DEFAULT true,
  -- If false, requires manual migration
  
  migration_required BOOLEAN DEFAULT false,
  -- If true, requires migration scripts
  
  -- Download info
  download_url TEXT,
  package_size_bytes INTEGER,
  
  -- Security
  security_advisory TEXT,
  -- Security notes (CVE, vulnerabilities)
  
  -- Ops control
  auto_update_enabled BOOLEAN DEFAULT true,
  -- Whether auto-update is allowed for this version
  
  grace_period_days INTEGER DEFAULT 30,
  -- Days before forced upgrade (if status = deprecated/blocked)
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(name, version)
);

CREATE INDEX idx_plugin_versions_name ON plugin_versions(name);
CREATE INDEX idx_plugin_versions_status ON plugin_versions(status);
CREATE INDEX idx_plugin_versions_created_at ON plugin_versions(created_at DESC);

-- ============================================================================
-- 2. Plugin Upgrade Logs - Historique des upgrades
-- ============================================================================
CREATE TABLE IF NOT EXISTS plugin_upgrade_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  plugin_name TEXT NOT NULL,
  
  from_version TEXT NOT NULL,
  to_version TEXT NOT NULL,
  
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'rollback', 'in_progress', 'cancelled')),
  
  -- Execution details
  details JSONB DEFAULT '{}',
  -- {
  --   "migrations_applied": ["1.1.0", "1.2.0"],
  --   "migration_errors": [],
  --   "backup_created": true,
  --   "rollback_reason": "...",
  --   "duration_ms": 1234
  -- }
  
  -- Migration metadata
  migrations_applied JSONB DEFAULT '[]',
  -- List of migration scripts executed
  
  error_message TEXT,
  error_stack TEXT,
  
  -- Rollback info
  rolled_back_at TIMESTAMPTZ,
  rollback_reason TEXT,
  
  -- Execution context
  executed_by TEXT DEFAULT 'auto',
  -- 'auto', 'manual', 'ops', or user UUID
  
  execution_method TEXT DEFAULT 'auto_update',
  -- 'auto_update', 'manual', 'ops_forced'
  
  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plugin_upgrade_logs_merchant_id ON plugin_upgrade_logs(merchant_id);
CREATE INDEX idx_plugin_upgrade_logs_plugin_name ON plugin_upgrade_logs(plugin_name);
CREATE INDEX idx_plugin_upgrade_logs_status ON plugin_upgrade_logs(status);
CREATE INDEX idx_plugin_upgrade_logs_created_at ON plugin_upgrade_logs(created_at DESC);

-- ============================================================================
-- 3. Plugin Compatibility Matrix - Matrice de compatibilité
-- ============================================================================
CREATE TABLE IF NOT EXISTS plugin_compatibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_name TEXT NOT NULL,
  plugin_version TEXT NOT NULL,
  
  api_version TEXT NOT NULL,
  -- API version (format: 'YYYY-MM' or semver)
  
  molam_id_version TEXT,
  -- Required Molam ID version (if applicable)
  
  compatible BOOLEAN NOT NULL DEFAULT true,
  -- Whether this plugin version is compatible with this API version
  
  notes TEXT,
  -- Compatibility notes, known issues
  
  tested_at TIMESTAMPTZ,
  -- When compatibility was tested
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(plugin_name, plugin_version, api_version)
);

CREATE INDEX idx_plugin_compatibility_plugin ON plugin_compatibility(plugin_name, plugin_version);
CREATE INDEX idx_plugin_compatibility_api ON plugin_compatibility(api_version);

-- ============================================================================
-- 4. Migration Scripts Registry - Registry des scripts de migration
-- ============================================================================
CREATE TABLE IF NOT EXISTS plugin_migration_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_name TEXT NOT NULL,
  from_version TEXT NOT NULL,
  to_version TEXT NOT NULL,
  
  script_type TEXT NOT NULL CHECK (script_type IN ('sql', 'php', 'javascript', 'python', 'config')),
  -- Type of migration script
  
  script_content TEXT,
  -- Script content (for small scripts) or reference to file
  
  script_url TEXT,
  -- URL to script file (for large scripts)
  
  checksum TEXT,
  -- SHA-256 of script for verification
  
  -- Execution metadata
  idempotent BOOLEAN DEFAULT true,
  -- Whether script can be run multiple times safely
  
  rollback_script TEXT,
  -- Rollback script content or URL
  
  -- Requirements
  requires_backup BOOLEAN DEFAULT false,
  -- Whether backup is required before execution
  
  estimated_duration_ms INTEGER,
  -- Estimated execution time
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'tested', 'untested')),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(plugin_name, from_version, to_version)
);

CREATE INDEX idx_plugin_migration_scripts_plugin ON plugin_migration_scripts(plugin_name);
CREATE INDEX idx_plugin_migration_scripts_versions ON plugin_migration_scripts(from_version, to_version);

-- ============================================================================
-- 5. Ops Policy - Configuration globale pour versioning
-- ============================================================================
CREATE TABLE IF NOT EXISTS plugin_versioning_policy (
  id INT PRIMARY KEY DEFAULT 1,
  CHECK (id = 1), -- Single row table
  
  -- Auto-update settings
  auto_update_enabled BOOLEAN DEFAULT true,
  auto_update_whitelist JSONB DEFAULT '[]',
  -- Merchant IDs allowed for auto-update (empty = all)
  
  -- Version control
  min_supported_version_days INTEGER DEFAULT 90,
  -- Minimum days to support old versions
  
  force_upgrade_days INTEGER DEFAULT 30,
  -- Days after deprecation before forced upgrade
  
  -- Compatibility
  strict_compatibility_check BOOLEAN DEFAULT true,
  -- Whether to enforce strict API version compatibility
  
  -- Grace periods
  deprecated_grace_period_days INTEGER DEFAULT 30,
  blocked_grace_period_days INTEGER DEFAULT 7,
  
  -- Notifications
  notify_on_deprecation BOOLEAN DEFAULT true,
  notify_on_block BOOLEAN DEFAULT true,
  notify_before_force_upgrade BOOLEAN DEFAULT true,
  notify_days_before INTEGER DEFAULT 7,
  
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID
);

-- Insert default policy
INSERT INTO plugin_versioning_policy (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 6. Fonctions utilitaires
-- ============================================================================

-- Trigger pour updated_at
CREATE TRIGGER update_plugin_versions_updated_at
  BEFORE UPDATE ON plugin_versions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plugin_migration_scripts_updated_at
  BEFORE UPDATE ON plugin_migration_scripts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Fonction pour vérifier la compatibilité version
CREATE OR REPLACE FUNCTION check_version_compatibility(
  p_plugin_name TEXT,
  p_plugin_version TEXT,
  p_api_version TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  plugin_rec RECORD;
  compat_rec RECORD;
BEGIN
  -- Get plugin version info
  SELECT * INTO plugin_rec
  FROM plugin_versions
  WHERE name = p_plugin_name AND version = p_plugin_version;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Check if plugin version is active
  IF plugin_rec.status IN ('blocked', 'deprecated') THEN
    RETURN false;
  END IF;
  
  -- Check API version range
  IF p_api_version < plugin_rec.api_min_version OR p_api_version > plugin_rec.api_max_version THEN
    RETURN false;
  END IF;
  
  -- Check compatibility matrix
  SELECT * INTO compat_rec
  FROM plugin_compatibility
  WHERE plugin_name = p_plugin_name
    AND plugin_version = p_plugin_version
    AND api_version = p_api_version;
  
  IF FOUND AND NOT compat_rec.compatible THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour obtenir la dernière version disponible
CREATE OR REPLACE FUNCTION get_latest_plugin_version(
  p_plugin_name TEXT,
  p_include_beta BOOLEAN DEFAULT false
)
RETURNS TABLE (
  version TEXT,
  api_min_version TEXT,
  api_max_version TEXT,
  checksum TEXT,
  status TEXT,
  release_notes TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pv.version,
    pv.api_min_version,
    pv.api_max_version,
    pv.checksum,
    pv.status,
    pv.release_notes
  FROM plugin_versions pv
  WHERE pv.name = p_plugin_name
    AND pv.status IN ('active', CASE WHEN p_include_beta THEN 'beta' ELSE NULL END)
  ORDER BY 
    -- Sort by semantic version (simplified)
    string_to_array(pv.version, '.')::int[] DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour obtenir les migrations nécessaires
CREATE OR REPLACE FUNCTION get_required_migrations(
  p_plugin_name TEXT,
  p_from_version TEXT,
  p_to_version TEXT
)
RETURNS TABLE (
  from_version TEXT,
  to_version TEXT,
  script_type TEXT,
  script_url TEXT,
  requires_backup BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pms.from_version,
    pms.to_version,
    pms.script_type,
    pms.script_url,
    pms.requires_backup
  FROM plugin_migration_scripts pms
  WHERE pms.plugin_name = p_plugin_name
    AND pms.status = 'active'
    AND (
      -- Direct migration
      (pms.from_version = p_from_version AND pms.to_version = p_to_version)
      OR
      -- Intermediate migrations (simplified - would need proper version comparison)
      (pms.from_version >= p_from_version AND pms.to_version <= p_to_version)
    )
  ORDER BY pms.from_version, pms.to_version;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. Vues utiles
-- ============================================================================

-- Vue pour les plugins avec statistiques d'upgrade
CREATE OR REPLACE VIEW plugin_version_stats AS
SELECT 
  pv.name,
  pv.version,
  pv.status,
  COUNT(DISTINCT pul.merchant_id) FILTER (WHERE pul.status = 'success') as successful_upgrades,
  COUNT(DISTINCT pul.merchant_id) FILTER (WHERE pul.status = 'failed') as failed_upgrades,
  COUNT(DISTINCT pul.merchant_id) FILTER (WHERE pul.status = 'rollback') as rollbacks,
  AVG(pul.duration_ms) FILTER (WHERE pul.status = 'success') as avg_duration_ms
FROM plugin_versions pv
LEFT JOIN plugin_upgrade_logs pul ON pul.plugin_name = pv.name AND pul.to_version = pv.version
GROUP BY pv.id, pv.name, pv.version, pv.status;

-- Vue pour les merchants avec versions installées
CREATE OR REPLACE VIEW merchant_plugin_versions AS
SELECT 
  mp.merchant_id,
  mp.cms as plugin_name,
  mp.plugin_version as current_version,
  pv.status as version_status,
  pv.api_min_version,
  pv.api_max_version,
  (SELECT version FROM get_latest_plugin_version(mp.cms)) as latest_version,
  CASE 
    WHEN (SELECT version FROM get_latest_plugin_version(mp.cms)) > mp.plugin_version 
    THEN true 
    ELSE false 
  END as update_available
FROM merchant_plugins mp
LEFT JOIN plugin_versions pv ON pv.name = mp.cms AND pv.version = mp.plugin_version;

COMMENT ON TABLE plugin_versions IS 'Registry centralisé des versions de plugins';
COMMENT ON TABLE plugin_upgrade_logs IS 'Historique des upgrades avec détails d''exécution';
COMMENT ON TABLE plugin_compatibility IS 'Matrice de compatibilité plugin ↔ API';
COMMENT ON TABLE plugin_migration_scripts IS 'Registry des scripts de migration';
COMMENT ON TABLE plugin_versioning_policy IS 'Configuration globale pour versioning (single row)';

