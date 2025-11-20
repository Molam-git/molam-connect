/**
 * BRIQUE 147 — A/B & Experiment Platform
 * PostgreSQL schema migration
 */

-- 1) Experiments definition
CREATE TABLE IF NOT EXISTS experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    targeting JSONB,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT valid_status CHECK (status IN ('draft', 'running', 'stopped', 'archived'))
);

CREATE INDEX idx_experiments_status ON experiments(status);
CREATE INDEX idx_experiments_created_by ON experiments(created_by);

-- 2) Variants
CREATE TABLE IF NOT EXISTS experiment_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    config JSONB NOT NULL,
    traffic_share NUMERIC(5,2) DEFAULT 0,
    is_control BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT valid_traffic_share CHECK (traffic_share >= 0 AND traffic_share <= 100)
);

CREATE INDEX idx_variants_experiment ON experiment_variants(experiment_id);

-- 3) Assignments
CREATE TABLE IF NOT EXISTS experiment_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES experiment_variants(id) ON DELETE CASCADE,
    molam_id UUID NOT NULL,
    assigned_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(experiment_id, molam_id)
);

CREATE INDEX idx_assignments_experiment ON experiment_assignments(experiment_id);
CREATE INDEX idx_assignments_molam_id ON experiment_assignments(molam_id);

-- 4) Metrics
CREATE TABLE IF NOT EXISTS experiment_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES experiment_variants(id) ON DELETE CASCADE,
    molam_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    value NUMERIC(18,4),
    metadata JSONB,
    occurred_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_metrics_experiment ON experiment_metrics(experiment_id);
CREATE INDEX idx_metrics_variant ON experiment_metrics(variant_id);
CREATE INDEX idx_metrics_event_type ON experiment_metrics(event_type);

-- 5) Audit logs
CREATE TABLE IF NOT EXISTS experiment_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID REFERENCES experiments(id) ON DELETE SET NULL,
    actor UUID NOT NULL,
    action TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_experiment ON experiment_audit_logs(experiment_id);
CREATE INDEX idx_audit_actor ON experiment_audit_logs(actor);

-- 6) SIRA bandit state
CREATE TABLE IF NOT EXISTS experiment_bandit_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES experiment_variants(id) ON DELETE CASCADE,
    alpha NUMERIC(18,4) DEFAULT 1,
    beta NUMERIC(18,4) DEFAULT 1,
    total_samples INT DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT now(),
    UNIQUE(experiment_id, variant_id)
);

CREATE INDEX idx_bandit_experiment ON experiment_bandit_state(experiment_id);

-- Update trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_experiments_updated_at
    BEFORE UPDATE ON experiments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
