/**
 * Brique 50 - Fiscal Reporting & Submission
 * Database Schema
 */

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) Core fiscal reports table
CREATE TABLE IF NOT EXISTS fiscal_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity TEXT NOT NULL,
  country TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  report_type TEXT NOT NULL, -- 'vat_return','withholding','digital_services','tax_statement'
  status TEXT NOT NULL DEFAULT 'generated', -- generated|ready|submitted|accepted|rejected|archived
  canonical_json JSONB NOT NULL, -- canonical payload for audit & resubmit
  artifact_s3_key TEXT, -- CSV/XML/PDF stored in S3 (WORM)
  signed_artifact_s3_key TEXT, -- signed version if HSM signing applied
  locale TEXT DEFAULT 'en',
  currency TEXT DEFAULT 'USD',
  sira_reject_score NUMERIC(5,2), -- predicted rejection probability (0-100)
  created_by UUID, -- Molam ID user
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(legal_entity, report_type, period_start, period_end) -- prevent duplicates
);

CREATE INDEX IF NOT EXISTS idx_fiscal_reports_entity_period ON fiscal_reports(legal_entity, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_fiscal_reports_status ON fiscal_reports(status);
CREATE INDEX IF NOT EXISTS idx_fiscal_reports_country ON fiscal_reports(country);

-- 2) Submission channels for authorities or intermediaries
CREATE TABLE IF NOT EXISTS fiscal_submission_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country TEXT NOT NULL,
  authority TEXT NOT NULL, -- 'DGI SN', 'IRS', 'DGFiP', 'HMRC'
  protocol TEXT NOT NULL, -- 'api','sftp','portal'
  endpoint TEXT NOT NULL, -- base url or host
  vault_ref JSONB NOT NULL, -- pointer to credentials/keys in Vault (not secrets themselves)
  format TEXT NOT NULL, -- 'XML','CSV','PDF','JSON'
  requires_signature BOOLEAN DEFAULT false,
  approval_required BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active', -- active|disabled|maintenance
  priority INT DEFAULT 100, -- lower = higher priority
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(country, authority, protocol)
);

CREATE INDEX IF NOT EXISTS idx_fsc_country_authority ON fiscal_submission_channels(country, authority);
CREATE INDEX IF NOT EXISTS idx_fsc_status ON fiscal_submission_channels(status);

-- 3) Submission attempts/history (idempotent)
CREATE TABLE IF NOT EXISTS fiscal_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES fiscal_reports(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES fiscal_submission_channels(id),
  idempotency_key TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending|submitted|accepted|rejected|error
  external_ref TEXT, -- reference from authority
  response JSONB,
  error_code TEXT,
  error_message TEXT,
  attempt_count INT DEFAULT 0,
  last_attempt TIMESTAMPTZ,
  submitted_by UUID, -- Molam ID user who initiated
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(report_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_submissions_report ON fiscal_submissions(report_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_submissions_status ON fiscal_submissions(status);
CREATE INDEX IF NOT EXISTS idx_fiscal_submissions_channel ON fiscal_submissions(channel_id);

-- 4) Remediation tasks (Ops workflow)
CREATE TABLE IF NOT EXISTS fiscal_remediations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES fiscal_reports(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES fiscal_submissions(id),
  issue_code TEXT NOT NULL, -- 'sira_predicted_reject','submission_error','validation_error','format_error'
  severity TEXT DEFAULT 'medium', -- low|medium|high|critical
  details JSONB,
  assigned_to UUID, -- Molam ID user
  status TEXT DEFAULT 'open', -- open|in_progress|resolved|closed
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fiscal_remediations_report ON fiscal_remediations(report_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_remediations_status ON fiscal_remediations(status);
CREATE INDEX IF NOT EXISTS idx_fiscal_remediations_assigned ON fiscal_remediations(assigned_to);

-- 5) Approval workflow for sensitive submissions
CREATE TABLE IF NOT EXISTS fiscal_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES fiscal_reports(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL, -- Molam ID user
  approver_role TEXT NOT NULL, -- 'finance_admin','compliance_admin'
  status TEXT DEFAULT 'pending', -- pending|approved|rejected
  comments TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_approvals_report ON fiscal_approvals(report_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_approvals_status ON fiscal_approvals(status);

-- 6) Audit log for all fiscal operations
CREATE TABLE IF NOT EXISTS fiscal_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL, -- 'report_generated','report_submitted','approval_granted','remediation_created'
  actor_id UUID, -- Molam ID user
  actor_type TEXT DEFAULT 'user', -- user|system|worker
  resource_type TEXT, -- 'fiscal_report','fiscal_submission','fiscal_remediation'
  resource_id UUID,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_audit_logs_resource ON fiscal_audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_audit_logs_actor ON fiscal_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_audit_logs_created ON fiscal_audit_logs(created_at);

-- Seed some example channels for testing
INSERT INTO fiscal_submission_channels (country, authority, protocol, endpoint, vault_ref, format, requires_signature, approval_required, priority) VALUES
  ('SN', 'DGI SN', 'api', 'https://api-sandbox.dgi.sn/v1', '{"path":"fiscal/sn/dgi"}', 'XML', true, true, 10),
  ('SN', 'DGI SN', 'sftp', 'sftp.dgi.sn', '{"path":"fiscal/sn/dgi-sftp"}', 'CSV', false, true, 20),
  ('FR', 'DGFiP', 'api', 'https://api.impots.gouv.fr/edeclaration/v2', '{"path":"fiscal/fr/dgfip"}', 'XML', true, true, 10),
  ('US', 'IRS', 'portal', 'https://www.irs.gov/efile', '{"path":"fiscal/us/irs"}', 'PDF', false, true, 30),
  ('GB', 'HMRC', 'api', 'https://api.service.hmrc.gov.uk/organisations/vat', '{"path":"fiscal/gb/hmrc"}', 'JSON', false, false, 10)
ON CONFLICT (country, authority, protocol) DO NOTHING;

-- Comments
COMMENT ON TABLE fiscal_reports IS 'Fiscal reports generated for legal entities by period';
COMMENT ON TABLE fiscal_submission_channels IS 'Configured channels for submitting reports to tax authorities';
COMMENT ON TABLE fiscal_submissions IS 'History of all submission attempts with responses';
COMMENT ON TABLE fiscal_remediations IS 'Remediation tasks for rejected or problematic reports';
COMMENT ON TABLE fiscal_approvals IS 'Multi-signature approval workflow for sensitive reports';
COMMENT ON TABLE fiscal_audit_logs IS 'Immutable audit trail of all fiscal operations';
