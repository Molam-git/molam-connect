-- ============================================================================
-- Brique 49 - Taxes & Compliance
-- SQL Schema
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Tax Rules (Multi-Country Tax Configuration)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tax_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country           TEXT NOT NULL,
  tax_code          TEXT NOT NULL,                      -- e.g. 'VAT_STD', 'VAT_REDUCED', 'WITHHOLDING'
  description       TEXT,
  rate_percent      NUMERIC(8,4) NOT NULL,
  applies_to        TEXT[] NOT NULL,                    -- e.g. ['payment_fee', 'merchant_sale', 'payout']
  threshold_amount  NUMERIC(18,2),                      -- Optional threshold (e.g., VAT threshold)
  priority          INT DEFAULT 100,
  effective_from    DATE NOT NULL,
  effective_to      DATE,
  metadata          JSONB DEFAULT '{}',
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_rules_country ON tax_rules(country);
CREATE INDEX IF NOT EXISTS idx_tax_rules_effective ON tax_rules(effective_from, effective_to);

-- ============================================================================
-- Tax Exemptions (Entity-Specific Exemptions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tax_exemptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       TEXT NOT NULL,                      -- 'merchant', 'agent', 'user'
  entity_id         UUID NOT NULL,
  country           TEXT NOT NULL,
  tax_code          TEXT NOT NULL,
  reason            TEXT,
  valid_from        DATE,
  valid_to          DATE,
  docs              JSONB,                              -- S3 keys, document metadata
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entity_type, entity_id, tax_code)
);

CREATE INDEX IF NOT EXISTS idx_tax_exemptions_entity ON tax_exemptions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_tax_exemptions_country ON tax_exemptions(country);

-- ============================================================================
-- Tax Lines (Results of Tax Computations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tax_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table      TEXT NOT NULL,                      -- 'billing_charges', 'wallet_transactions', 'payouts', 'invoice_lines'
  source_id         UUID NOT NULL,
  legal_entity      TEXT NOT NULL,                      -- e.g. 'MOLAM-SN', 'MOLAM-FR'
  country           TEXT NOT NULL,
  tax_code          TEXT NOT NULL,
  tax_rate          NUMERIC(8,4) NOT NULL,
  taxable_amount    NUMERIC(18,2) NOT NULL,
  tax_amount        NUMERIC(18,2) NOT NULL,
  currency          TEXT NOT NULL,
  computed_by       UUID,
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_table, source_id, tax_code)
);

CREATE INDEX IF NOT EXISTS idx_tax_lines_source ON tax_lines(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_tax_lines_legal_entity ON tax_lines(legal_entity);
CREATE INDEX IF NOT EXISTS idx_tax_lines_computed_at ON tax_lines(computed_at);

-- ============================================================================
-- Withholding Records (Tax Withholding Tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS withholding_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_entity_type TEXT NOT NULL,                     -- 'merchant', 'supplier'
  target_entity_id  UUID NOT NULL,
  legal_entity      TEXT NOT NULL,
  country           TEXT NOT NULL,
  tax_code          TEXT NOT NULL,
  base_amount       NUMERIC(18,2) NOT NULL,
  withheld_amount   NUMERIC(18,2) NOT NULL,
  currency          TEXT NOT NULL,
  ledger_ref        TEXT,                               -- Ledger reference for hold entry
  status            TEXT DEFAULT 'pending',             -- pending|remitted|disputed
  remitted_at       TIMESTAMPTZ,
  remittance_ref    TEXT,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_withholding_target ON withholding_records(target_entity_type, target_entity_id);
CREATE INDEX IF NOT EXISTS idx_withholding_legal_entity ON withholding_records(legal_entity);
CREATE INDEX IF NOT EXISTS idx_withholding_status ON withholding_records(status);

-- ============================================================================
-- Fiscal Reports (VAT Returns, Withholding Summaries, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS fiscal_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity      TEXT NOT NULL,
  report_type       TEXT NOT NULL,                      -- 'vat_return', 'withholding_summary', 'tax_statement'
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  country           TEXT NOT NULL,
  file_s3_key       TEXT NOT NULL,
  file_format       TEXT DEFAULT 'csv',                 -- csv|xml|pdf
  status            TEXT DEFAULT 'generated',           -- generated|submitted|accepted|rejected
  submitted_at      TIMESTAMPTZ,
  submitted_by      UUID,
  signature         TEXT,                               -- HSM signature for authenticity
  metadata          JSONB DEFAULT '{}',
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_reports_legal_period ON fiscal_reports(legal_entity, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_fiscal_reports_status ON fiscal_reports(status);

-- ============================================================================
-- FX Rates (Currency Conversion for Tax Calculation)
-- ============================================================================
-- Note: This table may already exist from Brique 46 - reusing if exists
CREATE TABLE IF NOT EXISTS fx_rates (
  as_of_date        DATE NOT NULL,
  base_currency     TEXT NOT NULL,
  quote_currency    TEXT NOT NULL,
  rate              NUMERIC(18,8) NOT NULL,
  source            TEXT DEFAULT 'manual',              -- ecb|manual|api
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (as_of_date, base_currency, quote_currency)
);

CREATE INDEX IF NOT EXISTS idx_fx_rates_date ON fx_rates(as_of_date);

-- ============================================================================
-- Audit Logs (Immutable Audit Trail)
-- ============================================================================
-- Note: Using existing molam_audit_logs table
CREATE TABLE IF NOT EXISTS molam_audit_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action            TEXT NOT NULL,                      -- e.g. 'tax.compute', 'tax.rule.create', 'fiscal_report.generate'
  actor_id          UUID,
  actor_type        TEXT DEFAULT 'user',                -- user|system|api
  resource_type     TEXT,
  resource_id       UUID,
  details           JSONB DEFAULT '{}',
  ip_address        TEXT,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON molam_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON molam_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON molam_audit_logs(created_at);

-- ============================================================================
-- Updated At Trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tax_rules_updated_at BEFORE UPDATE ON tax_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Sample Seed Data (Common Tax Rules)
-- ============================================================================

-- France VAT
INSERT INTO tax_rules (country, tax_code, description, rate_percent, applies_to, effective_from) VALUES
  ('FR', 'VAT_STD', 'TVA standard (20%)', 20.0000, ARRAY['payment_fee', 'merchant_sale', 'subscription'], '2014-01-01'),
  ('FR', 'VAT_REDUCED', 'TVA réduite (5.5%)', 5.5000, ARRAY['essential_goods'], '2014-01-01')
ON CONFLICT DO NOTHING;

-- Senegal VAT
INSERT INTO tax_rules (country, tax_code, description, rate_percent, applies_to, effective_from) VALUES
  ('SN', 'VAT_STD', 'TVA standard (18%)', 18.0000, ARRAY['payment_fee', 'merchant_sale', 'subscription'], '2020-01-01')
ON CONFLICT DO NOTHING;

-- USA (no federal VAT, but state sales tax placeholder)
INSERT INTO tax_rules (country, tax_code, description, rate_percent, applies_to, effective_from) VALUES
  ('US', 'SALES_TAX', 'Sales tax (varies by state)', 7.0000, ARRAY['merchant_sale'], '2020-01-01')
ON CONFLICT DO NOTHING;

-- Withholding tax (common in many countries)
INSERT INTO tax_rules (country, tax_code, description, rate_percent, applies_to, effective_from) VALUES
  ('SN', 'WITHHOLDING', 'Retenue à la source (10%)', 10.0000, ARRAY['payout', 'supplier_payment'], '2020-01-01'),
  ('FR', 'WITHHOLDING', 'Retenue à la source professionnel (15%)', 15.0000, ARRAY['freelancer_payment'], '2020-01-01')
ON CONFLICT DO NOTHING;

-- Sample FX rates (for testing)
INSERT INTO fx_rates (as_of_date, base_currency, quote_currency, rate, source) VALUES
  (CURRENT_DATE, 'USD', 'EUR', 0.92, 'manual'),
  (CURRENT_DATE, 'USD', 'XOF', 602.50, 'manual'),
  (CURRENT_DATE, 'EUR', 'XOF', 655.96, 'manual'),
  (CURRENT_DATE, 'USD', 'USD', 1.00, 'manual'),
  (CURRENT_DATE, 'EUR', 'EUR', 1.00, 'manual'),
  (CURRENT_DATE, 'XOF', 'XOF', 1.00, 'manual')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE tax_rules IS 'Multi-country tax rules with effective date ranges';
COMMENT ON TABLE tax_exemptions IS 'Entity-specific tax exemptions with supporting documentation';
COMMENT ON TABLE tax_lines IS 'Computed tax amounts for each transaction (idempotent)';
COMMENT ON TABLE withholding_records IS 'Tax withholding tracking and remittance';
COMMENT ON TABLE fiscal_reports IS 'Generated fiscal reports with WORM storage and signatures';
