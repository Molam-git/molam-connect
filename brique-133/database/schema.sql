-- ============================================================================
-- Brique 133 - Unified Molam Pay Dashboard Schema
-- ============================================================================

-- 1) User Pay entry preferences (Molam ID aware)
CREATE TABLE IF NOT EXISTS user_pay_entry_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,           -- Molam ID user UUID
  preferred_module TEXT,                  -- 'wallet'|'connect'|null
  last_module_used TEXT,                  -- Last accessed module
  modules_enabled JSONB DEFAULT '["wallet"]'::jsonb, -- Array of enabled modules
  auto_redirect BOOLEAN DEFAULT false,    -- Enable SIRA auto-redirect
  redirect_target TEXT,                   -- Target for auto-redirect
  device_type TEXT,                       -- 'mobile'|'desktop'|'web'
  locale TEXT DEFAULT 'fr',               -- User language preference
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_pay_prefs_user ON user_pay_entry_preferences(user_id);

-- 2) Module usage analytics (for SIRA learning)
CREATE TABLE IF NOT EXISTS pay_module_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  module TEXT NOT NULL,                   -- 'wallet'|'connect'|'eats'|'shop'|'talk'|'ads'
  session_duration INTEGER,               -- Duration in seconds
  device_type TEXT,
  platform TEXT,                          -- 'ios'|'android'|'web'|'desktop'
  accessed_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_pay_module_usage_user ON pay_module_usage(user_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pay_module_usage_module ON pay_module_usage(module, accessed_at DESC);

-- 3) Module activation requests
CREATE TABLE IF NOT EXISTS module_activation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  module TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reason TEXT,                            -- User's reason for activation
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_module_activation_user ON module_activation_requests(user_id, created_at DESC);

-- 4) SIRA recommendations log
CREATE TABLE IF NOT EXISTS sira_module_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  recommended_module TEXT NOT NULL,
  confidence_score NUMERIC(3,2),          -- 0-1 confidence
  reason TEXT,                            -- Why this module was recommended
  accepted BOOLEAN,                       -- User accepted recommendation
  shown_at TIMESTAMPTZ DEFAULT now(),
  responded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sira_recommendations_user ON sira_module_recommendations(user_id, shown_at DESC);

-- 5) A/B test experiments
CREATE TABLE IF NOT EXISTS pay_entry_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_name TEXT NOT NULL,
  variant TEXT NOT NULL,                  -- 'control'|'auto_redirect'|'smart_suggestions'
  user_id UUID NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  outcome JSONB                           -- Metrics: retention, engagement, etc.
);

CREATE INDEX IF NOT EXISTS idx_pay_experiments_user ON pay_entry_experiments(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pay_experiments_name ON pay_entry_experiments(experiment_name, variant);

-- Seed default modules for all users
-- This would be called via migration or onboarding flow
-- Example: INSERT INTO user_pay_entry_preferences(user_id, modules_enabled)
--          VALUES ('user-uuid', '["wallet"]') ON CONFLICT DO NOTHING;
