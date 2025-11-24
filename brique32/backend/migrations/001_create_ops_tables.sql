-- ops_plans: high-level plan
CREATE TABLE ops_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES molam_users(id),
  scope JSONB, -- { type: 'partner'|'zone'|'payout' , id: 'SN-DKR' | partner_id | batch_id }
  actions JSONB NOT NULL, -- ordered list of actions with params
  severity TEXT NOT NULL, -- LOW|MEDIUM|HIGH|CRITICAL
  status TEXT NOT NULL DEFAULT 'draft', -- draft|pending_approval|approved|executing|completed|failed|rolledback|cancelled
  required_approvals INTEGER NOT NULL DEFAULT 1,
  approvals JSONB DEFAULT '[]'::jsonb, -- list of {user_id, role, ts, decision, note, signature}
  dry_run_result JSONB,
  execute_result JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ops_plans_status ON ops_plans(status);
CREATE INDEX idx_ops_plans_created_by ON ops_plans(created_by);

-- ops_actions_log: each action execution result
CREATE TABLE ops_actions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES ops_plans(id),
  action_idx INT NOT NULL, -- index in actions array
  action_name TEXT,
  payload JSONB,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  status TEXT, -- pending|success|failure|skipped
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ops_actions_log_plan ON ops_actions_log(plan_id);

-- ops_audit: append-only immutable audit trail
CREATE TABLE ops_audit (
  id BIGSERIAL PRIMARY KEY,
  event_time TIMESTAMPTZ DEFAULT now(),
  actor UUID, -- molam_users.id or system
  event_type TEXT, -- plan_created, plan_signed, action_executed, rollback_initiated...
  payload JSONB,
  hash TEXT NOT NULL -- sha256 hash of payload + prev_hash chain
);

-- ops_approvals_policy: policy table (who can approve what)
CREATE TABLE ops_approvals_policy (
  id SERIAL PRIMARY KEY,
  severity TEXT NOT NULL,
  required_signatures INT NOT NULL,
  allowed_roles TEXT[] NOT NULL -- e.g ['ops_manager','cto','cfo']
);

-- Insert default policies
INSERT INTO ops_approvals_policy (severity, required_signatures, allowed_roles) VALUES
('LOW', 1, '{"ops_manager","pay_zone_admin"}'),
('MEDIUM', 2, '{"ops_manager","cto","pay_zone_admin"}'),
('HIGH', 2, '{"ops_manager","cto","cfo","pay_zone_admin"}'),
('CRITICAL', 3, '{"cto","cfo","ops_manager"}');