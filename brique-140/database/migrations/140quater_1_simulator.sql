/**
 * SOUS-BRIQUE 140quater-1 — Self-Healing Offline Simulator
 * Système de simulation isolée pour valider patches avant production
 */

-- 1) Simulation definitions
CREATE TABLE IF NOT EXISTS sdk_simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('merchant','agent','internal')),
  tenant_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  sdk_language TEXT NOT NULL CHECK (sdk_language IN ('node','php','python','ruby','woocommerce','shopify')),
  scenario JSONB NOT NULL,    -- e.g. { "error":"signature_mismatch", "frequency":0.7, "latency_ms":1000, "total_requests":100 }
  patch_reference UUID REFERENCES sdk_self_healing_registry(id),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','queued','running','completed','failed','cancelled'))
);

-- 2) Simulation runs (one simulation can have many runs)
CREATE TABLE IF NOT EXISTS sdk_simulation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id UUID NOT NULL REFERENCES sdk_simulations(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  seed BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint),
  run_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued','running','success','partial_success','failed','timeout')),
  metrics JSONB,                -- { success_rate:0.9, avg_latency_ms:120, regressions:[], total_requests:100, failed_requests:10 }
  artifact_s3_key TEXT,         -- archived logs + report
  container_id TEXT,
  exit_code INT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3) Journal of actions (immutable audit log)
CREATE TABLE IF NOT EXISTS sdk_simulation_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES sdk_simulation_runs(id),
  actor TEXT NOT NULL, -- 'auto','ops:<user_id>','sira','system'
  action TEXT NOT NULL CHECK (action IN ('queued','started','applied_patch','rollback','completed','failed','timeout','killed')),
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4) Patch approval workflow (after successful simulation)
CREATE TABLE IF NOT EXISTS sdk_patch_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patch_id UUID NOT NULL REFERENCES sdk_self_healing_registry(id),
  simulation_run_id UUID REFERENCES sdk_simulation_runs(id),
  approver_id UUID NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','staged','deployed')),
  approval_notes TEXT,
  approved_at TIMESTAMPTZ,
  deployed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5) Anonymized error signatures for SIRA training
CREATE TABLE IF NOT EXISTS sdk_anonymized_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_run_id UUID REFERENCES sdk_simulation_runs(id),
  error_signature TEXT NOT NULL,
  error_category TEXT,
  sdk_language TEXT NOT NULL,
  frequency DECIMAL(5,4), -- 0.0000 to 1.0000
  context_hash TEXT, -- SHA256 of sanitized context
  exported_to_sira BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6) Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sdk_sim_runs_sim ON sdk_simulation_runs(simulation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sdk_sim_by_tenant ON sdk_simulations(tenant_type, tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_sdk_sim_runs_status ON sdk_simulation_runs(status, run_at ASC);
CREATE INDEX IF NOT EXISTS idx_sdk_sim_journal_run ON sdk_simulation_journal(run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sdk_patch_approvals_patch ON sdk_patch_approvals(patch_id, status);
CREATE INDEX IF NOT EXISTS idx_sdk_anonymized_errors_sig ON sdk_anonymized_errors(error_signature, sdk_language);
CREATE INDEX IF NOT EXISTS idx_sdk_anonymized_errors_export ON sdk_anonymized_errors(exported_to_sira, created_at DESC)
  WHERE exported_to_sira = false;

-- 7) Default simulation templates
INSERT INTO sdk_simulations(tenant_type, name, description, sdk_language, scenario, status)
VALUES (
  'internal',
  'Template: HMAC Signature Mismatch',
  'Simule erreurs de signature HMAC à 30%',
  'node',
  '{
    "error": "signature_mismatch",
    "error_frequency": 0.3,
    "latency_ms": 500,
    "total_requests": 100,
    "success_threshold": 0.85
  }'::JSONB,
  'draft'
);

INSERT INTO sdk_simulations(tenant_type, name, description, sdk_language, scenario, status)
VALUES (
  'internal',
  'Template: Timeout Errors',
  'Simule timeouts réseau à 20%',
  'node',
  '{
    "error": "timeout",
    "error_frequency": 0.2,
    "latency_ms": 1000,
    "total_requests": 200,
    "success_threshold": 0.90
  }'::JSONB,
  'draft'
);

INSERT INTO sdk_simulations(tenant_type, name, description, sdk_language, scenario, status)
VALUES (
  'internal',
  'Template: Invalid Currency',
  'Simule erreurs devise invalide à 10%',
  'php',
  '{
    "error": "invalid_currency",
    "error_frequency": 0.1,
    "latency_ms": 300,
    "total_requests": 150,
    "success_threshold": 0.95
  }'::JSONB,
  'draft'
);

-- 8) View for ops dashboard
CREATE OR REPLACE VIEW sdk_simulation_runs_summary AS
SELECT
  sr.id,
  sr.simulation_id,
  s.name as simulation_name,
  s.sdk_language,
  sr.status,
  sr.metrics->>'success_rate' as success_rate,
  sr.metrics->>'avg_latency_ms' as avg_latency_ms,
  sr.run_at,
  sr.completed_at,
  EXTRACT(EPOCH FROM (COALESCE(sr.completed_at, now()) - sr.run_at)) as duration_seconds,
  sr.artifact_s3_key
FROM sdk_simulation_runs sr
JOIN sdk_simulations s ON sr.simulation_id = s.id
ORDER BY sr.run_at DESC;
