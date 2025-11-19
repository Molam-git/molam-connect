/**
 * SOUS-BRIQUE 140ter — Auto-Debug Logs by Sira
 * Journalisation autonome des erreurs SDK/API
 */

-- Journalisation autonome des erreurs SDK/API
CREATE TABLE IF NOT EXISTS dev_auto_debug_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID NOT NULL,
  sdk_language TEXT NOT NULL CHECK (sdk_language IN ('node','php','python')),
  error_message TEXT NOT NULL,
  context JSONB NOT NULL,
  proposed_fix JSONB,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Index pour recherche par développeur
CREATE INDEX IF NOT EXISTS idx_auto_debug_developer
  ON dev_auto_debug_logs(developer_id, created_at DESC);

-- Index pour stats par langage
CREATE INDEX IF NOT EXISTS idx_auto_debug_language
  ON dev_auto_debug_logs(sdk_language, resolved);

-- Index pour erreurs non résolues
CREATE INDEX IF NOT EXISTS idx_auto_debug_unresolved
  ON dev_auto_debug_logs(resolved, created_at DESC)
  WHERE resolved = false;
