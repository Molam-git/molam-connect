-- Brique 90 — Payouts Compliance & AML Flow
-- SQL Schema for compliance and anti-money laundering operations

-- ============================================================================
-- 1. COMPLIANCE CASES (Core entity for case management)
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code TEXT UNIQUE NOT NULL, -- CASE-YYYYMMDD-XXXX

  -- Origin tracking
  origin_module TEXT NOT NULL, -- 'treasury','connect','wallet','shop','eats'
  origin_entity_id UUID, -- user_id / merchant_id / agent_id
  origin_txn_id UUID, -- payout_id / wallet_txn_id / withdrawal_id
  origin_txn_type TEXT, -- 'payout','withdrawal','transfer'

  -- Case classification
  case_type TEXT NOT NULL, -- 'sanctions','kyc_level','pep','threshold','adverse_media','other'
  risk_level TEXT NOT NULL DEFAULT 'medium', -- 'low','medium','high','critical'
  priority INT NOT NULL DEFAULT 50, -- 0-100, higher = more urgent

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'opened',
  -- opened → in_review → actioned → closed
  current_hold_type TEXT, -- 'soft_hold','hard_hold','freeze', NULL if none

  -- Assignment
  assigned_to UUID, -- Molam ID user (compliance_ops role)
  assigned_at TIMESTAMPTZ,

  -- SIRA integration
  sira_recommendation JSONB, -- {recommendation:'approve|hold|block', confidence:0-1, model_version}
  sira_auto_applied BOOLEAN DEFAULT FALSE,

  -- Resolution
  resolution TEXT, -- 'approved','rejected','referred','escalated'
  resolution_reason TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,

  -- Timing & SLA
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sla_due_at TIMESTAMPTZ, -- auto-calculated based on risk_level

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  CONSTRAINT valid_status CHECK (status IN ('opened','in_review','actioned','closed','escalated')),
  CONSTRAINT valid_hold_type CHECK (current_hold_type IS NULL OR current_hold_type IN ('soft_hold','hard_hold','freeze')),
  CONSTRAINT valid_resolution CHECK (resolution IS NULL OR resolution IN ('approved','rejected','referred','escalated'))
);

CREATE INDEX IF NOT EXISTS idx_compliance_status_priority ON compliance_cases(status, priority DESC) WHERE status NOT IN ('closed');
CREATE INDEX IF NOT EXISTS idx_compliance_assigned ON compliance_cases(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compliance_origin_txn ON compliance_cases(origin_txn_id);
CREATE INDEX IF NOT EXISTS idx_compliance_sla ON compliance_cases(sla_due_at) WHERE sla_due_at IS NOT NULL AND status NOT IN ('closed');
CREATE INDEX IF NOT EXISTS idx_compliance_created ON compliance_cases(created_at DESC);

COMMENT ON TABLE compliance_cases IS 'Core compliance case management for AML/KYC/sanctions screening';

-- ============================================================================
-- 2. CASE EVIDENCE & NOTES
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES compliance_cases(id) ON DELETE CASCADE,

  -- Uploader
  uploader_id UUID NOT NULL, -- Molam ID
  uploader_role TEXT, -- 'compliance_ops','compliance_admin','system'

  -- Evidence details
  evidence_type TEXT NOT NULL, -- 'document','screenshot','bank_statement','kyc_doc','note','system_log'
  s3_key TEXT, -- Encrypted file pointer (PII)
  file_name TEXT,
  file_size_bytes INT,
  file_hash TEXT, -- SHA256

  -- Encryption
  encrypted BOOLEAN DEFAULT TRUE,
  encryption_key_id TEXT, -- KMS key ID

  -- Metadata
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_evidence_type CHECK (evidence_type IN ('document','screenshot','bank_statement','kyc_doc','note','system_log','other'))
);

CREATE INDEX IF NOT EXISTS idx_evidence_case ON compliance_evidence(case_id, created_at DESC);

COMMENT ON TABLE compliance_evidence IS 'Evidence and supporting documents for compliance cases';

-- Notes table (immutable audit trail)
CREATE TABLE IF NOT EXISTS compliance_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES compliance_cases(id) ON DELETE CASCADE,

  -- Author
  author_id UUID NOT NULL,
  author_role TEXT NOT NULL,

  -- Note content
  note TEXT NOT NULL,
  note_type TEXT NOT NULL DEFAULT 'comment', -- 'comment','decision','escalation','system'

  -- Associated action
  action TEXT, -- 'approve','reject','request_more','refer','escalate','assign'

  -- Immutability
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_action CHECK (action IS NULL OR action IN ('approve','reject','request_more','refer','escalate','assign','close'))
);

CREATE INDEX IF NOT EXISTS idx_notes_case ON compliance_notes(case_id, created_at DESC);

COMMENT ON TABLE compliance_notes IS 'Immutable notes and decision trail for compliance cases';

-- ============================================================================
-- 3. SCREENING RESULTS (Immutable sanctions/PEP screening logs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS screening_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Linkage
  case_id UUID REFERENCES compliance_cases(id), -- NULL if screening-only
  origin_txn_id UUID, -- payout_id / wallet_txn_id
  origin_entity_id UUID, -- user being screened

  -- Screening provider
  provider TEXT NOT NULL, -- 'ofac','world_check','eu_sanctions','pep_list','internal','sira'
  provider_request_id TEXT, -- External request ID for traceability

  -- Screening input (hashed/normalized)
  screened_name TEXT,
  screened_name_normalized TEXT, -- For fuzzy matching
  screened_country TEXT,
  screened_iban TEXT,
  screened_dob DATE,

  -- Results
  raw_response JSONB NOT NULL, -- Full provider response
  match_score NUMERIC(5,2), -- Normalized 0-100
  matched_entity TEXT, -- Name of matched entity from list
  matched_list TEXT, -- 'OFAC SDN','EU Sanctions','PEP Database', etc.
  matched_details JSONB, -- Additional match details

  -- Classification
  status TEXT NOT NULL, -- 'no_match','possible_match','definite_match','error'

  -- Performance
  latency_ms INT,
  cached BOOLEAN DEFAULT FALSE,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_screening_status CHECK (status IN ('no_match','possible_match','definite_match','error'))
);

CREATE INDEX IF NOT EXISTS idx_screening_txn ON screening_results(origin_txn_id);
CREATE INDEX IF NOT EXISTS idx_screening_entity ON screening_results(origin_entity_id);
CREATE INDEX IF NOT EXISTS idx_screening_case ON screening_results(case_id) WHERE case_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_screening_normalized_name ON screening_results(screened_name_normalized) WHERE screened_name_normalized IS NOT NULL;

COMMENT ON TABLE screening_results IS 'Immutable log of all sanctions and PEP screening results';

-- ============================================================================
-- 4. COMPLIANCE HOLDS (Ledger hold tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Origin transaction
  origin_txn_id UUID NOT NULL, -- payout_id / wallet_txn_id
  origin_txn_type TEXT NOT NULL, -- 'payout','withdrawal','transfer'
  origin_amount NUMERIC(18,2),
  origin_currency TEXT,

  -- Case linkage
  case_id UUID REFERENCES compliance_cases(id),

  -- Hold details
  hold_type TEXT NOT NULL, -- 'soft_hold','hard_hold','freeze'
  hold_reason TEXT NOT NULL,

  -- Ledger integration
  ledger_hold_id UUID, -- Reference to ledger_holds table (B89/B88)

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'active', -- 'active','released','expired'
  created_by UUID, -- User or system
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Release tracking
  released_by UUID,
  released_at TIMESTAMPTZ,
  release_reason TEXT,
  auto_released BOOLEAN DEFAULT FALSE,

  -- Expiry (for soft holds)
  expires_at TIMESTAMPTZ,

  CONSTRAINT valid_hold_type CHECK (hold_type IN ('soft_hold','hard_hold','freeze')),
  CONSTRAINT valid_hold_status CHECK (status IN ('active','released','expired'))
);

CREATE INDEX IF NOT EXISTS idx_holds_origin ON compliance_holds(origin_txn_id);
CREATE INDEX IF NOT EXISTS idx_holds_case ON compliance_holds(case_id) WHERE case_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_holds_active ON compliance_holds(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_holds_expires ON compliance_holds(expires_at) WHERE expires_at IS NOT NULL AND status = 'active';

COMMENT ON TABLE compliance_holds IS 'Compliance-related transaction holds with ledger integration';

-- ============================================================================
-- 5. AML RULES (Configurable by Ops)
-- ============================================================================

CREATE TABLE IF NOT EXISTS aml_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Rule identification
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  priority INT DEFAULT 100, -- Higher priority rules evaluated first

  -- Scope
  country TEXT, -- ISO 3166-1 alpha-2, NULL = global
  currency TEXT, -- ISO 4217, NULL = global
  origin_module TEXT, -- 'treasury','wallet', NULL = all

  -- Thresholds
  min_amount NUMERIC(18,2), -- Screening threshold
  hard_hold_amount NUMERIC(18,2), -- Hard hold threshold
  freeze_amount NUMERIC(18,2), -- Immediate freeze threshold

  -- KYC requirements
  kyc_required_level INT, -- Minimum KYC level (0-3)

  -- Screening flags
  pep_check BOOLEAN DEFAULT TRUE,
  sanction_check BOOLEAN DEFAULT TRUE,
  adverse_media_check BOOLEAN DEFAULT FALSE,

  -- Auto-actions
  auto_approve_below NUMERIC(18,2), -- Auto-approve if score below this
  auto_hold_above NUMERIC(18,2), -- Auto-hold if score above this

  -- SLA
  sla_hours INT DEFAULT 24, -- Case resolution SLA in hours

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,

  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_aml_rules_active ON aml_rules(active, priority DESC);
CREATE INDEX IF NOT EXISTS idx_aml_rules_country ON aml_rules(country) WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_aml_rules_currency ON aml_rules(currency) WHERE currency IS NOT NULL;

COMMENT ON TABLE aml_rules IS 'Configurable AML rules for compliance gating';

-- ============================================================================
-- 6. COMPLIANCE AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context
  case_id UUID REFERENCES compliance_cases(id),
  origin_txn_id UUID,

  -- Actor
  actor_id UUID, -- Molam ID user or 'system'
  actor_role TEXT,
  actor_ip TEXT,

  -- Action
  action TEXT NOT NULL, -- 'case_created','case_assigned','screening_run','hold_created','hold_released','approval','rejection'
  action_category TEXT NOT NULL, -- 'case_management','screening','hold_management','decision'

  -- Details
  details JSONB DEFAULT '{}'::jsonb,

  -- Context
  user_agent TEXT,

  -- Immutable timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_action_category CHECK (action_category IN ('case_management','screening','hold_management','decision','system'))
);

CREATE INDEX IF NOT EXISTS idx_audit_case ON compliance_audit(case_id) WHERE case_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_txn ON compliance_audit(origin_txn_id) WHERE origin_txn_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_actor ON compliance_audit(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_created ON compliance_audit(created_at DESC);

COMMENT ON TABLE compliance_audit IS 'Immutable audit log for all compliance operations';

-- ============================================================================
-- 7. CASE APPROVALS (Multi-signature tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES compliance_cases(id) ON DELETE CASCADE,

  -- Approver
  approver_id UUID NOT NULL,
  approver_role TEXT NOT NULL,

  -- Approval details
  approval_type TEXT NOT NULL, -- 'approve','reject','escalate'
  comment TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_approval_type CHECK (approval_type IN ('approve','reject','escalate'))
);

CREATE INDEX IF NOT EXISTS idx_approvals_case ON compliance_approvals(case_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_approvals_unique ON compliance_approvals(case_id, approver_id);

COMMENT ON TABLE compliance_approvals IS 'Multi-signature approval tracking for compliance cases';

-- ============================================================================
-- 8. SCREENING CACHE (Performance optimization)
-- ============================================================================

CREATE TABLE IF NOT EXISTS screening_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cache key (normalized fingerprint)
  fingerprint TEXT UNIQUE NOT NULL, -- Hash of (name_normalized + country + dob)

  -- Cached screening result
  provider TEXT NOT NULL,
  match_score NUMERIC(5,2),
  matched_entity TEXT,
  status TEXT NOT NULL,
  raw_response JSONB,

  -- Cache metadata
  hit_count INT DEFAULT 0,
  last_hit_at TIMESTAMPTZ,

  -- TTL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT valid_cache_status CHECK (status IN ('no_match','possible_match','definite_match'))
);

CREATE INDEX IF NOT EXISTS idx_cache_fingerprint ON screening_cache(fingerprint);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON screening_cache(expires_at);

COMMENT ON TABLE screening_cache IS 'Screening results cache for performance optimization';

-- ============================================================================
-- 9. HIGH-RISK ENTITIES LIST (Watchlist)
-- ============================================================================

CREATE TABLE IF NOT EXISTS high_risk_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Entity identification
  entity_type TEXT NOT NULL, -- 'individual','business','country','iban'
  entity_name TEXT,
  entity_country TEXT,
  entity_iban TEXT,
  entity_id UUID, -- Internal user/merchant ID if known

  -- Risk classification
  risk_level TEXT NOT NULL, -- 'high','critical'
  risk_reason TEXT NOT NULL,

  -- List source
  list_source TEXT NOT NULL, -- 'internal','ofac','eu_sanctions','pep','adverse_media'
  list_date DATE,

  -- Auto-action
  auto_action TEXT NOT NULL DEFAULT 'hold', -- 'hold','freeze','block'

  -- Lifecycle
  active BOOLEAN DEFAULT TRUE,
  added_by UUID,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ,
  removed_by UUID,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  CONSTRAINT valid_entity_type CHECK (entity_type IN ('individual','business','country','iban','other')),
  CONSTRAINT valid_risk_level CHECK (risk_level IN ('high','critical')),
  CONSTRAINT valid_auto_action CHECK (auto_action IN ('hold','freeze','block'))
);

CREATE INDEX IF NOT EXISTS idx_high_risk_active ON high_risk_entities(active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_high_risk_entity_id ON high_risk_entities(entity_id) WHERE entity_id IS NOT NULL;

COMMENT ON TABLE high_risk_entities IS 'Internal watchlist of high-risk entities';

-- ============================================================================
-- 10. HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate SLA due time based on risk level
CREATE OR REPLACE FUNCTION calculate_sla_due(risk_level TEXT, sla_hours INT DEFAULT 24)
RETURNS TIMESTAMPTZ AS $$
BEGIN
  CASE risk_level
    WHEN 'critical' THEN
      RETURN now() + INTERVAL '4 hours';
    WHEN 'high' THEN
      RETURN now() + INTERVAL '12 hours';
    WHEN 'medium' THEN
      RETURN now() + (sla_hours || ' hours')::INTERVAL;
    WHEN 'low' THEN
      RETURN now() + INTERVAL '48 hours';
    ELSE
      RETURN now() + INTERVAL '24 hours';
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Function to check if case requires multi-signature
CREATE OR REPLACE FUNCTION requires_multi_sig(p_case_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_case RECORD;
  v_approval_count INT;
  v_required_approvals INT := 2; -- Default quorum
BEGIN
  SELECT * INTO v_case FROM compliance_cases WHERE id = p_case_id;

  IF v_case IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Critical cases require 2+ approvals
  IF v_case.risk_level = 'critical' OR v_case.current_hold_type = 'freeze' THEN
    v_required_approvals := 2;
  ELSE
    v_required_approvals := 1;
  END IF;

  SELECT COUNT(*) INTO v_approval_count
  FROM compliance_approvals
  WHERE case_id = p_case_id AND approval_type = 'approve';

  RETURN v_approval_count < v_required_approvals;
END;
$$ LANGUAGE plpgsql;

-- Function to normalize name for fuzzy matching
CREATE OR REPLACE FUNCTION normalize_name(p_name TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Remove special characters, convert to uppercase, trim
  RETURN UPPER(TRIM(REGEXP_REPLACE(p_name, '[^a-zA-Z0-9 ]', '', 'g')));
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 11. TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_compliance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER compliance_cases_updated_at
BEFORE UPDATE ON compliance_cases
FOR EACH ROW
EXECUTE FUNCTION update_compliance_updated_at();

CREATE TRIGGER aml_rules_updated_at
BEFORE UPDATE ON aml_rules
FOR EACH ROW
EXECUTE FUNCTION update_compliance_updated_at();

-- Auto-set SLA due time on case creation
CREATE OR REPLACE FUNCTION set_sla_due()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sla_due_at IS NULL THEN
    NEW.sla_due_at := calculate_sla_due(NEW.risk_level);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER compliance_cases_sla
BEFORE INSERT ON compliance_cases
FOR EACH ROW
EXECUTE FUNCTION set_sla_due();

-- Auto-expire screening cache
CREATE OR REPLACE FUNCTION expire_screening_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM screening_cache WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 12. SEED DATA - DEFAULT AML RULES
-- ============================================================================

-- Global high-value threshold rule
INSERT INTO aml_rules (name, description, country, currency, min_amount, hard_hold_amount, freeze_amount, kyc_required_level, priority)
VALUES
  ('global_high_value', 'Global high-value transaction screening', NULL, NULL, 2000, 20000, 100000, 2, 100),
  ('us_aml_standard', 'US AML compliance thresholds', 'US', 'USD', 1000, 10000, 50000, 2, 200),
  ('eu_aml_standard', 'EU AML compliance thresholds', NULL, 'EUR', 1000, 10000, 50000, 2, 200),
  ('high_risk_countries', 'High-risk country thresholds', NULL, NULL, 500, 5000, 25000, 3, 300)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 13. MATERIALIZED VIEW - COMPLIANCE METRICS
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS compliance_metrics AS
SELECT
  DATE(created_at) as metric_date,
  case_type,
  risk_level,
  status,
  resolution,
  COUNT(*) as case_count,
  AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) / 3600 as avg_resolution_hours,
  COUNT(*) FILTER (WHERE resolved_at IS NOT NULL AND resolved_at <= sla_due_at) as met_sla_count,
  COUNT(*) FILTER (WHERE resolved_at IS NOT NULL AND resolved_at > sla_due_at) as missed_sla_count
FROM compliance_cases
GROUP BY DATE(created_at), case_type, risk_level, status, resolution;

CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_metrics_unique
ON compliance_metrics(metric_date, case_type, risk_level, status, COALESCE(resolution, 'pending'));

COMMENT ON MATERIALIZED VIEW compliance_metrics IS 'Daily compliance metrics for monitoring and reporting';

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_compliance_metrics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY compliance_metrics;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMPLETION
-- ============================================================================

COMMENT ON SCHEMA public IS 'Brique 90 - Payouts Compliance & AML Flow - Schema v1.0';
