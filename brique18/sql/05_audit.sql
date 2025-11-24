-- 05_audit.sql
CREATE TABLE IF NOT EXISTS molam_audit_logs (
  audit_id     BIGSERIAL PRIMARY KEY,
  actor_type   TEXT NOT NULL,                  -- 'AGENT'|'USER'|'SYSTEM'
  actor_id     BIGINT,
  action       TEXT NOT NULL,                  -- 'CASHIN_SELF'|'CASHIN_OTHER'|'CASHOUT'|...
  target_id    BIGINT,
  context      JSONB NOT NULL,
  hash_prev    TEXT,                           -- chaînage immuable
  hash_curr    TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);