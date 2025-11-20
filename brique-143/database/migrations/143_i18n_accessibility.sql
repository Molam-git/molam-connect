-- BRIQUE 143 — Internationalization & Accessibility
-- User language and accessibility preferences stored in Molam ID

-- User preferences table (extends Molam ID user profile)
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  language TEXT DEFAULT 'en' CHECK (language IN ('en', 'fr', 'wo', 'ar')),
  currency TEXT DEFAULT 'XOF' CHECK (currency IN ('XOF', 'EUR', 'USD', 'GBP')),
  timezone TEXT DEFAULT 'UTC',

  -- Accessibility preferences
  high_contrast BOOLEAN DEFAULT false,
  dark_mode BOOLEAN DEFAULT false,
  font_size TEXT DEFAULT 'medium' CHECK (font_size IN ('small', 'medium', 'large', 'xlarge')),
  reduce_motion BOOLEAN DEFAULT false,
  screen_reader BOOLEAN DEFAULT false,
  keyboard_nav_only BOOLEAN DEFAULT false,

  -- Additional settings
  notification_preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_prefs_user ON user_preferences(user_id);

-- Translation keys table (for dynamic content)
CREATE TABLE IF NOT EXISTS translation_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  category TEXT,
  context TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_translation_keys_category ON translation_keys(category);

-- Translations table (for CMS-managed content)
CREATE TABLE IF NOT EXISTS translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  translation_key_id UUID REFERENCES translation_keys(id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('en', 'fr', 'wo', 'ar')),
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(translation_key_id, language)
);

CREATE INDEX IF NOT EXISTS idx_translations_key_lang ON translations(translation_key_id, language);

-- Accessibility audit log (track WCAG compliance issues)
CREATE TABLE IF NOT EXISTS accessibility_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_url TEXT NOT NULL,
  component TEXT,
  issue_type TEXT, -- 'contrast', 'aria', 'keyboard', 'semantics'
  severity TEXT CHECK (severity IN ('critical', 'serious', 'moderate', 'minor')),
  wcag_criterion TEXT, -- e.g. '1.4.3', '2.1.1'
  description TEXT,
  metadata JSONB,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_a11y_audit_resolved ON accessibility_audit_log(resolved);
CREATE INDEX IF NOT EXISTS idx_a11y_audit_severity ON accessibility_audit_log(severity);

-- Language usage stats (analytics)
CREATE TABLE IF NOT EXISTS language_usage_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language TEXT NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  active_users INTEGER DEFAULT 0,
  page_views INTEGER DEFAULT 0,
  UNIQUE(language, date)
);

CREATE INDEX IF NOT EXISTS idx_lang_stats_date ON language_usage_stats(date DESC);

-- Sample data: Default preferences for system
INSERT INTO user_preferences(user_id, language, currency, timezone)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'fr', 'XOF', 'Africa/Dakar'),
  ('00000000-0000-0000-0000-000000000002', 'en', 'USD', 'UTC')
ON CONFLICT (user_id) DO NOTHING;

-- Sample translation keys
INSERT INTO translation_keys(key, category, context)
VALUES
  ('pay_now', 'checkout', 'Button label for payment action'),
  ('cancel', 'common', 'Cancel button'),
  ('confirm', 'common', 'Confirm button'),
  ('balance', 'wallet', 'Wallet balance label'),
  ('transaction_history', 'wallet', 'Transaction history page title'),
  ('welcome_message', 'auth', 'Welcome message after login'),
  ('error_network', 'errors', 'Network error message'),
  ('success_payment', 'checkout', 'Payment success message')
ON CONFLICT (key) DO NOTHING;

-- Sample translations (fr, en, wo, ar)
WITH key_ids AS (
  SELECT id, key FROM translation_keys
)
INSERT INTO translations(translation_key_id, language, value)
SELECT id, 'en', CASE key
  WHEN 'pay_now' THEN 'Pay Now'
  WHEN 'cancel' THEN 'Cancel'
  WHEN 'confirm' THEN 'Confirm'
  WHEN 'balance' THEN 'Balance'
  WHEN 'transaction_history' THEN 'Transaction History'
  WHEN 'welcome_message' THEN 'Welcome back!'
  WHEN 'error_network' THEN 'Network error. Please try again.'
  WHEN 'success_payment' THEN 'Payment successful!'
END FROM key_ids
UNION ALL
SELECT id, 'fr', CASE key
  WHEN 'pay_now' THEN 'Payer maintenant'
  WHEN 'cancel' THEN 'Annuler'
  WHEN 'confirm' THEN 'Confirmer'
  WHEN 'balance' THEN 'Solde'
  WHEN 'transaction_history' THEN 'Historique des transactions'
  WHEN 'welcome_message' THEN 'Bon retour !'
  WHEN 'error_network' THEN 'Erreur réseau. Veuillez réessayer.'
  WHEN 'success_payment' THEN 'Paiement réussi !'
END FROM key_ids
UNION ALL
SELECT id, 'wo', CASE key
  WHEN 'pay_now' THEN 'Fay leegi'
  WHEN 'cancel' THEN 'Bàyyi'
  WHEN 'confirm' THEN 'Dëgal'
  WHEN 'balance' THEN 'Bàkkaar'
  WHEN 'transaction_history' THEN 'Lister transactions'
  WHEN 'welcome_message' THEN 'Dalal ak jamm!'
  WHEN 'error_network' THEN 'Njumte réseau. Jéematal.'
  WHEN 'success_payment' THEN 'Fay bi neex na!'
END FROM key_ids
UNION ALL
SELECT id, 'ar', CASE key
  WHEN 'pay_now' THEN 'ادفع الآن'
  WHEN 'cancel' THEN 'إلغاء'
  WHEN 'confirm' THEN 'تأكيد'
  WHEN 'balance' THEN 'الرصيد'
  WHEN 'transaction_history' THEN 'سجل المعاملات'
  WHEN 'welcome_message' THEN 'مرحبا بعودتك!'
  WHEN 'error_network' THEN 'خطأ في الشبكة. يرجى المحاولة مرة أخرى.'
  WHEN 'success_payment' THEN 'تم الدفع بنجاح!'
END FROM key_ids
ON CONFLICT (translation_key_id, language) DO NOTHING;
