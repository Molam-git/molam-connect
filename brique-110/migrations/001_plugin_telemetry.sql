-- =====================================================================
-- Brique 110: Plugin Telemetry & Upgrade Notifications
-- =====================================================================
-- Industrial-grade plugin monitoring, version tracking, upgrade
-- notifications, and Ops control toggles for all Molam Form plugins
-- =====================================================================

-- Plugin Installations - Track all installed plugins
CREATE TABLE IF NOT EXISTS plugin_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  cms TEXT NOT NULL, -- 'woocommerce', 'prestashop', 'shopify', 'magento', 'noncms'
  plugin_version TEXT NOT NULL,
  sdk_language TEXT, -- 'node', 'php', 'python', 'ruby'
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT DEFAULT 'active', -- 'active', 'outdated', 'blocked', 'error'
  error_rate NUMERIC(5,2) DEFAULT 0.0 CHECK (error_rate >= 0 AND error_rate <= 100),
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  environment TEXT DEFAULT 'production', -- 'production', 'staging', 'development'
  php_version TEXT,
  wordpress_version TEXT,
  server_info JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_cms CHECK (cms IN ('woocommerce', 'prestashop', 'shopify', 'magento', 'noncms', 'custom')),
  CONSTRAINT valid_status CHECK (status IN ('active', 'outdated', 'blocked', 'error', 'deprecated')),
  CONSTRAINT valid_environment CHECK (environment IN ('production', 'staging', 'development', 'test'))
);

CREATE INDEX idx_plugin_installations_merchant ON plugin_installations(merchant_id);
CREATE INDEX idx_plugin_installations_cms ON plugin_installations(cms);
CREATE INDEX idx_plugin_installations_status ON plugin_installations(status);
CREATE INDEX idx_plugin_installations_heartbeat ON plugin_installations(last_heartbeat DESC);
CREATE INDEX idx_plugin_installations_error_rate ON plugin_installations(error_rate DESC);
CREATE UNIQUE INDEX idx_plugin_installations_merchant_cms ON plugin_installations(merchant_id, cms);

-- Plugin Upgrade Notifications - Track upgrade notifications sent to merchants
CREATE TABLE IF NOT EXISTS plugin_upgrade_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  plugin_id UUID NOT NULL REFERENCES plugin_installations(id) ON DELETE CASCADE,
  current_version TEXT NOT NULL,
  latest_version TEXT NOT NULL,
  upgrade_type TEXT NOT NULL, -- 'patch', 'minor', 'major', 'critical'
  upgrade_priority TEXT DEFAULT 'normal', -- 'low', 'normal', 'high', 'critical'
  release_notes TEXT,
  breaking_changes BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  upgraded_at TIMESTAMPTZ,
  channel TEXT DEFAULT 'email', -- 'email', 'in-app', 'webhook', 'sms'
  metadata JSONB DEFAULT '{}',

  CONSTRAINT valid_upgrade_type CHECK (upgrade_type IN ('patch', 'minor', 'major', 'critical', 'security')),
  CONSTRAINT valid_upgrade_priority CHECK (upgrade_priority IN ('low', 'normal', 'high', 'critical')),
  CONSTRAINT valid_channel CHECK (channel IN ('email', 'in-app', 'webhook', 'sms', 'slack'))
);

CREATE INDEX idx_plugin_upgrade_notifications_merchant ON plugin_upgrade_notifications(merchant_id);
CREATE INDEX idx_plugin_upgrade_notifications_plugin ON plugin_upgrade_notifications(plugin_id);
CREATE INDEX idx_plugin_upgrade_notifications_sent ON plugin_upgrade_notifications(sent_at DESC);
CREATE INDEX idx_plugin_upgrade_notifications_ack ON plugin_upgrade_notifications(acknowledged_at) WHERE acknowledged_at IS NULL;

-- Plugin Ops Toggles - Ops control switches for plugin management
CREATE TABLE IF NOT EXISTS plugin_ops_toggles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id UUID NOT NULL REFERENCES plugin_installations(id) ON DELETE CASCADE,
  toggle_key TEXT NOT NULL, -- 'force_update', 'block_plugin', 'enable_debug', 'rate_limit'
  toggle_value JSONB NOT NULL,
  reason TEXT,
  expires_at TIMESTAMPTZ,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plugin_ops_toggles_plugin ON plugin_ops_toggles(plugin_id);
CREATE INDEX idx_plugin_ops_toggles_key ON plugin_ops_toggles(toggle_key);
CREATE INDEX idx_plugin_ops_toggles_expires ON plugin_ops_toggles(expires_at) WHERE expires_at IS NOT NULL;
CREATE UNIQUE INDEX idx_plugin_ops_toggles_unique ON plugin_ops_toggles(plugin_id, toggle_key);

-- Plugin Telemetry Events - Detailed telemetry events from plugins
CREATE TABLE IF NOT EXISTS plugin_telemetry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id UUID NOT NULL REFERENCES plugin_installations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'payment_success', 'payment_failed', 'error', 'warning', 'info'
  event_data JSONB NOT NULL,
  severity TEXT DEFAULT 'info', -- 'debug', 'info', 'warning', 'error', 'critical'
  stack_trace TEXT,
  user_agent TEXT,
  ip_address TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plugin_telemetry_events_plugin ON plugin_telemetry_events(plugin_id);
CREATE INDEX idx_plugin_telemetry_events_type ON plugin_telemetry_events(event_type);
CREATE INDEX idx_plugin_telemetry_events_severity ON plugin_telemetry_events(severity);
CREATE INDEX idx_plugin_telemetry_events_recorded ON plugin_telemetry_events(recorded_at DESC);

-- Plugin Versions Registry - Official plugin versions
CREATE TABLE IF NOT EXISTS plugin_versions_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cms TEXT NOT NULL,
  version TEXT NOT NULL,
  release_date TIMESTAMPTZ NOT NULL,
  is_latest BOOLEAN DEFAULT false,
  is_deprecated BOOLEAN DEFAULT false,
  min_php_version TEXT,
  min_wordpress_version TEXT,
  changelog TEXT,
  download_url TEXT,
  checksum TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plugin_versions_registry_cms ON plugin_versions_registry(cms);
CREATE INDEX idx_plugin_versions_registry_version ON plugin_versions_registry(version);
CREATE INDEX idx_plugin_versions_registry_latest ON plugin_versions_registry(is_latest) WHERE is_latest = true;
CREATE UNIQUE INDEX idx_plugin_versions_registry_cms_version ON plugin_versions_registry(cms, version);

-- Plugin Health Metrics - Aggregated health metrics
CREATE TABLE IF NOT EXISTS plugin_health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id UUID NOT NULL REFERENCES plugin_installations(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_payments INTEGER DEFAULT 0,
  successful_payments INTEGER DEFAULT 0,
  failed_payments INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER,
  uptime_percentage NUMERIC(5,2),
  error_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plugin_health_metrics_plugin ON plugin_health_metrics(plugin_id);
CREATE INDEX idx_plugin_health_metrics_date ON plugin_health_metrics(metric_date DESC);
CREATE UNIQUE INDEX idx_plugin_health_metrics_plugin_date ON plugin_health_metrics(plugin_id, metric_date);

-- Ops Agents - Ops team members who can manage plugins
CREATE TABLE IF NOT EXISTS ops_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'operator', -- 'operator', 'admin', 'superadmin'
  permissions TEXT[] DEFAULT ARRAY['plugin:view'],
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ops_agents_email ON ops_agents(email);
CREATE INDEX idx_ops_agents_active ON ops_agents(is_active) WHERE is_active = true;

-- Comments
COMMENT ON TABLE plugin_installations IS 'Track all installed Molam Form plugins across merchants';
COMMENT ON TABLE plugin_upgrade_notifications IS 'Upgrade notifications sent to merchants';
COMMENT ON TABLE plugin_ops_toggles IS 'Ops control switches for plugin management';
COMMENT ON TABLE plugin_telemetry_events IS 'Detailed telemetry events from plugins';
COMMENT ON TABLE plugin_versions_registry IS 'Official plugin versions and metadata';
COMMENT ON TABLE plugin_health_metrics IS 'Aggregated daily health metrics per plugin';
COMMENT ON TABLE ops_agents IS 'Ops team members with plugin management permissions';

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_plugin_installations_updated_at BEFORE UPDATE ON plugin_installations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plugin_ops_toggles_updated_at BEFORE UPDATE ON plugin_ops_toggles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to check for outdated plugins
CREATE OR REPLACE FUNCTION mark_outdated_plugins()
RETURNS void AS $$
BEGIN
  UPDATE plugin_installations pi
  SET status = 'outdated'
  WHERE EXISTS (
    SELECT 1 FROM plugin_versions_registry pvr
    WHERE pvr.cms = pi.cms
      AND pvr.is_latest = true
      AND pvr.version != pi.plugin_version
  )
  AND status = 'active';
END;
$$ LANGUAGE plpgsql;

-- Function to calculate error rate
CREATE OR REPLACE FUNCTION calculate_plugin_error_rate(p_plugin_id UUID, p_hours INTEGER DEFAULT 24)
RETURNS NUMERIC AS $$
DECLARE
  v_total_events INTEGER;
  v_error_events INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_events
  FROM plugin_telemetry_events
  WHERE plugin_id = p_plugin_id
    AND recorded_at >= now() - (p_hours || ' hours')::interval;

  SELECT COUNT(*) INTO v_error_events
  FROM plugin_telemetry_events
  WHERE plugin_id = p_plugin_id
    AND recorded_at >= now() - (p_hours || ' hours')::interval
    AND severity IN ('error', 'critical');

  IF v_total_events = 0 THEN
    RETURN 0;
  END IF;

  RETURN ROUND((v_error_events::NUMERIC / v_total_events::NUMERIC) * 100, 2);
END;
$$ LANGUAGE plpgsql;

-- Insert default Ops agent (for testing)
INSERT INTO ops_agents (email, name, role, permissions)
VALUES (
  'ops@molam.com',
  'Molam Ops',
  'superadmin',
  ARRAY['plugin:view', 'plugin:manage', 'plugin:block', 'plugin:upgrade', 'plugin:debug']
)
ON CONFLICT (email) DO NOTHING;

-- Insert sample plugin versions
INSERT INTO plugin_versions_registry (cms, version, release_date, is_latest, changelog, min_php_version, min_wordpress_version)
VALUES
  ('woocommerce', '1.3.5', '2025-01-15', true, 'Critical bug fixes, improved 3DS2 flow', '7.4', '5.8'),
  ('woocommerce', '1.3.0', '2024-12-01', false, 'Added tokenization support', '7.4', '5.8'),
  ('woocommerce', '1.2.0', '2024-10-15', false, 'Initial stable release', '7.2', '5.6'),
  ('prestashop', '2.1.0', '2025-01-10', true, 'Performance improvements', '7.4', null),
  ('shopify', '3.0.2', '2025-01-12', true, 'Shopify App Bridge v3 support', null, null)
ON CONFLICT (cms, version) DO NOTHING;
