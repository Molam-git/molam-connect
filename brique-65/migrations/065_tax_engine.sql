-- ============================================================================
-- Brique 65 — Tax & Compliance Engine (Connect)
-- ============================================================================
-- Purpose: Tax calculation, withholding, and compliance reporting
-- Features: Multi-jurisdiction, rule versioning, automated reporting
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- TABLE: tax_jurisdictions
-- Purpose: Define tax jurisdictions (countries/regions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tax_jurisdictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  country_codes TEXT[],
  default BOOLEAN DEFAULT false,
  currency TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tax_jurisdictions_countries ON tax_jurisdictions USING GIN(country_codes);
CREATE INDEX idx_tax_jurisdictions_default ON tax_jurisdictions(default) WHERE default = true;

-- ============================================================================
-- TABLE: tax_rules
-- Purpose: Define tax calculation rules with versioning
-- ============================================================================
CREATE TABLE IF NOT EXISTS tax_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id UUID REFERENCES tax_jurisdictions(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT,
  applies_to TEXT[] NOT NULL,
  is_percentage BOOLEAN DEFAULT true,
  rate NUMERIC(18,6),
  fixed_amount NUMERIC(18,6),
  reverse_charge BOOLEAN DEFAULT false,
  exempt_conditions JSONB,
  effective_from DATE NOT NULL,
  effective_to DATE,
  rule_version INTEGER NOT NULL DEFAULT 1,
  metadata JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tax_rules_jurisdiction ON tax_rules(jurisdiction_id);
CREATE INDEX idx_tax_rules_applies_to ON tax_rules USING GIN(applies_to);
CREATE INDEX idx_tax_rules_effective ON tax_rules(effective_from, effective_to);
CREATE INDEX idx_tax_rules_active ON tax_rules(jurisdiction_id, effective_from)
  WHERE effective_to IS NULL;

-- ============================================================================
-- TABLE: tax_rule_snapshots
-- Purpose: Audit trail for tax rule changes
-- ============================================================================
CREATE TABLE IF NOT EXISTS tax_rule_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_rule_id UUID REFERENCES tax_rules(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL,
  taken_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tax_rule_snapshots_rule ON tax_rule_snapshots(tax_rule_id, taken_at DESC);

-- ============================================================================
-- TABLE: tax_decisions
-- Purpose: Store computed tax for each transaction
-- ============================================================================
CREATE TABLE IF NOT EXISTS tax_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connect_tx_id UUID NOT NULL UNIQUE,
  merchant_id UUID,
  buyer_country TEXT,
  jurisdiction_id UUID REFERENCES tax_jurisdictions(id),
  rules_applied JSONB NOT NULL,
  tax_lines JSONB NOT NULL,
  total_tax NUMERIC(18,6) NOT NULL,
  currency TEXT NOT NULL,
  rounding_info JSONB,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tax_decisions_tx ON tax_decisions(connect_tx_id);
CREATE INDEX idx_tax_decisions_merchant ON tax_decisions(merchant_id, computed_at DESC);
CREATE INDEX idx_tax_decisions_jurisdiction ON tax_decisions(jurisdiction_id, computed_at::date);
CREATE INDEX idx_tax_decisions_date ON tax_decisions(computed_at::date);

-- ============================================================================
-- TABLE: withholding_reservations
-- Purpose: Track tax withholdings for payouts
-- ============================================================================
CREATE TABLE IF NOT EXISTS withholding_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID,
  connect_tx_id UUID,
  merchant_id UUID,
  amount NUMERIC(18,6) NOT NULL,
  currency TEXT NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'reserved' CHECK (status IN ('reserved','released','paid_to_authority')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ
);

CREATE INDEX idx_withholding_payout ON withholding_reservations(payout_id);
CREATE INDEX idx_withholding_merchant ON withholding_reservations(merchant_id, status);
CREATE INDEX idx_withholding_status ON withholding_reservations(status) WHERE status = 'reserved';

-- ============================================================================
-- TABLE: tax_reports
-- Purpose: Track generated tax reports for filing
-- ============================================================================
CREATE TABLE IF NOT EXISTS tax_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id UUID REFERENCES tax_jurisdictions(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  format TEXT NOT NULL,
  s3_key TEXT,
  status TEXT DEFAULT 'prepared' CHECK (status IN ('prepared','submitted','accepted','rejected')),
  row_count INTEGER,
  total_tax NUMERIC(18,6),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,

  CONSTRAINT valid_period CHECK (period_end >= period_start)
);

CREATE INDEX idx_tax_reports_jurisdiction ON tax_reports(jurisdiction_id, period_start);
CREATE INDEX idx_tax_reports_status ON tax_reports(status, created_at DESC);

-- ============================================================================
-- TABLE: fx_rates (for multi-currency tax calculations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS fx_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of_date DATE NOT NULL,
  base_currency TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  rate NUMERIC(18,8) NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(as_of_date, base_currency, quote_currency)
);

CREATE INDEX idx_fx_rates_lookup ON fx_rates(as_of_date, base_currency, quote_currency);

-- ============================================================================
-- TABLE: molam_audit_logs (if not exists from other briques)
-- ============================================================================
CREATE TABLE IF NOT EXISTS molam_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brique_id TEXT NOT NULL,
  actor UUID,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_brique65 ON molam_audit_logs(brique_id, created_at DESC)
  WHERE brique_id = 'brique-65';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Updated_at trigger for tax_jurisdictions
CREATE OR REPLACE FUNCTION update_tax_jurisdictions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tax_jurisdictions_updated_at
  BEFORE UPDATE ON tax_jurisdictions
  FOR EACH ROW
  EXECUTE FUNCTION update_tax_jurisdictions_updated_at();

-- Snapshot trigger for tax_rules changes
CREATE OR REPLACE FUNCTION create_tax_rule_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO tax_rule_snapshots(tax_rule_id, snapshot)
  VALUES (
    OLD.id,
    jsonb_build_object(
      'code', OLD.code,
      'rate', OLD.rate,
      'effective_from', OLD.effective_from,
      'effective_to', OLD.effective_to,
      'rule_version', OLD.rule_version,
      'changed_at', NOW()
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tax_rule_snapshot
  AFTER UPDATE ON tax_rules
  FOR EACH ROW
  WHEN (OLD.rate IS DISTINCT FROM NEW.rate OR
        OLD.effective_to IS DISTINCT FROM NEW.effective_to)
  EXECUTE FUNCTION create_tax_rule_snapshot();

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Example: Senegal VAT
INSERT INTO tax_jurisdictions(id, code, name, country_codes, default, currency)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'SN',
  'Senegal',
  ARRAY['SN'],
  true,
  'XOF'
) ON CONFLICT (code) DO NOTHING;

-- Standard VAT rate for Senegal (18%)
INSERT INTO tax_rules(
  id,
  jurisdiction_id,
  code,
  description,
  applies_to,
  is_percentage,
  rate,
  effective_from,
  rule_version
) VALUES (
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001',
  'VAT_STD',
  'Standard VAT rate for Senegal',
  ARRAY['payment','charge','refund'],
  true,
  18.000000,
  '2020-01-01',
  1
) ON CONFLICT DO NOTHING;

-- Example: US Sales Tax (California - 7.25%)
INSERT INTO tax_jurisdictions(code, name, country_codes, currency)
VALUES ('US_CA', 'California, USA', ARRAY['US'], 'USD')
ON CONFLICT (code) DO NOTHING;

-- Example: EU VAT (France - 20%)
INSERT INTO tax_jurisdictions(code, name, country_codes, currency)
VALUES ('FR', 'France', ARRAY['FR'], 'EUR')
ON CONFLICT (code) DO NOTHING;

INSERT INTO tax_rules(
  jurisdiction_id,
  code,
  description,
  applies_to,
  is_percentage,
  rate,
  effective_from
)
SELECT id, 'VAT_FR', 'French VAT', ARRAY['payment'], true, 20.000000, '2020-01-01'
FROM tax_jurisdictions WHERE code = 'FR'
ON CONFLICT DO NOTHING;

-- Sample FX rates
INSERT INTO fx_rates(as_of_date, base_currency, quote_currency, rate, source)
VALUES
  (CURRENT_DATE, 'USD', 'XOF', 620.00, 'manual'),
  (CURRENT_DATE, 'EUR', 'XOF', 655.95, 'manual'),
  (CURRENT_DATE, 'USD', 'EUR', 0.92, 'manual')
ON CONFLICT (as_of_date, base_currency, quote_currency) DO NOTHING;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active tax rules by jurisdiction
CREATE OR REPLACE VIEW v_active_tax_rules AS
SELECT
  tr.*,
  tj.code as jurisdiction_code,
  tj.name as jurisdiction_name
FROM tax_rules tr
JOIN tax_jurisdictions tj ON tj.id = tr.jurisdiction_id
WHERE tr.effective_from <= CURRENT_DATE
  AND (tr.effective_to IS NULL OR tr.effective_to >= CURRENT_DATE);

-- Tax summary by jurisdiction
CREATE OR REPLACE VIEW v_tax_summary_by_jurisdiction AS
SELECT
  tj.code as jurisdiction_code,
  tj.name as jurisdiction_name,
  COUNT(td.id) as decision_count,
  SUM(td.total_tax) as total_tax_collected,
  td.currency,
  DATE_TRUNC('month', td.computed_at) as period_month
FROM tax_decisions td
JOIN tax_jurisdictions tj ON tj.id = td.jurisdiction_id
GROUP BY tj.code, tj.name, td.currency, DATE_TRUNC('month', td.computed_at);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE tax_jurisdictions IS 'Tax jurisdictions (countries/regions) with default rules';
COMMENT ON TABLE tax_rules IS 'Versioned tax calculation rules with effective dates';
COMMENT ON TABLE tax_decisions IS 'Computed tax for each transaction';
COMMENT ON TABLE withholding_reservations IS 'Tax withholdings from merchant payouts';
COMMENT ON TABLE tax_reports IS 'Generated tax reports for filing with authorities';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================