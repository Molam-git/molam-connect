-- ============================================================================
-- Multi-Channel Approvals - Extension Schema
-- ============================================================================

-- Extend notification_audit with channel tracking
ALTER TABLE notification_audit
ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'email'
  CHECK (channel IN ('email', 'slack', 'push', 'sms'));

ALTER TABLE notification_audit
ADD COLUMN IF NOT EXISTS slack_message_ts TEXT;  -- Slack timestamp pour threading

ALTER TABLE notification_audit
ADD COLUMN IF NOT EXISTS push_notification_id TEXT;  -- ID notification push

-- ============================================================================
-- Channel Preferences & Fallback Strategy
-- ============================================================================
CREATE TABLE IF NOT EXISTS channel_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id UUID NOT NULL,
  recipient_id UUID NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'slack', 'push', 'sms')),
  attempt_number INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('sent', 'delivered', 'failed', 'bounced', 'clicked')),
  provider_message_id TEXT,
  error_details TEXT,
  attempted_at TIMESTAMPTZ DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_channel_delivery_request ON channel_delivery_log(approval_request_id);
CREATE INDEX IF NOT EXISTS idx_channel_delivery_recipient ON channel_delivery_log(recipient_id);
CREATE INDEX IF NOT EXISTS idx_channel_delivery_status ON channel_delivery_log(status);

-- ============================================================================
-- Slack Workspace Configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS slack_workspace_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT UNIQUE NOT NULL,
  webhook_url TEXT NOT NULL,
  channel_id TEXT,  -- Default channel for approvals
  bot_token TEXT,   -- For interactive messages
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- User Channel Mapping (Slack usernames, Push device tokens)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_channel_identifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'slack', 'push', 'sms')),
  identifier TEXT NOT NULL,  -- email address, slack user ID, device token, phone number
  verified BOOLEAN DEFAULT FALSE,
  primary_channel BOOLEAN DEFAULT FALSE,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, channel, identifier)
);

CREATE INDEX IF NOT EXISTS idx_user_channels_user ON user_channel_identifiers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_channels_channel ON user_channel_identifiers(channel);

-- Update notification_preferences to include channel priority
ALTER TABLE notification_preferences
ADD COLUMN IF NOT EXISTS channel_priority JSONB DEFAULT '["push", "email", "slack"]'::jsonb;

ALTER TABLE notification_preferences
ADD COLUMN IF NOT EXISTS fallback_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE notification_preferences
ADD COLUMN IF NOT EXISTS fallback_delay_seconds INT DEFAULT 300;  -- 5 min
