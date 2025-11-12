-- ============================================================================
-- Brique 46 - Billing & Invoicing Marchands
-- Migration 001: Charges, FX, Taxes, Invoices, Credit Notes, Payments
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1) Charges brutes (événements de frais publiés par les modules)
-- ============================================================================
CREATE TABLE IF NOT EXISTS billing_charges (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_module     TEXT NOT NULL,               -- 'connect','wallet','shop','eats','talk','ads'
  merchant_id       UUID NOT NULL,
  event_type        TEXT NOT NULL,               -- 'payment_fee','instant_payout_fee','fx_fee','dispute_fee','subscription'
  source_id         TEXT,                        -- payment_id/refund_id/dispute_id/subscription_id
  amount            NUMERIC(18,2) NOT NULL,      -- montant dans source_currency (positif = à facturer)
  source_currency   TEXT NOT NULL,               -- 'XOF','USD','EUR','GBP'
  occurred_at       TIMESTAMPTZ NOT NULL,
  metadata          JSONB,
  status            TEXT NOT NULL DEFAULT 'unbilled', -- unbilled|billed|voided
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_module, source_id, event_type),  -- idempotence côté source
  CONSTRAINT charge_status_check CHECK (status IN ('unbilled', 'billed', 'voided'))
);

-- ============================================================================
-- 2) Taux FX journaliers (pour consolidation multi-devise)
-- ============================================================================
CREATE TABLE IF NOT EXISTS fx_rates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of_date        DATE NOT NULL,
  base_currency     TEXT NOT NULL,               -- e.g., 'USD'
  quote_currency    TEXT NOT NULL,               -- e.g., 'XOF'
  rate              NUMERIC(18,8) NOT NULL,
  source            TEXT,                        -- 'ECB','OER','manual'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(as_of_date, base_currency, quote_currency)
);

-- ============================================================================
-- 3) Règles de taxes (TVA/GST/Tax par pays)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tax_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country           TEXT NOT NULL,               -- 'FR','SN','US','GB'
  tax_code          TEXT NOT NULL,               -- 'VAT_STD','VAT_REDUCED','GST','EXEMPT'
  rate_percent      NUMERIC(6,3) NOT NULL,       -- 20.000, 5.500, 0.000
  applies_to        TEXT[] NOT NULL,             -- ['payment_fee','subscription','instant_payout_fee']
  effective_from    DATE NOT NULL,
  effective_to      DATE,                        -- NULL = open-ended
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 4) Factures (invoices)
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number    TEXT UNIQUE NOT NULL,        -- séquentiel par entité légale (ex: MOLAM-FR-2025-000123)
  merchant_id       UUID NOT NULL,
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  billing_currency  TEXT NOT NULL,
  subtotal_amount   NUMERIC(18,2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(18,2) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'draft', -- draft|finalized|paying|paid|voided|uncollectible
  payment_method    TEXT,                        -- 'wallet_balance'|'netting'|'bank_transfer'
  due_date          DATE,
  locale            TEXT NOT NULL DEFAULT 'fr',  -- fr|en|es
  legal_entity      TEXT NOT NULL,               -- 'MOLAM-FR','MOLAM-SN','MOLAM-GLOBAL'
  pdf_s3_key        TEXT,                        -- S3 key or local path for PDF
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT invoice_status_check CHECK (status IN ('draft', 'finalized', 'paying', 'paid', 'voided', 'uncollectible'))
);

-- Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoices_updated_at_trigger
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION update_invoices_updated_at();

-- ============================================================================
-- 5) Lignes de facture (détail des charges)
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoice_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  charge_id         UUID REFERENCES billing_charges(id),
  description       TEXT NOT NULL,
  quantity          NUMERIC(18,4) NOT NULL DEFAULT 1,
  unit_amount       NUMERIC(18,6) NOT NULL,      -- en billing_currency
  line_amount       NUMERIC(18,2) NOT NULL,      -- arrondi (quantity * unit_amount)
  tax_rate_percent  NUMERIC(6,3) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(18,2) NOT NULL DEFAULT 0,
  source_currency   TEXT NOT NULL,
  source_amount     NUMERIC(18,2) NOT NULL,
  occurred_at       TIMESTAMPTZ NOT NULL
);

-- ============================================================================
-- 6) Avoirs (credit notes)
-- ============================================================================
CREATE TABLE IF NOT EXISTS credit_notes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_number TEXT UNIQUE,                -- séquentiel
  merchant_id       UUID NOT NULL,
  invoice_id        UUID REFERENCES invoices(id),
  reason            TEXT NOT NULL,               -- 'dispute_won','manual_adjustment','service_credit'
  amount            NUMERIC(18,2) NOT NULL,      -- en billing_currency (négatif sur AR)
  currency          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'issued', -- issued|applied|voided
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT credit_note_status_check CHECK (status IN ('issued', 'applied', 'voided'))
);

-- ============================================================================
-- 7) Règlements facture (journal de paiements)
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoice_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  method            TEXT NOT NULL,               -- wallet_balance|netting|bank_transfer
  amount            NUMERIC(18,2) NOT NULL,
  currency          TEXT NOT NULL,
  reference         TEXT,                        -- ref virement / payout batch / wallet txn
  posted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_method_check CHECK (method IN ('wallet_balance', 'netting', 'bank_transfer'))
);

-- ============================================================================
-- 8) Compteurs séquentiels par entité légale (numérotation fiscale)
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoice_sequences (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity      TEXT NOT NULL,
  sequence_type     TEXT NOT NULL DEFAULT 'invoice', -- invoice|credit_note
  current_number    BIGINT NOT NULL DEFAULT 0,
  UNIQUE(legal_entity, sequence_type)
);

-- ============================================================================
-- Index clés
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_bc_merchant_status ON billing_charges(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_bc_occurred ON billing_charges(occurred_at);
CREATE INDEX IF NOT EXISTS idx_fx_date ON fx_rates(as_of_date, base_currency, quote_currency);
CREATE INDEX IF NOT EXISTS idx_inv_merchant_status ON invoices(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_period ON invoices(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_il_invoice ON invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_cn_merchant ON credit_notes(merchant_id);
CREATE INDEX IF NOT EXISTS idx_ip_invoice ON invoice_payments(invoice_id);

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE billing_charges IS 'Fee events published by all modules (Connect, Wallet, Shop, etc.)';
COMMENT ON TABLE fx_rates IS 'Daily FX rates for multi-currency consolidation';
COMMENT ON TABLE tax_rules IS 'Tax/VAT rules by country with effective dates';
COMMENT ON TABLE invoices IS 'Monthly/weekly invoices with PDF generation and settlement';
COMMENT ON TABLE invoice_lines IS 'Detailed line items for each invoice';
COMMENT ON TABLE credit_notes IS 'Credit notes for disputes, adjustments, service credits';
COMMENT ON TABLE invoice_payments IS 'Payment journal (wallet, netting, bank transfer)';
COMMENT ON TABLE invoice_sequences IS 'Sequential counters for legal invoice numbering';
