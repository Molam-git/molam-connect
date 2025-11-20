-- BRIQUE 142-SIRA — AI-Generated Playbooks by SIRA
-- Database schema for SIRA suggestions, approval workflows, and playbook execution

-- Suggested playbooks proposed by SIRA
CREATE TABLE IF NOT EXISTS suggested_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_by TEXT NOT NULL DEFAULT 'sira',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scenario TEXT NOT NULL,              -- e.g. 'massive_chargeback_wave_country_SN'
  confidence NUMERIC(5,4) NOT NULL,    -- 0.0000 - 1.0000
  justification JSONB,                 -- features & explanation from SIRA
  proposed_actions JSONB NOT NULL,     -- actions sequence (freeze_account, escalate, notify)
  status TEXT DEFAULT 'pending',       -- pending|rejected|approved|edited
  reviewed_by UUID,                    -- user id who reviewed
  reviewed_at TIMESTAMPTZ,
  created_playbook_id UUID,            -- if approved -> id in playbooks
  metadata JSONB
);
CREATE INDEX IF NOT EXISTS idx_spp_status ON suggested_playbooks(status);
CREATE INDEX IF NOT EXISTS idx_spp_generated_at ON suggested_playbooks(generated_at DESC);

-- Playbooks (production playbooks that can be executed)
CREATE TABLE IF NOT EXISTS playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  triggers JSONB NOT NULL,   -- trigger criteria
  actions JSONB NOT NULL,    -- action sequence
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  active BOOLEAN DEFAULT false,
  metadata JSONB
);
CREATE INDEX IF NOT EXISTS idx_playbooks_active ON playbooks(active);

-- Playbook executions (audit trail)
CREATE TABLE IF NOT EXISTS playbook_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id UUID REFERENCES playbooks(id) ON DELETE SET NULL,
  initiated_by UUID,        -- user or system
  initiated_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'pending', -- pending|running|succeeded|failed|cancelled
  params JSONB,
  result JSONB,
  idempotency_key TEXT,     -- ensure idempotent executions
  metadata JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_playbook_exec_idemp
ON playbook_executions(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_playbook_exec_status ON playbook_executions(status);

-- Approval policies (which actions need what quorum)
CREATE TABLE IF NOT EXISTS approval_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- 'playbook'|'payout'|'bank_action'|...
  threshold_type TEXT NOT NULL DEFAULT 'absolute', -- absolute|percent
  threshold_value NUMERIC NOT NULL, -- e.g. 2 (absolute) or 0.66 (percent)
  require_roles TEXT[] DEFAULT ARRAY['pay_admin','compliance'],
  auto_execute BOOLEAN DEFAULT false, -- if true and threshold satisfied -> auto execute
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Approval requests (a single object to sign)
CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type TEXT NOT NULL, -- 'playbook_activation','payout_override','reverse'
  reference_id UUID,          -- e.g. playbook_id or payout_id
  requested_by UUID NOT NULL,
  requested_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'open', -- open|approved|rejected|expired
  policy_id UUID REFERENCES approval_policies(id),
  required_threshold NUMERIC, -- computed copy of policy threshold at creation
  metadata JSONB
);
CREATE INDEX IF NOT EXISTS idx_approval_req_status ON approval_requests(status);

-- Approval signatures (individual signatures)
CREATE TABLE IF NOT EXISTS approval_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id UUID REFERENCES approval_requests(id) ON DELETE CASCADE,
  signer_user_id UUID NOT NULL,
  signer_roles TEXT[] NOT NULL,
  signed_at TIMESTAMPTZ DEFAULT now(),
  signature_json JSONB, -- optional: signature metadata (consensus / signed token)
  comment TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_unique_signer
ON approval_signatures(approval_request_id, signer_user_id);

-- Link suggestions to event samples (for fast retrieval)
CREATE TABLE IF NOT EXISTS suggested_playbook_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggested_playbook_id UUID REFERENCES suggested_playbooks(id) ON DELETE CASCADE,
  event_sample JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spex_playbook ON suggested_playbook_examples(suggested_playbook_id);

-- SIRA model runs (audit for ML training)
CREATE TABLE IF NOT EXISTS sira_model_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version TEXT NOT NULL,
  dataset_hash TEXT,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metrics JSONB,    -- e.g. {precision:0.92,recall:0.85}
  artifacts JSONB,
  triggered_by TEXT -- 'cron'|'ops'|'manual'
);
CREATE INDEX IF NOT EXISTS idx_sira_runs_version ON sira_model_runs(model_version);

-- Audit logs (if not exists from other briques)
CREATE TABLE IF NOT EXISTS molam_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor UUID,
  action TEXT,
  target_type TEXT,
  target_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON molam_audit_logs(actor);
CREATE INDEX IF NOT EXISTS idx_audit_created ON molam_audit_logs(created_at DESC);

-- Sample approval policies
INSERT INTO approval_policies(entity_type, threshold_type, threshold_value, require_roles, auto_execute)
VALUES
  ('playbook_activation', 'absolute', 2, ARRAY['pay_admin','fraud_ops'], false),
  ('critical_action', 'absolute', 3, ARRAY['pay_admin','compliance','fraud_ops'], false),
  ('low_risk_action', 'absolute', 1, ARRAY['ops'], true)
ON CONFLICT DO NOTHING;

-- Sample suggested playbook
INSERT INTO suggested_playbooks(scenario, confidence, justification, proposed_actions, metadata)
VALUES (
  'massive_chargeback_wave_country_SN',
  0.9250,
  '{"top_features":[{"name":"chargeback_rate_24h","value":0.15},{"name":"country","value":"SN"},{"name":"merchant_count","value":45}],"model_hint":"xgboost_v2.1"}',
  '[
    {"action":"create_alert","params":{"severity":"critical","message":"Massive chargeback wave detected in SN"}},
    {"action":"freeze_accounts_by_list","params":{"reason":"fraud_prevention","dry_run":true}},
    {"action":"escalate_ops","params":{"team":["fraud_ops","pay_admin"]}}
  ]'::jsonb,
  '{"sample_count":120,"detected_window":"2025-01-15T10:00:00Z to 2025-01-15T12:00:00Z"}'::jsonb
)
ON CONFLICT DO NOTHING;
