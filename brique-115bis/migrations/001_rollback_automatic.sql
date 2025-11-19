-- =====================================================================
-- Sous-Brique 115bis: Rollback Automatique & Safe Upgrade
-- =====================================================================
-- Extension de plugin_upgrade_logs pour supporter les rollbacks
-- =====================================================================

-- Extend plugin_upgrade_logs table with rollback columns
ALTER TABLE plugin_upgrade_logs
  ADD COLUMN IF NOT EXISTS rollback_version TEXT,
  ADD COLUMN IF NOT EXISTS rollback_status TEXT, -- 'success' | 'failed' | 'not_required'
  ADD COLUMN IF NOT EXISTS rollback_triggered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rollback_reason TEXT;

-- Add index for rollback queries
CREATE INDEX IF NOT EXISTS idx_plugin_upgrade_logs_rollback
  ON plugin_upgrade_logs(merchant_id, plugin_name, rollback_status)
  WHERE rollback_status IS NOT NULL;

-- Create plugin_backups table to track backup operations
CREATE TABLE IF NOT EXISTS plugin_backups (
  backup_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  plugin_name TEXT NOT NULL,
  version TEXT NOT NULL,
  backup_path TEXT NOT NULL,
  db_snapshot_name TEXT,
  backup_size_bytes BIGINT,
  backup_status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'completed' | 'failed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  metadata JSONB
);

CREATE INDEX idx_plugin_backups_merchant
  ON plugin_backups(merchant_id, created_at DESC);

CREATE INDEX idx_plugin_backups_expires
  ON plugin_backups(expires_at)
  WHERE backup_status = 'completed';

-- Create rollback_history table for detailed rollback tracking
CREATE TABLE IF NOT EXISTS plugin_rollback_history (
  rollback_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  plugin_name TEXT NOT NULL,
  from_version TEXT NOT NULL,
  to_version TEXT NOT NULL,
  rollback_trigger TEXT NOT NULL, -- 'automatic' | 'manual' | 'operator_forced'
  rollback_reason TEXT,
  backup_used UUID REFERENCES plugin_backups(backup_id),
  success BOOLEAN NOT NULL,
  error_message TEXT,
  duration_ms INT,
  files_restored INT,
  db_restored BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB
);

CREATE INDEX idx_rollback_history_merchant
  ON plugin_rollback_history(merchant_id, created_at DESC);

CREATE INDEX idx_rollback_history_success
  ON plugin_rollback_history(success, created_at DESC);

-- View: Recent rollbacks summary
CREATE OR REPLACE VIEW v_recent_rollbacks AS
SELECT
  rh.rollback_id,
  rh.merchant_id,
  rh.plugin_name,
  rh.from_version,
  rh.to_version,
  rh.rollback_trigger,
  rh.success,
  rh.duration_ms,
  rh.created_at,
  pb.backup_path,
  pb.backup_size_bytes
FROM plugin_rollback_history rh
LEFT JOIN plugin_backups pb ON rh.backup_used = pb.backup_id
WHERE rh.created_at >= now() - INTERVAL '7 days'
ORDER BY rh.created_at DESC;

-- View: Rollback success rate by plugin
CREATE OR REPLACE VIEW v_rollback_success_rate AS
SELECT
  plugin_name,
  COUNT(*) as total_rollbacks,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_rollbacks,
  ROUND(100.0 * SUM(CASE WHEN success THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate_pct,
  AVG(duration_ms) as avg_duration_ms
FROM plugin_rollback_history
WHERE created_at >= now() - INTERVAL '30 days'
GROUP BY plugin_name
ORDER BY total_rollbacks DESC;

-- Function: Get latest backup for plugin
CREATE OR REPLACE FUNCTION get_latest_backup(
  p_merchant_id UUID,
  p_plugin_name TEXT,
  p_version TEXT
)
RETURNS UUID AS $$
DECLARE
  v_backup_id UUID;
BEGIN
  SELECT backup_id INTO v_backup_id
  FROM plugin_backups
  WHERE merchant_id = p_merchant_id
    AND plugin_name = p_plugin_name
    AND version = p_version
    AND backup_status = 'completed'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN v_backup_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Record rollback attempt
CREATE OR REPLACE FUNCTION record_rollback_attempt(
  p_merchant_id UUID,
  p_plugin_name TEXT,
  p_from_version TEXT,
  p_to_version TEXT,
  p_trigger TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_rollback_id UUID;
  v_backup_id UUID;
BEGIN
  -- Get latest backup
  v_backup_id := get_latest_backup(p_merchant_id, p_plugin_name, p_to_version);

  -- Create rollback record
  INSERT INTO plugin_rollback_history (
    merchant_id,
    plugin_name,
    from_version,
    to_version,
    rollback_trigger,
    rollback_reason,
    backup_used,
    success
  ) VALUES (
    p_merchant_id,
    p_plugin_name,
    p_from_version,
    p_to_version,
    p_trigger,
    p_reason,
    v_backup_id,
    FALSE -- Will be updated on success
  ) RETURNING rollback_id INTO v_rollback_id;

  RETURN v_rollback_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Mark rollback as completed
CREATE OR REPLACE FUNCTION complete_rollback(
  p_rollback_id UUID,
  p_success BOOLEAN,
  p_error_message TEXT DEFAULT NULL,
  p_duration_ms INT DEFAULT NULL,
  p_files_restored INT DEFAULT NULL,
  p_db_restored BOOLEAN DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  UPDATE plugin_rollback_history
  SET
    success = p_success,
    error_message = p_error_message,
    duration_ms = p_duration_ms,
    files_restored = p_files_restored,
    db_restored = p_db_restored,
    completed_at = now()
  WHERE rollback_id = p_rollback_id;

  -- Update upgrade log if exists
  UPDATE plugin_upgrade_logs
  SET
    rollback_status = CASE WHEN p_success THEN 'success' ELSE 'failed' END,
    rollback_triggered_at = now(),
    rollback_version = (
      SELECT to_version FROM plugin_rollback_history WHERE rollback_id = p_rollback_id
    ),
    rollback_reason = p_error_message
  WHERE merchant_id = (SELECT merchant_id FROM plugin_rollback_history WHERE rollback_id = p_rollback_id)
    AND plugin_name = (SELECT plugin_name FROM plugin_rollback_history WHERE rollback_id = p_rollback_id)
  ORDER BY created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function: Cleanup old backups
CREATE OR REPLACE FUNCTION cleanup_expired_backups()
RETURNS INT AS $$
DECLARE
  v_deleted_count INT;
BEGIN
  DELETE FROM plugin_backups
  WHERE expires_at < now()
    AND backup_status = 'completed';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update upgrade log on rollback
CREATE OR REPLACE FUNCTION update_upgrade_log_on_rollback()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.success = TRUE AND OLD.success = FALSE THEN
    UPDATE plugin_upgrade_logs
    SET
      rollback_status = 'success',
      rollback_triggered_at = NEW.completed_at,
      rollback_version = NEW.to_version
    WHERE merchant_id = NEW.merchant_id
      AND plugin_name = NEW.plugin_name
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_upgrade_log_on_rollback
AFTER UPDATE ON plugin_rollback_history
FOR EACH ROW
WHEN (NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL)
EXECUTE FUNCTION update_upgrade_log_on_rollback();

-- Sample data for testing
INSERT INTO plugin_backups (merchant_id, plugin_name, version, backup_path, backup_status)
VALUES
  (gen_random_uuid(), 'woocommerce', '3.9.0', '/backups/woocommerce-3.9.0.zip', 'completed'),
  (gen_random_uuid(), 'prestashop', '1.7.8', '/backups/prestashop-1.7.8.zip', 'completed')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE plugin_backups IS 'Stores plugin backup metadata for rollback operations';
COMMENT ON TABLE plugin_rollback_history IS 'Detailed history of all plugin rollback attempts';
COMMENT ON COLUMN plugin_upgrade_logs.rollback_status IS 'Status of rollback: success, failed, or not_required';
COMMENT ON FUNCTION get_latest_backup IS 'Retrieves the most recent valid backup for a plugin version';
COMMENT ON FUNCTION record_rollback_attempt IS 'Creates a new rollback record and returns its ID';
COMMENT ON FUNCTION complete_rollback IS 'Marks a rollback as completed with success/failure status';
