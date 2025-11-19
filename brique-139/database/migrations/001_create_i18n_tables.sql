-- =============================================================================
-- BRIQUE 139 — Internationalisation & Accessibilité
-- Migration 001: Core i18n tables
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. Languages supported
-- =============================================================================
CREATE TABLE IF NOT EXISTS languages (
  code TEXT PRIMARY KEY,                -- 'fr','en','wo','ar'
  name TEXT NOT NULL,                   -- 'Français', 'English', 'Wolof', 'العربية'
  native_name TEXT NOT NULL,            -- Native language name
  direction TEXT DEFAULT 'ltr' CHECK (direction IN ('ltr', 'rtl')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for active languages lookup
CREATE INDEX IF NOT EXISTS idx_languages_active ON languages(is_active) WHERE is_active = true;

-- Insert default supported languages
INSERT INTO languages (code, name, native_name, direction, is_active) VALUES
  ('fr', 'French', 'Français', 'ltr', true),
  ('en', 'English', 'English', 'ltr', true),
  ('wo', 'Wolof', 'Wolof', 'ltr', true),
  ('ar', 'Arabic', 'العربية', 'rtl', true)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 2. Translation dictionary
-- =============================================================================
CREATE TABLE IF NOT EXISTS translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lang_code TEXT NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
  module TEXT NOT NULL,                 -- 'wallet','connect','form','common','dashboard'
  key TEXT NOT NULL,                    -- 'dashboard.balance.label', 'form.submit.button'
  value TEXT NOT NULL,                  -- 'Solde' / 'Balance'
  fallback_lang TEXT DEFAULT 'en',
  context JSONB DEFAULT '{}',           -- {"plural":true,"gender":"masculine","formality":"formal"}
  version INT DEFAULT 1,                -- For versioning translations
  updated_by TEXT,                      -- User ID who made the change
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lang_code, module, key)
);

-- Indexes for fast translation lookups
CREATE INDEX IF NOT EXISTS idx_translations_lang_module ON translations(lang_code, module);
CREATE INDEX IF NOT EXISTS idx_translations_key ON translations(key);
CREATE INDEX IF NOT EXISTS idx_translations_module ON translations(module);

-- =============================================================================
-- 3. Currency formatting rules
-- =============================================================================
CREATE TABLE IF NOT EXISTS currency_formats (
  code TEXT PRIMARY KEY,                -- 'XOF','USD','EUR','GHS','NGN'
  name TEXT NOT NULL,                   -- 'West African CFA Franc'
  symbol TEXT,                          -- 'CFA', '$', '€'
  decimal_separator TEXT DEFAULT '.',
  thousand_separator TEXT DEFAULT ',',
  precision INT DEFAULT 2,
  rounding_mode TEXT DEFAULT 'HALF_UP' CHECK (rounding_mode IN ('HALF_UP','HALF_DOWN','CEILING','FLOOR')),
  symbol_position TEXT DEFAULT 'after' CHECK (symbol_position IN ('before','after')),
  space_between BOOLEAN DEFAULT true,   -- Space between amount and symbol
  active BOOLEAN DEFAULT true,
  iso_code TEXT,                        -- ISO 4217 code
  regions TEXT[],                       -- ['SN','CI','BF','ML','TG','BJ','GW','NE']
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for active currencies
CREATE INDEX IF NOT EXISTS idx_currency_formats_active ON currency_formats(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_currency_formats_regions ON currency_formats USING gin(regions);

-- Insert default African currencies
INSERT INTO currency_formats (code, name, symbol, decimal_separator, thousand_separator, precision, symbol_position, space_between, iso_code, regions) VALUES
  ('XOF', 'West African CFA Franc', 'CFA', ',', ' ', 0, 'after', true, 'XOF', ARRAY['SN','CI','BF','ML','TG','BJ','GW','NE']),
  ('XAF', 'Central African CFA Franc', 'FCFA', ',', ' ', 0, 'after', true, 'XAF', ARRAY['CM','GA','CG','TD','CF','GQ']),
  ('NGN', 'Nigerian Naira', '₦', '.', ',', 2, 'before', false, 'NGN', ARRAY['NG']),
  ('GHS', 'Ghanaian Cedi', '₵', '.', ',', 2, 'before', false, 'GHS', ARRAY['GH']),
  ('KES', 'Kenyan Shilling', 'KSh', '.', ',', 2, 'before', true, 'KES', ARRAY['KE']),
  ('USD', 'US Dollar', '$', '.', ',', 2, 'before', false, 'USD', ARRAY['US']),
  ('EUR', 'Euro', '€', ',', ' ', 2, 'after', true, 'EUR', ARRAY['FR'])
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 4. Regional settings (combining language + currency + formats)
-- =============================================================================
CREATE TABLE IF NOT EXISTS regional_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL UNIQUE,    -- 'SN','CI','NG','GH' (ISO 3166-1 alpha-2)
  country_name TEXT NOT NULL,
  default_language TEXT NOT NULL REFERENCES languages(code),
  supported_languages TEXT[] DEFAULT ARRAY['fr','en'],
  default_currency TEXT NOT NULL REFERENCES currency_formats(code),
  timezone TEXT DEFAULT 'UTC',          -- 'Africa/Dakar', 'Africa/Lagos'
  date_format TEXT DEFAULT 'DD/MM/YYYY',
  time_format TEXT DEFAULT '24h',
  first_day_of_week INT DEFAULT 1,      -- 1=Monday, 0=Sunday
  phone_code TEXT,                      -- '+221', '+234'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for active regions
CREATE INDEX IF NOT EXISTS idx_regional_settings_active ON regional_settings(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_regional_settings_country ON regional_settings(country_code);

-- Insert default West African countries
INSERT INTO regional_settings (country_code, country_name, default_language, supported_languages, default_currency, timezone, phone_code) VALUES
  ('SN', 'Senegal', 'fr', ARRAY['fr','wo','en'], 'XOF', 'Africa/Dakar', '+221'),
  ('CI', 'Côte d''Ivoire', 'fr', ARRAY['fr','en'], 'XOF', 'Africa/Abidjan', '+225'),
  ('NG', 'Nigeria', 'en', ARRAY['en'], 'NGN', 'Africa/Lagos', '+234'),
  ('GH', 'Ghana', 'en', ARRAY['en'], 'GHS', 'Africa/Accra', '+233'),
  ('ML', 'Mali', 'fr', ARRAY['fr','en'], 'XOF', 'Africa/Bamako', '+223'),
  ('BF', 'Burkina Faso', 'fr', ARRAY['fr','en'], 'XOF', 'Africa/Ouagadougou', '+226')
ON CONFLICT (country_code) DO NOTHING;

-- =============================================================================
-- 5. Accessibility audit logs
-- =============================================================================
CREATE TABLE IF NOT EXISTS accessibility_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_type TEXT NOT NULL,               -- 'translation_update','currency_update','accessibility_check','wcag_audit'
  actor TEXT,                           -- User ID or system identifier
  action TEXT NOT NULL,                 -- 'update','create','delete','audit'
  module TEXT,                          -- 'wallet','connect','dashboard'
  severity TEXT CHECK (severity IN ('info','warning','error','critical')),
  details JSONB DEFAULT '{}',           -- Full context of the action
  metadata JSONB DEFAULT '{}',          -- Additional metadata
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_accessibility_logs_type ON accessibility_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_accessibility_logs_actor ON accessibility_logs(actor);
CREATE INDEX IF NOT EXISTS idx_accessibility_logs_created ON accessibility_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_accessibility_logs_severity ON accessibility_logs(severity);
CREATE INDEX IF NOT EXISTS idx_accessibility_logs_resolved ON accessibility_logs(resolved) WHERE resolved = false;

-- =============================================================================
-- 6. Translation history (for audit trail & rollback)
-- =============================================================================
CREATE TABLE IF NOT EXISTS translation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  translation_id UUID NOT NULL REFERENCES translations(id) ON DELETE CASCADE,
  lang_code TEXT NOT NULL,
  module TEXT NOT NULL,
  key TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  change_reason TEXT,
  version INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for history lookups
CREATE INDEX IF NOT EXISTS idx_translation_history_translation_id ON translation_history(translation_id);
CREATE INDEX IF NOT EXISTS idx_translation_history_created ON translation_history(created_at DESC);

-- =============================================================================
-- 7. SIRA suggestions for translations
-- =============================================================================
CREATE TABLE IF NOT EXISTS sira_translation_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lang_code TEXT NOT NULL REFERENCES languages(code),
  module TEXT NOT NULL,
  key TEXT NOT NULL,
  suggested_value TEXT NOT NULL,
  confidence_score DECIMAL(5,2),        -- 0.00 to 100.00
  context JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for pending suggestions
CREATE INDEX IF NOT EXISTS idx_sira_suggestions_status ON sira_translation_suggestions(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_sira_suggestions_lang ON sira_translation_suggestions(lang_code);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Trigger to update updated_at timestamp on languages
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_languages_updated_at BEFORE UPDATE ON languages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to log translation changes to history
CREATE OR REPLACE FUNCTION log_translation_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.value <> NEW.value THEN
    INSERT INTO translation_history (translation_id, lang_code, module, key, old_value, new_value, changed_by, version)
    VALUES (NEW.id, NEW.lang_code, NEW.module, NEW.key, OLD.value, NEW.value, NEW.updated_by, NEW.version);

    NEW.version = NEW.version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_translation_updates BEFORE UPDATE ON translations
  FOR EACH ROW EXECUTE FUNCTION log_translation_change();

-- Trigger to update updated_at on translations
CREATE TRIGGER update_translations_updated_at BEFORE UPDATE ON translations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update updated_at on currency_formats
CREATE TRIGGER update_currency_formats_updated_at BEFORE UPDATE ON currency_formats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update updated_at on regional_settings
CREATE TRIGGER update_regional_settings_updated_at BEFORE UPDATE ON regional_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE languages IS 'Supported languages with direction (LTR/RTL)';
COMMENT ON TABLE translations IS 'Translation dictionary with fallback support';
COMMENT ON TABLE currency_formats IS 'Currency formatting rules per region';
COMMENT ON TABLE regional_settings IS 'Regional preferences combining language, currency, and formats';
COMMENT ON TABLE accessibility_logs IS 'Audit trail for accessibility and i18n changes';
COMMENT ON TABLE translation_history IS 'Version history of all translation changes';
COMMENT ON TABLE sira_translation_suggestions IS 'AI-powered translation suggestions from SIRA';

-- =============================================================================
-- SEED DATA: Common translations
-- =============================================================================

-- French translations
INSERT INTO translations (lang_code, module, key, value) VALUES
  ('fr', 'common', 'app.name', 'Molam Pay'),
  ('fr', 'common', 'button.submit', 'Soumettre'),
  ('fr', 'common', 'button.cancel', 'Annuler'),
  ('fr', 'common', 'button.save', 'Enregistrer'),
  ('fr', 'common', 'button.back', 'Retour'),
  ('fr', 'wallet', 'balance.label', 'Solde'),
  ('fr', 'wallet', 'transaction.history', 'Historique des transactions'),
  ('fr', 'connect', 'payment.title', 'Paiement sécurisé'),
  ('fr', 'connect', 'payment.amount', 'Montant'),
  ('fr', 'dashboard', 'overview.title', 'Tableau de bord')
ON CONFLICT (lang_code, module, key) DO NOTHING;

-- English translations
INSERT INTO translations (lang_code, module, key, value) VALUES
  ('en', 'common', 'app.name', 'Molam Pay'),
  ('en', 'common', 'button.submit', 'Submit'),
  ('en', 'common', 'button.cancel', 'Cancel'),
  ('en', 'common', 'button.save', 'Save'),
  ('en', 'common', 'button.back', 'Back'),
  ('en', 'wallet', 'balance.label', 'Balance'),
  ('en', 'wallet', 'transaction.history', 'Transaction History'),
  ('en', 'connect', 'payment.title', 'Secure Payment'),
  ('en', 'connect', 'payment.amount', 'Amount'),
  ('en', 'dashboard', 'overview.title', 'Dashboard')
ON CONFLICT (lang_code, module, key) DO NOTHING;

-- Wolof translations
INSERT INTO translations (lang_code, module, key, value) VALUES
  ('wo', 'common', 'app.name', 'Molam Pay'),
  ('wo', 'common', 'button.submit', 'Yonneel'),
  ('wo', 'common', 'button.cancel', 'Añ'),
  ('wo', 'common', 'button.save', 'Dakk'),
  ('wo', 'common', 'button.back', 'Dellu'),
  ('wo', 'wallet', 'balance.label', 'Xaalis'),
  ('wo', 'wallet', 'transaction.history', 'Limu xaalis yi')
ON CONFLICT (lang_code, module, key) DO NOTHING;

-- Arabic translations
INSERT INTO translations (lang_code, module, key, value) VALUES
  ('ar', 'common', 'app.name', 'Molam Pay'),
  ('ar', 'common', 'button.submit', 'إرسال'),
  ('ar', 'common', 'button.cancel', 'إلغاء'),
  ('ar', 'common', 'button.save', 'حفظ'),
  ('ar', 'common', 'button.back', 'رجوع'),
  ('ar', 'wallet', 'balance.label', 'الرصيد'),
  ('ar', 'wallet', 'transaction.history', 'سجل المعاملات'),
  ('ar', 'connect', 'payment.title', 'دفع آمن'),
  ('ar', 'connect', 'payment.amount', 'المبلغ'),
  ('ar', 'dashboard', 'overview.title', 'لوحة التحكم')
ON CONFLICT (lang_code, module, key) DO NOTHING;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
