CREATE TABLE IF NOT EXISTS molam_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  diff JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON molam_audit_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON molam_audit_logs(action, created_at);