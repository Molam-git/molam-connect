-- ============================================================================
-- Brique 110ter - AI Plugin Forge
-- ============================================================================
-- Industrial-grade automated plugin generation, testing, packaging, and publishing
-- Powered by Sira AI with full audit trail, multi-sig approvals, and HSM signing
-- ============================================================================

-- Table: Plugin packages registry
CREATE TABLE IF NOT EXISTS plugin_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    version TEXT NOT NULL,
    cms TEXT NOT NULL, -- woocommerce | shopify | prestashop | magento | node | php | python
    manifest JSONB NOT NULL,
    package_s3_key TEXT, -- artifact location in S3
    package_checksum TEXT, -- SHA256 of package
    signature BYTEA, -- HSM signature of artifact
    sira_generation_hash TEXT, -- hash of Sira generation for audit
    status TEXT NOT NULL DEFAULT 'generated', -- generated | built | tested | sandboxed | signed | published | revoked
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    published_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT,
    UNIQUE(name, version)
);

CREATE INDEX IF NOT EXISTS idx_plugin_packages_cms_status ON plugin_packages(cms, status);
CREATE INDEX IF NOT EXISTS idx_plugin_packages_slug ON plugin_packages(slug);
CREATE INDEX IF NOT EXISTS idx_plugin_packages_created_by ON plugin_packages(created_by);

-- Table: Forge jobs (generation requests)
CREATE TABLE IF NOT EXISTS forge_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_package_id UUID REFERENCES plugin_packages(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL,
    params JSONB NOT NULL, -- generation params: branding, webhooks, features, cms, etc.
    idempotency_key TEXT UNIQUE, -- for safe retries
    status TEXT NOT NULL DEFAULT 'queued', -- queued | running | success | failed | cancelled
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_forge_jobs_status ON forge_jobs(status);
CREATE INDEX IF NOT EXISTS idx_forge_jobs_requested_by ON forge_jobs(requested_by);
CREATE INDEX IF NOT EXISTS idx_forge_jobs_created_at ON forge_jobs(created_at DESC);

-- Table: Forge runs (pipeline steps)
CREATE TABLE IF NOT EXISTS forge_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES forge_jobs(id) ON DELETE CASCADE,
    step TEXT NOT NULL, -- generate | build | test | sandbox | package | sign | publish
    status TEXT NOT NULL DEFAULT 'running', -- running | success | failed | skipped
    logs JSONB DEFAULT '[]'::JSONB, -- array of log messages
    artifacts JSONB, -- step outputs (paths, hashes, etc.)
    started_at TIMESTAMPTZ DEFAULT now(),
    ended_at TIMESTAMPTZ,
    duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_forge_runs_job_id ON forge_runs(job_id);
CREATE INDEX IF NOT EXISTS idx_forge_runs_step_status ON forge_runs(step, status);

-- Table: Forge approvals (multi-signature)
CREATE TABLE IF NOT EXISTS forge_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_package_id UUID NOT NULL REFERENCES plugin_packages(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL,
    approver_role TEXT NOT NULL, -- plugin_forge_ops | pay_admin
    approved BOOLEAN NOT NULL,
    comment TEXT,
    signature TEXT, -- MFA signature proof
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(plugin_package_id, approver_id)
);

CREATE INDEX IF NOT EXISTS idx_forge_approvals_package ON forge_approvals(plugin_package_id);

-- Table: Plugin contract tests
CREATE TABLE IF NOT EXISTS plugin_contract_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_package_id UUID NOT NULL REFERENCES plugin_packages(id) ON DELETE CASCADE,
    test_suite TEXT NOT NULL, -- events | webhooks | permissions | compatibility
    test_name TEXT NOT NULL,
    result TEXT NOT NULL, -- pass | fail | skip
    details JSONB,
    ran_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plugin_contract_tests_package ON plugin_contract_tests(plugin_package_id);
CREATE INDEX IF NOT EXISTS idx_plugin_contract_tests_result ON plugin_contract_tests(result);

-- Table: Plugin compatibility matrix
CREATE TABLE IF NOT EXISTS plugin_compatibilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_package_id UUID NOT NULL REFERENCES plugin_packages(id) ON DELETE CASCADE,
    cms TEXT NOT NULL,
    cms_version TEXT NOT NULL,
    tested BOOLEAN DEFAULT false,
    test_result TEXT, -- pass | fail | untested
    test_details JSONB,
    tested_at TIMESTAMPTZ,
    UNIQUE(plugin_package_id, cms, cms_version)
);

CREATE INDEX IF NOT EXISTS idx_plugin_compatibilities_package ON plugin_compatibilities(plugin_package_id);

-- Table: Sira generation audit
CREATE TABLE IF NOT EXISTS sira_generation_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_package_id UUID REFERENCES plugin_packages(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL, -- Sira prompt used
    prompt_hash TEXT NOT NULL, -- SHA256 of prompt
    response_hash TEXT NOT NULL, -- SHA256 of Sira response
    model_version TEXT NOT NULL, -- Sira model version
    generation_metadata JSONB, -- temperature, tokens, etc.
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sira_audit_package ON sira_generation_audit(plugin_package_id);

-- Table: Forge secrets (encrypted credentials)
CREATE TABLE IF NOT EXISTS forge_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    secret_type TEXT NOT NULL, -- api_key | signing_key | cms_credential
    vault_path TEXT NOT NULL, -- Vault path for secret
    encrypted_value BYTEA, -- Fallback encrypted value if Vault unavailable
    rotation_schedule TEXT, -- cron expression for rotation
    last_rotated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table: Marketplace connectors
CREATE TABLE IF NOT EXISTS marketplace_connectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    connector_type TEXT NOT NULL, -- wordpress_org | shopify_app_store | internal_marketplace
    config JSONB NOT NULL, -- API endpoints, auth method, etc.
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table: Plugin publications (tracking where plugins are published)
CREATE TABLE IF NOT EXISTS plugin_publications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_package_id UUID NOT NULL REFERENCES plugin_packages(id) ON DELETE CASCADE,
    marketplace_connector_id UUID NOT NULL REFERENCES marketplace_connectors(id),
    publication_status TEXT NOT NULL DEFAULT 'pending', -- pending | published | failed | retracted
    external_id TEXT, -- ID in external marketplace
    published_at TIMESTAMPTZ,
    retracted_at TIMESTAMPTZ,
    retract_reason TEXT,
    UNIQUE(plugin_package_id, marketplace_connector_id)
);

CREATE INDEX IF NOT EXISTS idx_plugin_publications_package ON plugin_publications(plugin_package_id);
CREATE INDEX IF NOT EXISTS idx_plugin_publications_marketplace ON plugin_publications(marketplace_connector_id);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Trigger: Update updated_at on plugin_packages
CREATE OR REPLACE FUNCTION update_plugin_packages_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_plugin_packages_updated
    BEFORE UPDATE ON plugin_packages
    FOR EACH ROW
    EXECUTE FUNCTION update_plugin_packages_timestamp();

-- Trigger: Calculate duration for forge_runs
CREATE OR REPLACE FUNCTION calculate_forge_run_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
        NEW.duration_ms = EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) * 1000;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_forge_run_duration
    BEFORE UPDATE ON forge_runs
    FOR EACH ROW
    EXECUTE FUNCTION calculate_forge_run_duration();

-- ============================================================================
-- Functions
-- ============================================================================

-- Function: Check if package has minimum approvals
CREATE OR REPLACE FUNCTION has_minimum_approvals(
    p_plugin_package_id UUID,
    p_min_approvals INTEGER DEFAULT 2
)
RETURNS BOOLEAN AS $$
DECLARE
    v_approval_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_approval_count
    FROM forge_approvals
    WHERE plugin_package_id = p_plugin_package_id
      AND approved = true;

    RETURN v_approval_count >= p_min_approvals;
END;
$$ LANGUAGE plpgsql;

-- Function: Get job statistics
CREATE OR REPLACE FUNCTION get_forge_job_stats(p_days INTEGER DEFAULT 30)
RETURNS TABLE(
    total_jobs BIGINT,
    queued BIGINT,
    running BIGINT,
    success BIGINT,
    failed BIGINT,
    cancelled BIGINT,
    avg_duration_seconds NUMERIC,
    success_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) as total_jobs,
        COUNT(*) FILTER (WHERE status = 'queued') as queued,
        COUNT(*) FILTER (WHERE status = 'running') as running,
        COUNT(*) FILTER (WHERE status = 'success') as success,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at)))::NUMERIC, 2) as avg_duration_seconds,
        ROUND(
            (COUNT(*) FILTER (WHERE status = 'success')::NUMERIC /
             NULLIF(COUNT(*) FILTER (WHERE status IN ('success', 'failed'))::NUMERIC, 0)) * 100,
            2
        ) as success_rate
    FROM forge_jobs
    WHERE created_at >= CURRENT_DATE - p_days * INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

-- Function: Get package by slug and version
CREATE OR REPLACE FUNCTION get_package_by_slug_version(
    p_slug TEXT,
    p_version TEXT
)
RETURNS plugin_packages AS $$
DECLARE
    v_package plugin_packages;
BEGIN
    SELECT *
    INTO v_package
    FROM plugin_packages
    WHERE slug = p_slug
      AND version = p_version;

    RETURN v_package;
END;
$$ LANGUAGE plpgsql;

-- Function: Revoke package
CREATE OR REPLACE FUNCTION revoke_package(
    p_plugin_package_id UUID,
    p_reason TEXT
)
RETURNS void AS $$
BEGIN
    UPDATE plugin_packages
    SET status = 'revoked',
        revoked_at = now(),
        revoked_reason = p_reason
    WHERE id = p_plugin_package_id;

    -- Mark all publications as retracted
    UPDATE plugin_publications
    SET publication_status = 'retracted',
        retracted_at = now(),
        retract_reason = p_reason
    WHERE plugin_package_id = p_plugin_package_id
      AND publication_status = 'published';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Sample Data
-- ============================================================================

-- Sample marketplace connectors
INSERT INTO marketplace_connectors (name, connector_type, config, is_active)
VALUES
    (
        'WordPress.org Plugin Directory',
        'wordpress_org',
        '{"api_url": "https://api.wordpress.org/plugins/info/1.2/", "auth_method": "svn"}'::JSONB,
        true
    ),
    (
        'Shopify App Store',
        'shopify_app_store',
        '{"api_url": "https://partners.shopify.com/api", "auth_method": "oauth"}'::JSONB,
        true
    ),
    (
        'Molam Internal Marketplace',
        'internal_marketplace',
        '{"api_url": "https://marketplace.molam.com/api/v1", "auth_method": "api_key"}'::JSONB,
        true
    ),
    (
        'PrestaShop Addons',
        'prestashop_addons',
        '{"api_url": "https://addons.prestashop.com/api", "auth_method": "api_key"}'::JSONB,
        true
    )
ON CONFLICT (name) DO NOTHING;

-- Sample forge secrets (placeholder - actual values in Vault)
INSERT INTO forge_secrets (name, secret_type, vault_path, rotation_schedule)
VALUES
    ('wordpress_svn_credential', 'cms_credential', 'secret/data/forge/wordpress_svn', '0 0 1 * *'),
    ('shopify_partner_api_key', 'api_key', 'secret/data/forge/shopify_api', '0 0 1 */3 *'),
    ('molam_marketplace_api_key', 'api_key', 'secret/data/forge/molam_marketplace', '0 0 1 */6 *'),
    ('package_signing_key', 'signing_key', 'transit/sign/molam-package-signing', NULL)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE plugin_packages IS 'Registry of all generated plugin packages';
COMMENT ON TABLE forge_jobs IS 'Plugin generation job queue';
COMMENT ON TABLE forge_runs IS 'Individual pipeline step executions';
COMMENT ON TABLE forge_approvals IS 'Multi-signature approvals for publishing';
COMMENT ON TABLE plugin_contract_tests IS 'Contract test results for plugins';
COMMENT ON TABLE plugin_compatibilities IS 'CMS version compatibility matrix';
COMMENT ON TABLE sira_generation_audit IS 'Audit trail for Sira-generated code';
COMMENT ON TABLE forge_secrets IS 'Encrypted secrets for forge operations';
COMMENT ON TABLE marketplace_connectors IS 'External marketplace integrations';
COMMENT ON TABLE plugin_publications IS 'Tracking of published plugins';

COMMENT ON FUNCTION has_minimum_approvals IS 'Check if package has required approvals for publishing';
COMMENT ON FUNCTION get_forge_job_stats IS 'Get forge job statistics for monitoring';
COMMENT ON FUNCTION revoke_package IS 'Revoke a published package and retract from marketplaces';

-- Fin du schéma
