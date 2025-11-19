-- ============================================================================
-- Brique 130 — Treasury Audit & Regulatory Exports
-- ============================================================================

-- Immutable audit logs (append-only, HMAC signed)
CREATE TABLE IF NOT EXISTS treasury_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('payout','reconciliation','sla_alert','float_move','export_generated','settlement','routing_decision')),
  event_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor TEXT NOT NULL,
  entity_id UUID,
  payload JSONB NOT NULL,
  signature TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event_time ON treasury_audit_logs(event_time DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON treasury_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON treasury_audit_logs(actor);

-- Export jobs for regulatory compliance
CREATE TABLE IF NOT EXISTS treasury_export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  format TEXT NOT NULL CHECK (format IN ('BCEAO_CSV','BCEAO_XML','BCE_XML','FED_JSON','SEC_CSV','ISO20022')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  output_s3_key TEXT,
  checksum TEXT,
  file_size_bytes BIGINT,
  requested_by UUID NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_status ON treasury_export_jobs(status);
CREATE INDEX IF NOT EXISTS idx_export_jobs_created ON treasury_export_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_jobs_requested ON treasury_export_jobs(requested_by);

-- Scheduled export configurations
CREATE TABLE IF NOT EXISTS treasury_export_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  format TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly','quarterly')),
  enabled BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- External auditor/regulator access
CREATE TABLE IF NOT EXISTS auditor_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  permissions JSONB DEFAULT '{"can_view":["exports","audit_logs"]}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
  last_access_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auditor_accounts_status ON auditor_accounts(status);

-- Compliance anomalies detected by SIRA
CREATE TABLE IF NOT EXISTS compliance_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  export_job_id UUID REFERENCES treasury_export_jobs(id),
  anomaly_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  detected_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_anomalies_job ON compliance_anomalies(export_job_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_status ON compliance_anomalies(status);
