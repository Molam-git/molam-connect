-- Table d'audit si non existante
CREATE TABLE IF NOT EXISTS molam_audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID,
  action      TEXT NOT NULL,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_audit_actor ON molam_audit_logs (actor_id, created_at);
CREATE INDEX IF NOT EXISTS ix_audit_action ON molam_audit_logs (action, created_at);