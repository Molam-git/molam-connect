-- ============================================================================
-- Migration: User Pay Entry Preferences
-- Date: 2025-01-18
-- Description: Create table for user module preferences with SIRA integration
-- ============================================================================

-- Main preferences table
CREATE TABLE IF NOT EXISTS user_pay_entry_preferences (
  user_id UUID PRIMARY KEY,                 -- Molam ID user UUID
  preferred_module TEXT,                    -- 'wallet'|'connect'|NULL
  last_module_used TEXT,                    -- Last accessed module
  modules_enabled JSONB NOT NULL DEFAULT '["wallet"]'::jsonb, -- Enabled modules array
  auto_redirect BOOLEAN NOT NULL DEFAULT FALSE, -- Enable SIRA auto-redirect
  country TEXT,                             -- User country (from Molam ID)
  currency TEXT,                            -- User currency preference
  lang TEXT DEFAULT 'fr',                   -- User language preference
  updated_by UUID,                          -- Who made last update
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_pay_entry_pref_preferred
  ON user_pay_entry_preferences(preferred_module)
  WHERE preferred_module IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_pay_entry_pref_auto_redirect
  ON user_pay_entry_preferences(auto_redirect)
  WHERE auto_redirect = true;

CREATE INDEX IF NOT EXISTS idx_user_pay_entry_pref_country
  ON user_pay_entry_preferences(country)
  WHERE country IS NOT NULL;

-- Audit log for preference changes
CREATE TABLE IF NOT EXISTS pay_entry_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action TEXT NOT NULL,                     -- 'create'|'update'|'delete'
  old_values JSONB,
  new_values JSONB,
  changed_by UUID,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pay_entry_audit_user
  ON pay_entry_audit_log(user_id, created_at DESC);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_pay_entry_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-update
CREATE TRIGGER trg_pay_entry_updated_at
  BEFORE UPDATE ON user_pay_entry_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_pay_entry_updated_at();

-- Seed default preferences for existing users (optional, can be done via migration script)
-- INSERT INTO user_pay_entry_preferences(user_id, modules_enabled)
-- SELECT id, '["wallet"]'::jsonb FROM users WHERE NOT EXISTS (
--   SELECT 1 FROM user_pay_entry_preferences WHERE user_id = users.id
-- );

-- Comments for documentation
COMMENT ON TABLE user_pay_entry_preferences IS 'User module preferences for Molam Pay entry point';
COMMENT ON COLUMN user_pay_entry_preferences.user_id IS 'Molam ID user UUID (PK)';
COMMENT ON COLUMN user_pay_entry_preferences.preferred_module IS 'User preferred module for auto-redirect';
COMMENT ON COLUMN user_pay_entry_preferences.modules_enabled IS 'JSON array of enabled module names';
COMMENT ON COLUMN user_pay_entry_preferences.auto_redirect IS 'Whether to auto-redirect to preferred module';
