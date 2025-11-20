-- BRIQUE 143ter — Auto-Translation Layer (SIRA)
-- Real-time translation with caching, feedback loop, and SIRA training integration

-- Translation cache: canonical translations with quality scoring
CREATE TABLE IF NOT EXISTS translation_cache (
  key TEXT PRIMARY KEY,               -- sha256(source_text || source_lang || target_lang || namespace)
  source_text TEXT NOT NULL,
  source_lang TEXT NOT NULL CHECK (source_lang IN ('en', 'fr', 'wo', 'ar', 'es', 'pt')),
  target_lang TEXT NOT NULL CHECK (target_lang IN ('en', 'fr', 'wo', 'ar', 'es', 'pt')),
  namespace TEXT NOT NULL,            -- 'ui.labels', 'talk.message', 'invoice.pdf', 'error.message'
  translated_text TEXT NOT NULL,
  quality_score NUMERIC(3,2) CHECK (quality_score >= 0 AND quality_score <= 1),
  translation_method TEXT,            -- 'cache', 'model_local', 'api_external', 'human'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_translation_cache_namespace ON translation_cache(namespace);
CREATE INDEX IF NOT EXISTS idx_translation_cache_langs ON translation_cache(source_lang, target_lang);
CREATE INDEX IF NOT EXISTS idx_translation_cache_quality ON translation_cache(quality_score DESC);

-- Translation jobs for async processing
CREATE TABLE IF NOT EXISTS translation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  source_text TEXT NOT NULL,
  source_lang TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  namespace TEXT NOT NULL,
  priority INTEGER DEFAULT 50,        -- higher = more urgent
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed', 'cancelled')),
  result TEXT,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  last_error TEXT,
  assigned_worker TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_translation_jobs_status ON translation_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_translation_jobs_priority ON translation_jobs(priority DESC, created_at);

-- Translation feedback for SIRA training
CREATE TABLE IF NOT EXISTS translation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  cache_key TEXT NOT NULL,
  original_translation TEXT NOT NULL,
  corrected_text TEXT NOT NULL,
  reason TEXT,                        -- 'incorrect', 'context_wrong', 'better_phrasing', 'offensive'
  context_data JSONB,                 -- device, page, module, etc.
  reviewed BOOLEAN DEFAULT false,
  incorporated BOOLEAN DEFAULT false, -- added to training dataset
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_translation_feedback_reviewed ON translation_feedback(reviewed, created_at);
CREATE INDEX IF NOT EXISTS idx_translation_feedback_user ON translation_feedback(user_id);

-- Translation glossary (business terms, brand names)
CREATE TABLE IF NOT EXISTS translation_glossary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term TEXT NOT NULL,
  source_lang TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  translation TEXT NOT NULL,
  namespace TEXT,
  context TEXT,                       -- usage context
  mandatory BOOLEAN DEFAULT false,    -- must be used (brand names, legal terms)
  created_by UUID,
  approved_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(term, source_lang, target_lang, namespace)
);

CREATE INDEX IF NOT EXISTS idx_glossary_term ON translation_glossary(term, source_lang);

-- Language detection cache
CREATE TABLE IF NOT EXISTS language_detection_cache (
  text_hash TEXT PRIMARY KEY,         -- sha256(text)
  sample_text TEXT NOT NULL,
  detected_lang TEXT NOT NULL,
  confidence NUMERIC(3,2),
  detection_method TEXT,              -- 'heuristic', 'model', 'user_override'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Translation usage statistics
CREATE TABLE IF NOT EXISTS translation_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  namespace TEXT NOT NULL,
  source_lang TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  total_requests INTEGER DEFAULT 0,
  cache_hits INTEGER DEFAULT 0,
  cache_misses INTEGER DEFAULT 0,
  avg_latency_ms NUMERIC(10,2),
  errors INTEGER DEFAULT 0,
  UNIQUE(date, namespace, source_lang, target_lang)
);

CREATE INDEX IF NOT EXISTS idx_translation_stats_date ON translation_stats(date DESC);

-- Translation model versions (for A/B testing and rollback)
CREATE TABLE IF NOT EXISTS translation_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,
  model_type TEXT NOT NULL,           -- 'm2m100', 'marian', 'opus_mt', 'external_api'
  language_pairs JSONB NOT NULL,      -- [{"source": "en", "target": "fr"}, ...]
  config JSONB,
  active BOOLEAN DEFAULT false,
  performance_metrics JSONB,
  deployed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sample glossary entries (Molam-specific terms)
INSERT INTO translation_glossary(term, source_lang, target_lang, translation, namespace, mandatory)
VALUES
  ('Molam Pay', 'en', 'fr', 'Molam Pay', 'ui.labels', true),
  ('Molam Pay', 'en', 'wo', 'Molam Pay', 'ui.labels', true),
  ('Molam Pay', 'en', 'ar', 'مولام باي', 'ui.labels', true),
  ('Wallet', 'en', 'fr', 'Portefeuille', 'ui.labels', false),
  ('Wallet', 'en', 'wo', 'Porte-monnaie', 'ui.labels', false),
  ('Wallet', 'en', 'ar', 'محفظة', 'ui.labels', false),
  ('Transaction', 'en', 'fr', 'Transaction', 'ui.labels', false),
  ('Transaction', 'en', 'wo', 'Transaction', 'ui.labels', false),
  ('Balance', 'en', 'fr', 'Solde', 'ui.labels', false),
  ('Balance', 'en', 'wo', 'Bàkkaar', 'ui.labels', false),
  ('Pay Now', 'en', 'fr', 'Payer maintenant', 'ui.labels', false),
  ('Pay Now', 'en', 'wo', 'Fay leegi', 'ui.labels', false)
ON CONFLICT (term, source_lang, target_lang, namespace) DO NOTHING;

-- Sample translation model entry
INSERT INTO translation_models(version, model_type, language_pairs, active, performance_metrics)
VALUES (
  'libre-translate-v1',
  'external_api',
  '[
    {"source": "en", "target": "fr"},
    {"source": "en", "target": "ar"},
    {"source": "fr", "target": "en"},
    {"source": "wo", "target": "fr"}
  ]'::jsonb,
  true,
  '{"avg_latency_ms": 250, "bleu_score": 0.45}'::jsonb
)
ON CONFLICT (version) DO NOTHING;
