-- BRIQUE 143bis — AI Adaptive UI (SIRA)
-- SIRA-driven automatic UI adaptation based on user behavior and context

-- Adaptive profiles table (extends user_preferences from Brique 143)
CREATE TABLE IF NOT EXISTS adaptive_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,

  -- Manual preferences (inherited from Brique 143)
  lang TEXT DEFAULT 'en',
  high_contrast BOOLEAN DEFAULT false,
  font_scale NUMERIC(3,2) DEFAULT 1.00 CHECK (font_scale >= 0.75 AND font_scale <= 2.00),

  -- AI-detected preferences
  prefers_minimal_ui BOOLEAN DEFAULT false,
  prefers_auto_complete BOOLEAN DEFAULT false,
  prefers_large_buttons BOOLEAN DEFAULT false,
  prefers_simplified_forms BOOLEAN DEFAULT false,

  -- Context detection
  detected_context TEXT CHECK (detected_context IN ('low_bandwidth', 'bright_light', 'standard', 'dark_environment')),
  last_context_update TIMESTAMPTZ,

  -- Interaction patterns
  avg_interaction_time NUMERIC(10,2), -- milliseconds
  missed_click_rate NUMERIC(5,4),     -- 0.0000 - 1.0000
  form_abandon_rate NUMERIC(5,4),     -- 0.0000 - 1.0000
  typing_speed NUMERIC(10,2),         -- chars per minute

  -- Device info
  primary_device TEXT,                -- 'mobile', 'tablet', 'desktop'
  screen_size TEXT,                   -- 'small', 'medium', 'large', 'xlarge'
  connection_type TEXT,               -- '2g', '3g', '4g', '5g', 'wifi', 'unknown'

  -- Metadata
  sira_confidence NUMERIC(5,4),       -- confidence in AI recommendations
  last_adapted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adaptive_profiles_user ON adaptive_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_adaptive_profiles_context ON adaptive_profiles(detected_context);

-- UI interaction events (raw data for SIRA analysis)
CREATE TABLE IF NOT EXISTS ui_interaction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id TEXT NOT NULL,

  event_type TEXT NOT NULL CHECK (event_type IN (
    'click',
    'missed_click',
    'form_submit',
    'form_abandon',
    'typing_start',
    'typing_end',
    'scroll',
    'hover',
    'focus',
    'blur',
    'resize',
    'orientation_change'
  )),

  component TEXT,                     -- e.g. 'PaymentButton', 'LoginForm'
  module TEXT,                        -- 'pay', 'shop', 'talk', 'eats', 'ads', 'free'
  page_url TEXT,

  -- Event data
  target_element TEXT,
  intended_element TEXT,              -- for missed clicks
  interaction_duration INTEGER,       -- milliseconds
  typing_chars INTEGER,               -- for typing events
  scroll_depth NUMERIC(5,2),          -- percentage

  -- Context at time of event
  device_type TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  connection_speed TEXT,
  battery_level INTEGER,              -- percentage
  ambient_light TEXT,                 -- 'bright', 'normal', 'dark' (if available)

  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ui_events_user_session ON ui_interaction_events(user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_ui_events_type ON ui_interaction_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ui_events_created ON ui_interaction_events(created_at DESC);

-- SIRA adaptation recommendations
CREATE TABLE IF NOT EXISTS sira_ui_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN (
    'increase_font_size',
    'enable_high_contrast',
    'enable_minimal_ui',
    'enable_large_buttons',
    'enable_auto_complete',
    'simplify_forms',
    'reduce_animations',
    'switch_to_mobile_layout',
    'optimize_for_low_bandwidth'
  )),

  reason TEXT,
  confidence NUMERIC(5,4) NOT NULL,   -- 0.0000 - 1.0000
  supporting_data JSONB,              -- metrics that led to recommendation

  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'dismissed', 'expired')),
  applied_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '7 days'
);

CREATE INDEX IF NOT EXISTS idx_sira_recommendations_user ON sira_ui_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_sira_recommendations_status ON sira_ui_recommendations(status);

-- UI adaptation history (audit trail)
CREATE TABLE IF NOT EXISTS ui_adaptation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  adaptation_type TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  trigger TEXT,                       -- 'manual', 'sira_auto', 'context_detection'
  triggered_by UUID,                  -- recommendation_id or user_id
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ui_adaptation_history_user ON ui_adaptation_history(user_id);
CREATE INDEX IF NOT EXISTS idx_ui_adaptation_history_created ON ui_adaptation_history(created_at DESC);

-- Context detection rules
CREATE TABLE IF NOT EXISTS context_detection_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context_name TEXT NOT NULL UNIQUE,
  detection_criteria JSONB NOT NULL,  -- conditions to detect this context
  ui_adjustments JSONB NOT NULL,      -- automatic UI changes for this context
  priority INTEGER DEFAULT 50,        -- higher priority rules override lower
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sample context detection rules
INSERT INTO context_detection_rules(context_name, detection_criteria, ui_adjustments, priority)
VALUES
  (
    'low_bandwidth',
    '{"connection_type": ["2g", "3g"], "connection_speed_kbps": {"max": 500}}',
    '{"prefers_minimal_ui": true, "reduce_images": true, "disable_animations": true}',
    80
  ),
  (
    'bright_light',
    '{"ambient_light": "bright", "screen_brightness": {"min": 80}}',
    '{"high_contrast": true, "font_scale": 1.2, "increase_touch_targets": true}',
    70
  ),
  (
    'dark_environment',
    '{"ambient_light": "dark", "time_of_day": {"after": "20:00", "before": "06:00"}}',
    '{"dark_mode": true, "reduce_brightness": true}',
    70
  ),
  (
    'standard',
    '{}',
    '{}',
    10
  )
ON CONFLICT (context_name) DO NOTHING;

-- Sample adaptive profiles
INSERT INTO adaptive_profiles(user_id, lang, font_scale, detected_context, sira_confidence)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'fr', 1.00, 'standard', 0.75),
  ('00000000-0000-0000-0000-000000000002', 'en', 1.20, 'bright_light', 0.85)
ON CONFLICT (user_id) DO NOTHING;
