-- ============================================================================
-- Brique 110bis - Auto-Healing Plugins & Interop Layer
-- ============================================================================
-- Extension de Brique 110 avec capacités d'auto-réparation et interopérabilité
-- ============================================================================

-- Table: Historique des patchs appliqués automatiquement
CREATE TABLE IF NOT EXISTS plugin_auto_healing_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_id UUID NOT NULL REFERENCES plugin_installations(id) ON DELETE CASCADE,
    detected_issue TEXT NOT NULL,
    issue_severity TEXT DEFAULT 'medium', -- low | medium | high | critical
    applied_patch JSONB NOT NULL, -- code snippet ou version forcée
    patch_type TEXT NOT NULL, -- dependency_update | security_patch | bug_fix | performance
    status TEXT DEFAULT 'applied', -- applied | rolled_back | failed | pending
    sira_decision JSONB, -- explication IA avec score de confiance
    sira_confidence NUMERIC(5,2) DEFAULT 0.0, -- score 0-100
    rollback_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    applied_at TIMESTAMPTZ,
    rolled_back_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table: Standardiser les événements interop entre tous les plugins
CREATE TABLE IF NOT EXISTS plugin_interop_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_id UUID NOT NULL REFERENCES plugin_installations(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL,
    event_type TEXT NOT NULL, -- checkout.created, payment.failed, refund.issued, plugin.error
    event_category TEXT NOT NULL, -- checkout | payment | refund | subscription | error
    payload JSONB NOT NULL,
    normalized_payload JSONB, -- version standardisée du payload
    source_platform TEXT NOT NULL, -- woocommerce | shopify | prestashop | magento | noncms
    received_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ,
    processing_status TEXT DEFAULT 'pending', -- pending | processed | failed | ignored
    retry_count INTEGER DEFAULT 0,
    error_message TEXT
);

-- Table: Commandes envoyées aux plugins (pour auto-healing)
CREATE TABLE IF NOT EXISTS plugin_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_id UUID NOT NULL REFERENCES plugin_installations(id) ON DELETE CASCADE,
    command_type TEXT NOT NULL, -- apply_patch | rollback | force_update | enable_debug | restart
    command_payload JSONB NOT NULL,
    issued_by UUID, -- ops_agent or sira
    issued_at TIMESTAMPTZ DEFAULT now(),
    acknowledged_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    execution_status TEXT DEFAULT 'pending', -- pending | acknowledged | executed | failed
    execution_result JSONB,
    timeout_at TIMESTAMPTZ, -- commande expire si pas exécutée
    priority INTEGER DEFAULT 5 -- 1=lowest, 10=highest
);

-- Table: Rollback snapshots (sauvegardes avant patch)
CREATE TABLE IF NOT EXISTS plugin_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_id UUID NOT NULL REFERENCES plugin_installations(id) ON DELETE CASCADE,
    healing_log_id UUID REFERENCES plugin_auto_healing_logs(id) ON DELETE CASCADE,
    snapshot_type TEXT DEFAULT 'pre_patch', -- pre_patch | manual | scheduled
    plugin_version TEXT NOT NULL,
    plugin_files JSONB, -- liste des fichiers modifiés avec hash
    database_schema JSONB, -- schéma DB si applicable
    configuration JSONB, -- options du plugin
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days')
);

-- Table: Règles d'auto-healing définies par Ops
CREATE TABLE IF NOT EXISTS auto_healing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name TEXT NOT NULL UNIQUE,
    issue_pattern TEXT NOT NULL, -- regex ou pattern pour détecter l'issue
    platforms TEXT[] DEFAULT ARRAY['all'], -- woocommerce, shopify, etc. ou 'all'
    auto_apply BOOLEAN DEFAULT false, -- si true, applique automatiquement sans validation
    min_sira_confidence NUMERIC(5,2) DEFAULT 80.0, -- confiance minimum pour auto-apply
    patch_template JSONB, -- template du patch à appliquer
    notification_channels TEXT[] DEFAULT ARRAY['email', 'slack'], -- canaux de notification
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table: Mappings interop (normalisation des événements)
CREATE TABLE IF NOT EXISTS interop_event_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_platform TEXT NOT NULL, -- woocommerce | shopify | prestashop
    source_event_type TEXT NOT NULL, -- ex: woocommerce_checkout_order_processed
    normalized_event_type TEXT NOT NULL, -- ex: checkout.created
    field_mappings JSONB NOT NULL, -- {"amount": "total", "currency": "order_currency"}
    transformation_rules JSONB, -- règles de transformation custom
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(source_platform, source_event_type)
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_auto_healing_logs_plugin ON plugin_auto_healing_logs(plugin_id);
CREATE INDEX IF NOT EXISTS idx_auto_healing_logs_status ON plugin_auto_healing_logs(status);
CREATE INDEX IF NOT EXISTS idx_auto_healing_logs_created ON plugin_auto_healing_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interop_events_plugin ON plugin_interop_events(plugin_id);
CREATE INDEX IF NOT EXISTS idx_interop_events_type ON plugin_interop_events(event_type);
CREATE INDEX IF NOT EXISTS idx_interop_events_category ON plugin_interop_events(event_category);
CREATE INDEX IF NOT EXISTS idx_interop_events_received ON plugin_interop_events(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_interop_events_status ON plugin_interop_events(processing_status);

CREATE INDEX IF NOT EXISTS idx_plugin_commands_plugin ON plugin_commands(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_commands_status ON plugin_commands(execution_status);
CREATE INDEX IF NOT EXISTS idx_plugin_commands_issued ON plugin_commands(issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_plugin_snapshots_plugin ON plugin_snapshots(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_snapshots_healing_log ON plugin_snapshots(healing_log_id);

CREATE INDEX IF NOT EXISTS idx_interop_mappings_platform ON interop_event_mappings(source_platform);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Trigger: updated_at pour auto_healing_logs
CREATE OR REPLACE FUNCTION update_auto_healing_logs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_healing_logs_updated
    BEFORE UPDATE ON plugin_auto_healing_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_auto_healing_logs_timestamp();

-- Trigger: updated_at pour auto_healing_rules
CREATE TRIGGER trigger_auto_healing_rules_updated
    BEFORE UPDATE ON auto_healing_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_auto_healing_logs_timestamp();

-- Trigger: updated_at pour interop_event_mappings
CREATE TRIGGER trigger_interop_mappings_updated
    BEFORE UPDATE ON interop_event_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_auto_healing_logs_timestamp();

-- ============================================================================
-- Functions
-- ============================================================================

-- Function: Créer snapshot avant patch
CREATE OR REPLACE FUNCTION create_pre_patch_snapshot(
    p_plugin_id UUID,
    p_healing_log_id UUID,
    p_plugin_version TEXT,
    p_configuration JSONB
)
RETURNS UUID AS $$
DECLARE
    v_snapshot_id UUID;
BEGIN
    INSERT INTO plugin_snapshots (
        plugin_id,
        healing_log_id,
        snapshot_type,
        plugin_version,
        configuration
    ) VALUES (
        p_plugin_id,
        p_healing_log_id,
        'pre_patch',
        p_plugin_version,
        p_configuration
    ) RETURNING id INTO v_snapshot_id;

    RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Rollback vers snapshot
CREATE OR REPLACE FUNCTION rollback_to_snapshot(p_snapshot_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_snapshot RECORD;
    v_result JSONB;
BEGIN
    -- Récupérer snapshot
    SELECT * INTO v_snapshot FROM plugin_snapshots WHERE id = p_snapshot_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Snapshot not found');
    END IF;

    -- Marquer le healing log comme rolled_back
    UPDATE plugin_auto_healing_logs
    SET status = 'rolled_back',
        rolled_back_at = now(),
        rollback_reason = 'Manual rollback to snapshot'
    WHERE id = v_snapshot.healing_log_id;

    -- Restaurer version
    UPDATE plugin_installations
    SET plugin_version = v_snapshot.plugin_version,
        updated_at = now()
    WHERE id = v_snapshot.plugin_id;

    RETURN jsonb_build_object(
        'success', true,
        'plugin_id', v_snapshot.plugin_id,
        'restored_version', v_snapshot.plugin_version
    );
END;
$$ LANGUAGE plpgsql;

-- Function: Normaliser événement interop
CREATE OR REPLACE FUNCTION normalize_interop_event(
    p_source_platform TEXT,
    p_source_event_type TEXT,
    p_payload JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_mapping RECORD;
    v_normalized JSONB := '{}'::JSONB;
    v_key TEXT;
    v_source_field TEXT;
BEGIN
    -- Récupérer mapping
    SELECT * INTO v_mapping
    FROM interop_event_mappings
    WHERE source_platform = p_source_platform
      AND source_event_type = p_source_event_type
      AND is_active = true;

    IF NOT FOUND THEN
        -- Pas de mapping, retourner payload tel quel
        RETURN p_payload;
    END IF;

    -- Appliquer field mappings
    FOR v_key, v_source_field IN
        SELECT key, value FROM jsonb_each_text(v_mapping.field_mappings)
    LOOP
        v_normalized := v_normalized || jsonb_build_object(
            v_key,
            p_payload->v_source_field
        );
    END LOOP;

    RETURN v_normalized;
END;
$$ LANGUAGE plpgsql;

-- Function: Statistiques auto-healing
CREATE OR REPLACE FUNCTION get_auto_healing_stats(p_days INTEGER DEFAULT 30)
RETURNS TABLE(
    total_patches INTEGER,
    applied INTEGER,
    rolled_back INTEGER,
    failed INTEGER,
    avg_confidence NUMERIC,
    success_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER as total_patches,
        COUNT(*) FILTER (WHERE status = 'applied')::INTEGER as applied,
        COUNT(*) FILTER (WHERE status = 'rolled_back')::INTEGER as rolled_back,
        COUNT(*) FILTER (WHERE status = 'failed')::INTEGER as failed,
        ROUND(AVG(sira_confidence), 2) as avg_confidence,
        ROUND(
            (COUNT(*) FILTER (WHERE status = 'applied')::NUMERIC /
             NULLIF(COUNT(*)::NUMERIC, 0)) * 100,
            2
        ) as success_rate
    FROM plugin_auto_healing_logs
    WHERE created_at >= CURRENT_DATE - p_days * INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Sample Data
-- ============================================================================

-- Règles d'auto-healing par défaut
INSERT INTO auto_healing_rules (rule_name, issue_pattern, platforms, auto_apply, min_sira_confidence, patch_template, is_active)
VALUES
    (
        'outdated_php_dependency',
        'Fatal error:.*requires PHP.*',
        ARRAY['woocommerce', 'prestashop'],
        false,
        85.0,
        '{"type": "dependency_update", "target": "php_version", "action": "suggest_upgrade"}'::JSONB,
        true
    ),
    (
        'missing_database_column',
        'Unknown column.*in field list',
        ARRAY['all'],
        true,
        90.0,
        '{"type": "database_patch", "action": "add_missing_column"}'::JSONB,
        true
    ),
    (
        'memory_limit_exceeded',
        'Allowed memory size.*exhausted',
        ARRAY['all'],
        false,
        80.0,
        '{"type": "config_update", "target": "memory_limit", "value": "256M"}'::JSONB,
        true
    ),
    (
        'api_key_expired',
        '401.*Unauthorized.*API key',
        ARRAY['all'],
        false,
        95.0,
        '{"type": "credential_refresh", "action": "notify_merchant"}'::JSONB,
        true
    )
ON CONFLICT (rule_name) DO NOTHING;

-- Mappings interop standards
INSERT INTO interop_event_mappings (source_platform, source_event_type, normalized_event_type, field_mappings, is_active)
VALUES
    (
        'woocommerce',
        'woocommerce_checkout_order_processed',
        'checkout.created',
        '{"order_id": "id", "total": "amount", "currency": "currency", "customer_id": "user_id"}'::JSONB,
        true
    ),
    (
        'woocommerce',
        'woocommerce_payment_complete',
        'payment.succeeded',
        '{"order_id": "id", "total": "amount", "payment_method": "method"}'::JSONB,
        true
    ),
    (
        'shopify',
        'orders/create',
        'checkout.created',
        '{"id": "order_id", "total_price": "amount", "currency": "currency"}'::JSONB,
        true
    ),
    (
        'shopify',
        'orders/paid',
        'payment.succeeded',
        '{"id": "order_id", "total_price": "amount", "gateway": "method"}'::JSONB,
        true
    ),
    (
        'prestashop',
        'actionValidateOrder',
        'checkout.created',
        '{"id_order": "order_id", "total_paid": "amount", "id_currency": "currency"}'::JSONB,
        true
    ),
    (
        'magento',
        'sales_order_place_after',
        'checkout.created',
        '{"entity_id": "order_id", "grand_total": "amount", "order_currency_code": "currency"}'::JSONB,
        true
    )
ON CONFLICT (source_platform, source_event_type) DO NOTHING;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE plugin_auto_healing_logs IS 'Historique des patchs auto-healing appliqués par Sira';
COMMENT ON TABLE plugin_interop_events IS 'Événements standardisés provenant de tous les plugins';
COMMENT ON TABLE plugin_commands IS 'Commandes envoyées aux plugins pour auto-healing';
COMMENT ON TABLE plugin_snapshots IS 'Snapshots des plugins avant application de patch';
COMMENT ON TABLE auto_healing_rules IS 'Règles configurables pour auto-healing';
COMMENT ON TABLE interop_event_mappings IS 'Mappings pour normaliser événements entre plateformes';

COMMENT ON FUNCTION create_pre_patch_snapshot IS 'Crée un snapshot avant application de patch';
COMMENT ON FUNCTION rollback_to_snapshot IS 'Rollback un plugin vers un snapshot précédent';
COMMENT ON FUNCTION normalize_interop_event IS 'Normalise un événement selon les mappings interop';
COMMENT ON FUNCTION get_auto_healing_stats IS 'Statistiques sur les patchs auto-healing';

-- ============================================================================
-- Permissions (à adapter selon votre RBAC)
-- ============================================================================

-- Les ops_agents peuvent tout gérer
-- Les plugins peuvent seulement lire leurs commandes et écrire des événements

-- Fin du schéma
