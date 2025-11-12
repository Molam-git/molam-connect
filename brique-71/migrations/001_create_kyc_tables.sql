/**
 * Brique 71 - KYC Review Ops UI
 * Industrial-grade KYC/AML compliance system with multi-signature workflow
 */

-- 1) Main KYC requests table
CREATE TABLE IF NOT EXISTS kyc_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,                       -- molam_users.id
  wallet_id UUID,                              -- optional link to wallet
  account_type TEXT NOT NULL,                  -- 'personal', 'professional', 'business', 'bank'
  country TEXT NOT NULL,
  preferred_currency TEXT,
  submitted_by TEXT DEFAULT 'user',            -- 'user', 'partner', 'ops'
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending',      -- pending, in_review, approved, rejected, more_info_required, escalated
  kyc_level TEXT DEFAULT 'P0',                 -- P0 (basic), P1 (id_verified), P2 (pro/business), P3 (bank_partner)
  target_kyc_level TEXT,                       -- Requested upgrade level
  sira_score NUMERIC(6,4),                     -- ML risk score
  sira_decision JSONB,                         -- SIRA decision trace
  assigned_to UUID,                            -- Ops user assigned
  assigned_at TIMESTAMPTZ,
  reviewed_by UUID,                            -- Final reviewer
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,                                  -- Ops internal notes
  metadata JSONB,                              -- Flexible data (legal_entity, tags, etc.)
  priority INT DEFAULT 5,                      -- 1=highest, 10=lowest (SIRA can set)
  snapshot_s3_key TEXT,                        -- Final approved bundle snapshot
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kyc_user ON kyc_requests(user_id);
CREATE INDEX idx_kyc_status ON kyc_requests(status);
CREATE INDEX idx_kyc_assigned ON kyc_requests(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_kyc_priority ON kyc_requests(priority, created_at) WHERE status IN ('pending', 'in_review');
CREATE INDEX idx_kyc_country ON kyc_requests(country);
CREATE INDEX idx_kyc_level ON kyc_requests(kyc_level);

COMMENT ON TABLE kyc_requests IS 'Main KYC/AML review requests with SIRA risk scoring';
COMMENT ON COLUMN kyc_requests.kyc_level IS 'Current KYC level: P0=basic, P1=id_verified, P2=business, P3=bank';
COMMENT ON COLUMN kyc_requests.priority IS '1=urgent (high risk/value), 10=low priority';

-- 2) KYC documents (evidence)
CREATE TABLE IF NOT EXISTS kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kyc_request_id UUID NOT NULL REFERENCES kyc_requests(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,                      -- 'id_front', 'id_back', 'selfie_liveness', 'proof_of_address',
                                                -- 'business_registration', 'bank_letter', 'tax_certificate', 'articles_incorporation'
  s3_key TEXT NOT NULL,                        -- encrypted storage pointer
  s3_bucket TEXT,
  mime_type TEXT,
  file_size BIGINT,
  uploader_id UUID,                            -- Who uploaded (user or ops)
  uploader_role TEXT,
  verified_by UUID,                            -- Ops user who verified
  verified_at TIMESTAMPTZ,
  status TEXT DEFAULT 'uploaded',              -- uploaded, ocr_processing, verified, rejected
  ocr_data JSONB,                              -- Extracted data from OCR
  liveness_score NUMERIC(4,2),                 -- Liveness check score (0-100)
  rejection_reason TEXT,
  expiry_date DATE,                            -- Document expiry (for IDs, licenses)
  encrypted BOOLEAN DEFAULT TRUE,
  redacted_s3_key TEXT,                        -- Redacted version for UI
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_docs_request ON kyc_documents(kyc_request_id);
CREATE INDEX idx_docs_type ON kyc_documents(doc_type);
CREATE INDEX idx_docs_status ON kyc_documents(status);

COMMENT ON TABLE kyc_documents IS 'KYC evidence documents with OCR and liveness data';
COMMENT ON COLUMN kyc_documents.s3_key IS 'Encrypted original document in S3/WORM storage';
COMMENT ON COLUMN kyc_documents.redacted_s3_key IS 'Redacted version for Ops UI display';

-- 3) KYC reviews and actions
CREATE TABLE IF NOT EXISTS kyc_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kyc_request_id UUID NOT NULL REFERENCES kyc_requests(id) ON DELETE CASCADE,
  actor_id UUID,                               -- Ops user ID
  actor_role TEXT,                             -- kyc_ops, kyc_lead, compliance, auditor
  action TEXT NOT NULL,                        -- 'assign', 'verify_doc', 'approve', 'request_info', 'reject', 'escalate', 'add_note'
  notes TEXT,
  evidence JSONB,                              -- Action-specific data (e.g., which docs verified)
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reviews_request ON kyc_reviews(kyc_request_id);
CREATE INDEX idx_reviews_actor ON kyc_reviews(actor_id);
CREATE INDEX idx_reviews_created ON kyc_reviews(created_at DESC);

COMMENT ON TABLE kyc_reviews IS 'All Ops actions on KYC requests (audit trail)';

-- 4) Multi-signature approvals
CREATE TABLE IF NOT EXISTS kyc_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kyc_request_id UUID NOT NULL REFERENCES kyc_requests(id) ON DELETE CASCADE,
  required_signatures INT NOT NULL DEFAULT 1,  -- How many signatures needed
  collected_signatures INT NOT NULL DEFAULT 0,
  required_roles TEXT[],                       -- e.g., ['kyc_lead', 'compliance']
  status TEXT NOT NULL DEFAULT 'pending',      -- pending, approved, rejected
  reason TEXT,                                 -- Why multi-sig required
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kyc_approval_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID NOT NULL REFERENCES kyc_approvals(id) ON DELETE CASCADE,
  signer_id UUID NOT NULL,
  signer_role TEXT NOT NULL,
  signature_method TEXT DEFAULT 'ops_portal',   -- 'ops_portal', 'api', 'cli'
  signature_data JSONB,                         -- IP, timestamp, OTP verification, etc.
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_approval_request ON kyc_approvals(kyc_request_id);
CREATE INDEX idx_approval_status ON kyc_approvals(status);
CREATE INDEX idx_signatures_approval ON kyc_approval_signatures(approval_id);

COMMENT ON TABLE kyc_approvals IS 'Multi-signature approval workflow for high-value/risk KYC';
COMMENT ON TABLE kyc_approval_signatures IS 'Individual signatures for multi-sig approvals';

-- 5) Immutable audit log (append-only)
CREATE TABLE IF NOT EXISTS kyc_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kyc_request_id UUID NOT NULL,
  actor_id UUID,
  actor_role TEXT,
  action TEXT NOT NULL,                        -- 'created', 'assigned', 'document_uploaded', 'document_verified',
                                                -- 'approved', 'rejected', 'escalated', 'revoked'
  payload JSONB,                               -- Action details
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_request ON kyc_audit(kyc_request_id);
CREATE INDEX idx_audit_created ON kyc_audit(created_at DESC);
CREATE INDEX idx_audit_action ON kyc_audit(action);

COMMENT ON TABLE kyc_audit IS 'Immutable append-only audit log for compliance';

-- 6) KYC configuration per legal entity/merchant
CREATE TABLE IF NOT EXISTS kyc_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity TEXT NOT NULL,                  -- 'molam_sn', 'molam_ci', etc.
  country TEXT NOT NULL,
  account_type TEXT NOT NULL,                  -- 'personal', 'professional', 'business'
  auto_approve_enabled BOOLEAN DEFAULT FALSE,
  auto_approve_threshold NUMERIC(6,4) DEFAULT 0.2000,  -- SIRA score threshold
  multi_sig_required_for_p2 BOOLEAN DEFAULT TRUE,
  multi_sig_required_for_p3 BOOLEAN DEFAULT TRUE,
  multi_sig_amount_threshold NUMERIC(18,2),    -- Require multi-sig for amounts above this
  required_documents TEXT[],                   -- e.g., ['id_front', 'id_back', 'proof_of_address']
  ocr_enabled BOOLEAN DEFAULT TRUE,
  liveness_required BOOLEAN DEFAULT TRUE,
  liveness_threshold NUMERIC(4,2) DEFAULT 70.00,
  doc_expiry_warning_days INT DEFAULT 90,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (legal_entity, country, account_type)
);

CREATE INDEX idx_config_entity ON kyc_config(legal_entity, country);

COMMENT ON TABLE kyc_config IS 'KYC policy configuration per legal entity and account type';

-- 7) KYC levels definition (reference table)
CREATE TABLE IF NOT EXISTS kyc_levels (
  level_code TEXT PRIMARY KEY,                 -- P0, P1, P2, P3
  level_name TEXT NOT NULL,
  description TEXT,
  capabilities JSONB,                          -- What this level enables
  required_documents TEXT[],
  max_transaction_amount NUMERIC(18,2),
  max_daily_volume NUMERIC(18,2),
  requires_approval BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO kyc_levels (level_code, level_name, description, capabilities, required_documents, max_transaction_amount, max_daily_volume) VALUES
('P0', 'Basic', 'Email and phone verified', '{"can_receive": true, "can_send": false, "can_payout": false}'::jsonb, ARRAY[]::TEXT[], 0, 0),
('P1', 'ID Verified', 'Government ID verified', '{"can_receive": true, "can_send": true, "can_payout": true, "max_payout": 1000}'::jsonb, ARRAY['id_front', 'id_back', 'selfie_liveness'], 1000, 5000),
('P2', 'Professional/Business', 'Business registration verified', '{"can_receive": true, "can_send": true, "can_payout": true, "max_payout": 50000, "instant_payout": true}'::jsonb, ARRAY['id_front', 'id_back', 'business_registration', 'tax_certificate'], 50000, 200000),
('P3', 'Bank Partner', 'Banking license verified', '{"can_receive": true, "can_send": true, "can_payout": true, "unlimited": true, "instant_payout": true}'::jsonb, ARRAY['bank_letter', 'banking_license', 'articles_incorporation'], NULL, NULL)
ON CONFLICT (level_code) DO NOTHING;

COMMENT ON TABLE kyc_levels IS 'KYC level definitions with capabilities and limits';

-- 8) SIRA feedback for ML training
CREATE TABLE IF NOT EXISTS kyc_sira_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kyc_request_id UUID NOT NULL REFERENCES kyc_requests(id),
  user_id UUID NOT NULL,
  features JSONB NOT NULL,                     -- Input features for SIRA
  prediction JSONB NOT NULL,                   -- SIRA output (score, action, reasoning)
  actual_outcome TEXT,                         -- approved, rejected, escalated
  outcome_at TIMESTAMPTZ,
  model_version TEXT DEFAULT 'sira-kyc-v1.0',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sira_feedback_model ON kyc_sira_feedback(model_version, created_at DESC);
CREATE INDEX idx_sira_feedback_outcome ON kyc_sira_feedback(actual_outcome);

COMMENT ON TABLE kyc_sira_feedback IS 'Training data for SIRA KYC risk models';

-- Trigger: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_kyc_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_kyc_request_updated
  BEFORE UPDATE ON kyc_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_kyc_updated_at();

CREATE TRIGGER trigger_kyc_document_updated
  BEFORE UPDATE ON kyc_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_kyc_updated_at();

CREATE TRIGGER trigger_kyc_approval_updated
  BEFORE UPDATE ON kyc_approvals
  FOR EACH ROW
  EXECUTE FUNCTION update_kyc_updated_at();

-- Function: Create audit log on status change
CREATE OR REPLACE FUNCTION create_kyc_audit_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO kyc_audit (kyc_request_id, actor_role, action, payload)
    VALUES (
      NEW.id,
      'system',
      'status_changed',
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'kyc_level', NEW.kyc_level
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_audit_status_change
  AFTER UPDATE ON kyc_requests
  FOR EACH ROW
  EXECUTE FUNCTION create_kyc_audit_on_status_change();

-- Function: Check if required documents are uploaded
CREATE OR REPLACE FUNCTION check_required_documents(request_id UUID, account_type_param TEXT, country_param TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  required_docs TEXT[];
  uploaded_doc_types TEXT[];
  missing_docs TEXT[];
BEGIN
  -- Get required documents for this account type
  SELECT required_documents INTO required_docs
  FROM kyc_config
  WHERE account_type = account_type_param AND country = country_param
  LIMIT 1;

  IF required_docs IS NULL THEN
    required_docs := ARRAY['id_front', 'id_back', 'proof_of_address'];
  END IF;

  -- Get uploaded document types
  SELECT ARRAY_AGG(DISTINCT doc_type) INTO uploaded_doc_types
  FROM kyc_documents
  WHERE kyc_request_id = request_id AND status IN ('uploaded', 'verified');

  -- Check for missing documents
  SELECT ARRAY(
    SELECT unnest(required_docs)
    EXCEPT
    SELECT unnest(COALESCE(uploaded_doc_types, ARRAY[]::TEXT[]))
  ) INTO missing_docs;

  RETURN array_length(missing_docs, 1) IS NULL OR array_length(missing_docs, 1) = 0;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_required_documents IS 'Verify all required documents are uploaded for KYC request';

-- Insert default KYC configurations
INSERT INTO kyc_config (legal_entity, country, account_type, auto_approve_enabled, required_documents, ocr_enabled, liveness_required) VALUES
('molam_sn', 'SN', 'personal', TRUE, ARRAY['id_front', 'id_back', 'selfie_liveness'], TRUE, TRUE),
('molam_sn', 'SN', 'professional', FALSE, ARRAY['id_front', 'id_back', 'business_registration', 'tax_certificate'], TRUE, FALSE),
('molam_sn', 'SN', 'business', FALSE, ARRAY['business_registration', 'articles_incorporation', 'tax_certificate', 'bank_letter'], TRUE, FALSE),
('molam_ci', 'CI', 'personal', TRUE, ARRAY['id_front', 'id_back', 'selfie_liveness'], TRUE, TRUE),
('molam_ci', 'CI', 'professional', FALSE, ARRAY['id_front', 'id_back', 'business_registration'], TRUE, FALSE)
ON CONFLICT (legal_entity, country, account_type) DO NOTHING;

-- Views for Ops dashboards

-- View: Pending queue with priority and wait time
CREATE OR REPLACE VIEW kyc_ops_queue AS
SELECT
  r.id,
  r.user_id,
  r.account_type,
  r.country,
  r.status,
  r.kyc_level,
  r.target_kyc_level,
  r.sira_score,
  r.priority,
  r.assigned_to,
  r.submitted_at,
  EXTRACT(EPOCH FROM (NOW() - r.submitted_at))/3600 AS hours_waiting,
  COUNT(DISTINCT d.id) AS documents_count,
  COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'verified') AS documents_verified,
  COALESCE(a.required_signatures, 0) AS required_signatures,
  COALESCE(a.collected_signatures, 0) AS collected_signatures
FROM kyc_requests r
LEFT JOIN kyc_documents d ON r.id = d.kyc_request_id
LEFT JOIN kyc_approvals a ON r.id = a.kyc_request_id AND a.status = 'pending'
WHERE r.status IN ('pending', 'in_review', 'more_info_required')
GROUP BY r.id, a.required_signatures, a.collected_signatures
ORDER BY r.priority ASC, r.submitted_at ASC;

COMMENT ON VIEW kyc_ops_queue IS 'Ops queue view with priority and document status';

-- Comments on key columns
COMMENT ON COLUMN kyc_requests.status IS 'Lifecycle: pending → in_review → approved/rejected/more_info_required';
COMMENT ON COLUMN kyc_documents.liveness_score IS 'Face liveness detection score 0-100 (>70 = pass)';
COMMENT ON COLUMN kyc_approvals.required_roles IS 'Roles that must sign (e.g., [kyc_lead, compliance])';
