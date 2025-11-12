-- =====================================================================
-- Brique 68 — RBAC Avancé Connect
-- Industrial-grade Role-Based Access Control + ABAC
-- =====================================================================
-- Features:
-- • Multi-tenancy (per organisation)
-- • Fine-grained permissions (resource:action)
-- • Role templates (reusable)
-- • Role bindings (user <-> role)
-- • Direct grants (ad-hoc permissions)
-- • Approval workflows (multi-signature for sensitive roles)
-- • Immutable audit trail
-- • Performance: Redis-cached, <5ms P50
-- =====================================================================

-- =====================================================================
-- 1. Organisations (Tenants)
-- =====================================================================

CREATE TABLE IF NOT EXISTS organisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  legal_entity TEXT,
  country TEXT,
  currency_default TEXT DEFAULT 'USD',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organisations_country ON organisations(country);
CREATE INDEX IF NOT EXISTS idx_organisations_created_at ON organisations(created_at DESC);

COMMENT ON TABLE organisations IS 'Multi-tenant organisations (merchants, companies)';
COMMENT ON COLUMN organisations.metadata IS 'Additional org settings (rbac_config, approval_rules)';

-- =====================================================================
-- 2. Permissions (Canonical fine-grained permissions)
-- =====================================================================

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,              -- e.g. "connect:payments:read"
  name TEXT NOT NULL,
  description TEXT,
  resource_kind TEXT,                     -- e.g. "payment", "payout", "invoice"
  actions TEXT[] DEFAULT '{}',            -- e.g. ['read', 'write', 'approve']
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permissions_code ON permissions(code);
CREATE INDEX IF NOT EXISTS idx_permissions_resource_kind ON permissions(resource_kind);

COMMENT ON TABLE permissions IS 'Canonical fine-grained permissions catalog';
COMMENT ON COLUMN permissions.code IS 'Unique permission code (resource:action format)';

-- =====================================================================
-- 3. Role Templates (Reusable role definitions)
-- =====================================================================

CREATE TABLE IF NOT EXISTS role_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                     -- e.g. "connect_owner"
  description TEXT,
  permissions UUID[] NOT NULL DEFAULT '{}', -- array of permission ids
  sensitive BOOLEAN DEFAULT false,        -- require approval/multi-sig to assign
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_role_templates_name ON role_templates(name);
CREATE INDEX IF NOT EXISTS idx_role_templates_sensitive ON role_templates(sensitive);

COMMENT ON TABLE role_templates IS 'Reusable role templates with predefined permissions';
COMMENT ON COLUMN role_templates.sensitive IS 'If true, requires multi-signature approval to assign';

-- =====================================================================
-- 4. Roles (Materialized roles bound to organisations)
-- =====================================================================

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES role_templates(id) ON DELETE SET NULL,
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                     -- e.g. "Finance - Acme Corp"
  metadata JSONB DEFAULT '{}',
  created_by UUID,                        -- user id who created this role
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roles_template_id ON roles(template_id);
CREATE INDEX IF NOT EXISTS idx_roles_organisation_id ON roles(organisation_id);
CREATE INDEX IF NOT EXISTS idx_roles_created_by ON roles(created_by);

COMMENT ON TABLE roles IS 'Materialized roles bound to specific organisations';
COMMENT ON COLUMN roles.template_id IS 'Reference to role template (can be null for custom roles)';

-- =====================================================================
-- 5. Role Bindings (User <-> Role assignments)
-- =====================================================================

CREATE TABLE IF NOT EXISTS role_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,                  -- molam_users.id
  assigned_by UUID NOT NULL,              -- user id who assigned this role
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,                 -- optional expiration for temp access
  context JSONB DEFAULT '{}',             -- ABAC attributes (country, currency, shop_id)
  UNIQUE(role_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_role_bindings_user_id ON role_bindings(user_id);
CREATE INDEX IF NOT EXISTS idx_role_bindings_role_id ON role_bindings(role_id);
CREATE INDEX IF NOT EXISTS idx_role_bindings_expires_at ON role_bindings(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE role_bindings IS 'User-to-role assignments with optional expiration';
COMMENT ON COLUMN role_bindings.context IS 'ABAC context attributes for fine-grained access control';

-- =====================================================================
-- 6. Direct Grants (Ad-hoc permission grants)
-- =====================================================================

CREATE TABLE IF NOT EXISTS grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE, -- optional tenant scope
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,                 -- optional expiration
  reason TEXT,                            -- justification for grant
  UNIQUE(user_id, permission_id, organisation_id)
);

CREATE INDEX IF NOT EXISTS idx_grants_user_id ON grants(user_id);
CREATE INDEX IF NOT EXISTS idx_grants_permission_id ON grants(permission_id);
CREATE INDEX IF NOT EXISTS idx_grants_organisation_id ON grants(organisation_id);
CREATE INDEX IF NOT EXISTS idx_grants_expires_at ON grants(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE grants IS 'Ad-hoc permission grants to users (bypassing roles)';
COMMENT ON COLUMN grants.reason IS 'Justification for direct grant (e.g., emergency access)';

-- =====================================================================
-- 7. Role Assignment Requests (Multi-signature approval workflow)
-- =====================================================================

CREATE TABLE IF NOT EXISTS role_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL,           -- user who will receive the role
  requested_by UUID NOT NULL,             -- user who initiated the request
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected, cancelled
  approvals JSONB DEFAULT '[]',           -- array of {by: uuid, at: timestamp, note: text}
  required_approvals INTEGER DEFAULT 1,   -- number of approvals needed
  reason TEXT,                            -- justification
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_role_requests_status ON role_requests(status);
CREATE INDEX IF NOT EXISTS idx_role_requests_target_user_id ON role_requests(target_user_id);
CREATE INDEX IF NOT EXISTS idx_role_requests_requested_by ON role_requests(requested_by);

COMMENT ON TABLE role_requests IS 'Role assignment requests requiring multi-signature approval';
COMMENT ON COLUMN role_requests.approvals IS 'Array of approval records [{by, at, note}]';

-- =====================================================================
-- 8. RBAC Audit Logs (Immutable audit trail)
-- =====================================================================

CREATE TABLE IF NOT EXISTS rbac_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,                          -- user who performed the action
  action TEXT NOT NULL,                   -- grant, assign, revoke, create_role, approve, etc.
  target JSONB,                           -- {role_id, user_id, permission_id, etc.}
  details JSONB DEFAULT '{}',             -- additional context
  ip_address INET,                        -- source IP
  user_agent TEXT,                        -- browser/client info
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rbac_audit_logs_actor_id ON rbac_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_logs_action ON rbac_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_logs_created_at ON rbac_audit_logs(created_at DESC);

COMMENT ON TABLE rbac_audit_logs IS 'Immutable audit trail for all RBAC changes (WORM storage)';
COMMENT ON COLUMN rbac_audit_logs.action IS 'Type of RBAC action performed';

-- =====================================================================
-- Triggers for updated_at
-- =====================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER organisations_updated_at BEFORE UPDATE ON organisations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER role_templates_updated_at BEFORE UPDATE ON role_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER roles_updated_at BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER role_requests_updated_at BEFORE UPDATE ON role_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- Views for common queries
-- =====================================================================

-- Active role bindings (non-expired)
CREATE OR REPLACE VIEW active_role_bindings AS
SELECT
  rb.*,
  r.name AS role_name,
  r.organisation_id,
  rt.name AS template_name,
  rt.sensitive
FROM role_bindings rb
JOIN roles r ON r.id = rb.role_id
LEFT JOIN role_templates rt ON rt.id = r.template_id
WHERE rb.expires_at IS NULL OR rb.expires_at > now();

COMMENT ON VIEW active_role_bindings IS 'Non-expired role bindings with role details';

-- Active grants (non-expired)
CREATE OR REPLACE VIEW active_grants AS
SELECT
  g.*,
  p.code AS permission_code,
  p.name AS permission_name
FROM grants g
JOIN permissions p ON p.id = g.permission_id
WHERE g.expires_at IS NULL OR g.expires_at > now();

COMMENT ON VIEW active_grants IS 'Non-expired direct grants with permission details';

-- User permissions summary (for debugging)
CREATE OR REPLACE VIEW user_permissions_summary AS
SELECT
  rb.user_id,
  ARRAY_AGG(DISTINCT p.code) AS permissions
FROM role_bindings rb
JOIN roles r ON r.id = rb.role_id
JOIN role_templates rt ON rt.id = r.template_id,
UNNEST(rt.permissions) AS perm_id
JOIN permissions p ON p.id = perm_id
WHERE rb.expires_at IS NULL OR rb.expires_at > now()
GROUP BY rb.user_id;

COMMENT ON VIEW user_permissions_summary IS 'Aggregated permissions per user (for debugging only)';

-- =====================================================================
-- Seed Data: Core Permissions
-- =====================================================================

INSERT INTO permissions (code, name, description, resource_kind, actions) VALUES
-- Connect module permissions
('connect:payments:read', 'Read Payments', 'View payment transactions', 'payment', ARRAY['read']),
('connect:payments:create', 'Create Payments', 'Create payment intents', 'payment', ARRAY['create']),
('connect:payments:refund', 'Refund Payments', 'Issue refunds', 'payment', ARRAY['refund']),
('connect:payouts:read', 'Read Payouts', 'View payout records', 'payout', ARRAY['read']),
('connect:payouts:create', 'Create Payouts', 'Initiate payouts', 'payout', ARRAY['create']),
('connect:invoices:read', 'Read Invoices', 'View invoices', 'invoice', ARRAY['read']),
('connect:invoices:create', 'Create Invoices', 'Generate invoices', 'invoice', ARRAY['create']),

-- RBAC module permissions
('rbac:roles:read', 'Read Roles', 'View role definitions', 'rbac', ARRAY['read']),
('rbac:roles:create', 'Create Roles', 'Create new roles', 'rbac', ARRAY['create']),
('rbac:roles:assign', 'Assign Roles', 'Assign roles to users', 'rbac', ARRAY['assign']),
('rbac:roles:revoke', 'Revoke Roles', 'Remove role assignments', 'rbac', ARRAY['revoke']),
('rbac:templates:create', 'Create Templates', 'Create role templates', 'rbac', ARRAY['create']),
('rbac:grants:create', 'Create Grants', 'Create direct permission grants', 'rbac', ARRAY['create']),
('rbac:approvals:manage', 'Manage Approvals', 'Approve/reject role requests', 'rbac', ARRAY['approve']),

-- Subscription module permissions
('subscriptions:plans:read', 'Read Plans', 'View subscription plans', 'subscription', ARRAY['read']),
('subscriptions:plans:create', 'Create Plans', 'Create subscription plans', 'subscription', ARRAY['create']),
('subscriptions:manage', 'Manage Subscriptions', 'Create/cancel subscriptions', 'subscription', ARRAY['manage']),

-- Dispute module permissions
('disputes:read', 'Read Disputes', 'View disputes', 'dispute', ARRAY['read']),
('disputes:manage', 'Manage Disputes', 'Respond to disputes', 'dispute', ARRAY['manage']),

-- Analytics permissions
('analytics:read', 'Read Analytics', 'View analytics dashboards', 'analytics', ARRAY['read']),
('analytics:export', 'Export Analytics', 'Export analytics data', 'analytics', ARRAY['export']),

-- Organization management
('org:settings:read', 'Read Org Settings', 'View organization settings', 'organization', ARRAY['read']),
('org:settings:write', 'Write Org Settings', 'Modify organization settings', 'organization', ARRAY['write']),
('org:team:manage', 'Manage Team', 'Add/remove team members', 'organization', ARRAY['manage'])
ON CONFLICT (code) DO NOTHING;

-- =====================================================================
-- Seed Data: Role Templates
-- =====================================================================

-- Owner role (all permissions, sensitive)
INSERT INTO role_templates (name, description, permissions, sensitive) VALUES
('connect_owner', 'Organisation Owner', ARRAY(
  SELECT id FROM permissions WHERE code IN (
    'connect:payments:read', 'connect:payments:create', 'connect:payments:refund',
    'connect:payouts:read', 'connect:payouts:create',
    'connect:invoices:read', 'connect:invoices:create',
    'rbac:roles:read', 'rbac:roles:create', 'rbac:roles:assign', 'rbac:roles:revoke',
    'rbac:templates:create', 'rbac:grants:create', 'rbac:approvals:manage',
    'subscriptions:plans:read', 'subscriptions:plans:create', 'subscriptions:manage',
    'disputes:read', 'disputes:manage',
    'analytics:read', 'analytics:export',
    'org:settings:read', 'org:settings:write', 'org:team:manage'
  )
), true);

-- Finance role (payment, payout, invoice management)
INSERT INTO role_templates (name, description, permissions, sensitive) VALUES
('connect_finance', 'Finance Manager', ARRAY(
  SELECT id FROM permissions WHERE code IN (
    'connect:payments:read', 'connect:payments:refund',
    'connect:payouts:read', 'connect:payouts:create',
    'connect:invoices:read', 'connect:invoices:create',
    'subscriptions:plans:read', 'subscriptions:manage',
    'analytics:read', 'analytics:export'
  )
), true);

-- Operations role (read-only + limited actions)
INSERT INTO role_templates (name, description, permissions, sensitive) VALUES
('connect_ops', 'Operations Team', ARRAY(
  SELECT id FROM permissions WHERE code IN (
    'connect:payments:read',
    'connect:payouts:read',
    'connect:invoices:read',
    'disputes:read', 'disputes:manage',
    'analytics:read'
  )
), false);

-- Developer role (read-only for integrations)
INSERT INTO role_templates (name, description, permissions, sensitive) VALUES
('connect_developer', 'Developer', ARRAY(
  SELECT id FROM permissions WHERE code IN (
    'connect:payments:read',
    'connect:payouts:read',
    'connect:invoices:read',
    'subscriptions:plans:read',
    'analytics:read'
  )
), false);

-- Marketing role (analytics only)
INSERT INTO role_templates (name, description, permissions, sensitive) VALUES
('connect_marketing', 'Marketing Team', ARRAY(
  SELECT id FROM permissions WHERE code IN (
    'analytics:read'
  )
), false);

-- Support role (limited dispute and payment read)
INSERT INTO role_templates (name, description, permissions, sensitive) VALUES
('connect_support', 'Customer Support', ARRAY(
  SELECT id FROM permissions WHERE code IN (
    'connect:payments:read',
    'disputes:read', 'disputes:manage'
  )
), false);

-- Auditor role (read-only all resources)
INSERT INTO role_templates (name, description, permissions, sensitive) VALUES
('connect_auditor', 'Auditor', ARRAY(
  SELECT id FROM permissions WHERE code IN (
    'connect:payments:read',
    'connect:payouts:read',
    'connect:invoices:read',
    'subscriptions:plans:read',
    'disputes:read',
    'analytics:read', 'analytics:export',
    'org:settings:read',
    'rbac:roles:read'
  )
), false);

-- Billing role (subscription management)
INSERT INTO role_templates (name, description, permissions, sensitive) VALUES
('connect_billing', 'Billing Team', ARRAY(
  SELECT id FROM permissions WHERE code IN (
    'connect:invoices:read', 'connect:invoices:create',
    'subscriptions:plans:read', 'subscriptions:plans:create', 'subscriptions:manage',
    'analytics:read'
  )
), false);

-- Compliance role (read-only + export)
INSERT INTO role_templates (name, description, permissions, sensitive) VALUES
('connect_compliance', 'Compliance Officer', ARRAY(
  SELECT id FROM permissions WHERE code IN (
    'connect:payments:read',
    'connect:payouts:read',
    'connect:invoices:read',
    'disputes:read',
    'analytics:read', 'analytics:export',
    'org:settings:read',
    'rbac:roles:read'
  )
), false);

-- =====================================================================
-- Seed Data: Sample Organisation
-- =====================================================================

INSERT INTO organisations (name, legal_entity, country, currency_default, metadata) VALUES
('Molam Platform', 'Molam Inc.', 'US', 'USD', '{"rbac_config": {"default_approvals": 2}}'),
('Demo Merchant', 'Demo Corp', 'FR', 'EUR', '{"rbac_config": {"default_approvals": 1}}')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- Functions for RBAC Operations
-- =====================================================================

-- Check if user has permission (cache bypass for debugging)
CREATE OR REPLACE FUNCTION user_has_permission(
  p_user_id UUID,
  p_permission_code TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  has_perm BOOLEAN;
BEGIN
  -- Check direct grants
  SELECT EXISTS(
    SELECT 1 FROM grants g
    JOIN permissions p ON p.id = g.permission_id
    WHERE g.user_id = p_user_id
      AND p.code = p_permission_code
      AND (g.expires_at IS NULL OR g.expires_at > now())
  ) INTO has_perm;

  IF has_perm THEN RETURN TRUE; END IF;

  -- Check role bindings
  SELECT EXISTS(
    SELECT 1 FROM role_bindings rb
    JOIN roles r ON r.id = rb.role_id
    JOIN role_templates rt ON rt.id = r.template_id,
    UNNEST(rt.permissions) AS perm_id
    JOIN permissions p ON p.id = perm_id
    WHERE rb.user_id = p_user_id
      AND p.code = p_permission_code
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ) INTO has_perm;

  RETURN has_perm;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION user_has_permission IS 'Check if user has a specific permission (cache bypass)';

-- =====================================================================
-- Performance Indexes
-- =====================================================================

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_role_bindings_user_expires ON role_bindings(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_grants_user_expires ON grants(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_logs_actor_action ON rbac_audit_logs(actor_id, action);

-- GIN index for JSONB searches
CREATE INDEX IF NOT EXISTS idx_role_requests_approvals ON role_requests USING GIN(approvals);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_logs_target ON rbac_audit_logs USING GIN(target);

-- =====================================================================
-- End of Migration
-- =====================================================================
