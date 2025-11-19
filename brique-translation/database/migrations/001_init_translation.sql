-- BRIQUE TRANSLATION — Industrial Translation System
-- Complete migration for translation cache, overrides, audit, and feedback

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Translation cache: stores all translations with confidence scoring
CREATE TABLE IF NOT EXISTS translation_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_text TEXT NOT NULL,
  source_lang VARCHAR(10) NOT NULL,
  target_lang VARCHAR(10) NOT NULL,
  translated_text TEXT NOT NULL,
  confidence NUMERIC(3,2) DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  namespace TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Unique index using MD5 hash for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS ux_translation_cache_src_lang_target_ns
  ON translation_cache (md5(source_text), source_lang, target_lang, namespace);

-- Overrides: Ops-editable glossary for manual corrections
CREATE TABLE IF NOT EXISTS translation_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace TEXT NOT NULL DEFAULT 'default',
  source_text TEXT NOT NULL,
  target_lang VARCHAR(10) NOT NULL,
  override_text TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_overrides_namespace ON translation_overrides(namespace);
CREATE UNIQUE INDEX IF NOT EXISTS ux_translation_overrides_src_tgt_ns
  ON translation_overrides (md5(source_text), target_lang, namespace);

-- Feedback: User corrections for SIRA training pipeline
CREATE TABLE IF NOT EXISTS translation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_text TEXT NOT NULL,
  wrong_translation TEXT NOT NULL,
  corrected_translation TEXT NOT NULL,
  target_lang VARCHAR(10) NOT NULL,
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user ON translation_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON translation_feedback(created_at DESC);

-- Audit: Immutable audit trail for all ops actions
CREATE TABLE IF NOT EXISTS translation_audit (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  action TEXT NOT NULL,
  namespace TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_namespace ON translation_audit(namespace);
CREATE INDEX IF NOT EXISTS idx_audit_created ON translation_audit(created_at DESC);

-- Sample overrides for Molam-specific terms
INSERT INTO translation_overrides(namespace, source_text, target_lang, override_text) VALUES
  ('default', 'Molam Pay', 'fr', 'Molam Pay'),
  ('default', 'Molam Pay', 'wo', 'Molam Pay'),
  ('default', 'Molam Pay', 'ar', 'مولام باي'),
  ('default', 'Welcome to Molam', 'fr', 'Bienvenue chez Molam'),
  ('default', 'Pay now', 'fr', 'Payer maintenant'),
  ('default', 'Pay now', 'wo', 'Fay leegi')
ON CONFLICT DO NOTHING;
