-- =====================================================================
-- Brique 76 - Notifications & Alerte Marchand
-- Multi-Channel, Multi-Language, Molam ID Aware, SIRA-Personalized
-- =====================================================================
-- Version: 1.0.0
-- Date: 2025-11-12
-- Description: Industrial notification system with templates, preferences,
--              throttling, multi-channel delivery (Email, SMS, Push, In-app, Webhook)
-- =====================================================================

-- =====================================================================
-- EXTENSION & SETUP
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search on templates

-- =====================================================================
-- ENUM TYPES
-- =====================================================================

-- Notification channels
CREATE TYPE notif_channel AS ENUM (
  'email',
  'sms',
  'push',
  'in_app',
  'webhook'
);

-- Notification categories
CREATE TYPE notif_category AS ENUM (
  'transaction',        -- Payment completed, failed, refunded
  'account',           -- Account updates, verification
  'security',          -- Suspicious activity, password changes
  'marketing',         -- Promotions, newsletters
  'operational',       -- System maintenance, downtime
  'compliance',        -- KYC reminders, tax documents
  'fraud_alert',       -- Fraud detected, chargebacks
  'payout',           -- Payout processed, failed
  'subscription'      -- Subscription renewal, cancellation
);

-- Delivery status
CREATE TYPE notif_delivery_status AS ENUM (
  'pending',
  'queued',
  'sent',
  'delivered',
  'failed',
  'bounced',
  'spam',
  'unsubscribed',
  'throttled',
  'skipped'
);

-- Template status
CREATE TYPE notif_template_status AS ENUM (
  'draft',
  'active',
  'archived',
  'deprecated'
);

-- Priority levels
CREATE TYPE notif_priority AS ENUM (
  'critical',   -- Immediate delivery, bypass throttles
  'high',       -- Fast delivery
  'normal',     -- Regular delivery
  'low'         -- Can be delayed/batched
);

-- =====================================================================
-- TABLES
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. NOTIFICATION TEMPLATES (Multi-language, Versioned)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notif_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template identity
  template_key TEXT NOT NULL, -- e.g., 'payment_success', 'fraud_alert_high'
  version INTEGER NOT NULL DEFAULT 1,

  -- Scope (who can use this template)
  scope TEXT NOT NULL CHECK (scope IN ('global', 'merchant', 'ops')),
  scope_id UUID, -- merchant_id if scope = 'merchant', NULL if global

  -- Metadata
  category notif_category NOT NULL,
  channels notif_channel[] NOT NULL, -- Which channels this template supports

  -- Multi-language content (JSONB)
  -- Structure: { "fr": {...}, "en": {...}, "pt": {...} }
  content JSONB NOT NULL,

  -- Example structure:
  -- {
  --   "fr": {
  --     "subject": "Paiement réussi",
  --     "body_text": "Bonjour {{customer_name}}...",
  --     "body_html": "<html>...",
  --     "sms_text": "Paiement de {{amount}} reçu",
  --     "push_title": "Paiement réussi",
  --     "push_body": "...",
  --     "webhook_payload": {...}
  --   },
  --   "en": {...}
  -- }

  -- Variables used in template (for validation)
  variables TEXT[] DEFAULT ARRAY[]::TEXT[], -- e.g., ['customer_name', 'amount', 'transaction_id']

  -- Status
  status notif_template_status DEFAULT 'draft',
  is_default BOOLEAN DEFAULT false, -- Is this the default version for this template_key?

  -- Sira personalization config
  sira_personalization_enabled BOOLEAN DEFAULT false,
  sira_config JSONB DEFAULT '{}'::JSONB,
  -- Example: { "optimize_delivery_time": true, "optimize_channel": true, "a_b_test": true }

  -- Metadata
  created_by UUID NOT NULL,
  updated_by UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Versioning constraint
  UNIQUE(template_key, version, scope, scope_id)
);

-- Indexes
CREATE INDEX idx_notif_templates_key ON notif_templates(template_key);
CREATE INDEX idx_notif_templates_scope ON notif_templates(scope, scope_id);
CREATE INDEX idx_notif_templates_status ON notif_templates(status);
CREATE INDEX idx_notif_templates_category ON notif_templates(category);

-- GIN index for JSONB content (for search)
CREATE INDEX idx_notif_templates_content_gin ON notif_templates USING gin(content);

COMMENT ON TABLE notif_templates IS 'Multi-language notification templates with versioning and Sira personalization';

-- ---------------------------------------------------------------------
-- 2. NOTIFICATION PREFERENCES (GDPR-compliant opt-in/out)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notif_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User identity (polymorphic)
  user_type TEXT NOT NULL CHECK (user_type IN ('merchant', 'ops_user', 'customer', 'connect_account')),
  user_id UUID NOT NULL,

  -- Email/phone for contact
  email TEXT,
  phone TEXT,

  -- Per-channel opt-in/out
  email_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT true,
  in_app_enabled BOOLEAN DEFAULT true,
  webhook_enabled BOOLEAN DEFAULT true,

  -- Per-category opt-in/out (JSONB for flexibility)
  -- Structure: { "transaction": true, "marketing": false, ... }
  category_preferences JSONB DEFAULT '{}'::JSONB,

  -- Per-channel-per-category granular control
  -- Structure: { "email": { "marketing": false }, "sms": { "marketing": false } }
  granular_preferences JSONB DEFAULT '{}'::JSONB,

  -- Quiet hours (no notifications during these times)
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME, -- e.g., '22:00'
  quiet_hours_end TIME,   -- e.g., '08:00'
  quiet_hours_timezone TEXT DEFAULT 'UTC',

  -- Language preference
  preferred_language TEXT DEFAULT 'fr' CHECK (preferred_language IN ('fr', 'en', 'pt', 'es')),

  -- GDPR compliance
  gdpr_consent_given BOOLEAN DEFAULT false,
  gdpr_consent_at TIMESTAMPTZ,
  gdpr_consent_ip TEXT,

  -- Unsubscribe token (for one-click unsubscribe links)
  unsubscribe_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Unique per user
  UNIQUE(user_type, user_id)
);

-- Indexes
CREATE INDEX idx_notif_preferences_user ON notif_preferences(user_type, user_id);
CREATE INDEX idx_notif_preferences_email ON notif_preferences(email);
CREATE INDEX idx_notif_preferences_phone ON notif_preferences(phone);
CREATE INDEX idx_notif_preferences_unsubscribe_token ON notif_preferences(unsubscribe_token);

COMMENT ON TABLE notif_preferences IS 'GDPR-compliant notification preferences per user with granular opt-in/out';

-- ---------------------------------------------------------------------
-- 3. NOTIFICATION REQUESTS (Event intake)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notif_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template reference
  template_key TEXT NOT NULL,
  template_version INTEGER, -- NULL = use default active version

  -- Recipient
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('merchant', 'ops_user', 'customer', 'connect_account')),
  recipient_id UUID NOT NULL,

  -- Channels to send (can override template's default channels)
  channels notif_channel[] NOT NULL,

  -- Priority
  priority notif_priority DEFAULT 'normal',

  -- Variables to render template
  variables JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Example: { "customer_name": "John Doe", "amount": "10000 XOF", "transaction_id": "..." }

  -- Optional overrides
  language_override TEXT, -- Force specific language
  send_at TIMESTAMPTZ, -- Schedule for future (NULL = immediate)

  -- Idempotency (prevent duplicate sends)
  idempotency_key TEXT UNIQUE, -- e.g., 'payment_success_txn_12345'

  -- Metadata
  context JSONB DEFAULT '{}'::JSONB, -- Additional context for logging/debugging
  created_by UUID, -- Who triggered this notification
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Processing
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  processed_at TIMESTAMPTZ,
  error_message TEXT
);

-- Indexes
CREATE INDEX idx_notif_requests_status ON notif_requests(status, created_at);
CREATE INDEX idx_notif_requests_recipient ON notif_requests(recipient_type, recipient_id);
CREATE INDEX idx_notif_requests_template ON notif_requests(template_key);
CREATE INDEX idx_notif_requests_send_at ON notif_requests(send_at) WHERE send_at IS NOT NULL;
CREATE INDEX idx_notif_requests_idempotency ON notif_requests(idempotency_key);

COMMENT ON TABLE notif_requests IS 'Notification requests queue (event intake before rendering/delivery)';

-- ---------------------------------------------------------------------
-- 4. NOTIFICATION DELIVERIES (Audit trail for all deliveries)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notif_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source request
  request_id UUID REFERENCES notif_requests(id) ON DELETE CASCADE,

  -- Channel-specific delivery
  channel notif_channel NOT NULL,

  -- Recipient contact details (at time of send)
  recipient_email TEXT,
  recipient_phone TEXT,
  recipient_device_token TEXT, -- For push
  recipient_webhook_url TEXT,  -- For webhook

  -- Rendered content (snapshot)
  rendered_subject TEXT,
  rendered_body_text TEXT,
  rendered_body_html TEXT,
  rendered_payload JSONB, -- For webhook/push

  -- Template used
  template_id UUID REFERENCES notif_templates(id),
  template_key TEXT NOT NULL,
  template_version INTEGER NOT NULL,

  -- Delivery status
  status notif_delivery_status DEFAULT 'pending',

  -- Provider details
  provider TEXT, -- e.g., 'sendgrid', 'twilio', 'fcm', 'internal'
  provider_message_id TEXT, -- External ID from provider (for tracking)
  provider_response JSONB, -- Full response from provider

  -- Timestamps
  queued_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,

  -- Error handling
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,

  -- Engagement tracking (for email/push)
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  clicked_links TEXT[], -- URLs clicked

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

-- Indexes
CREATE INDEX idx_notif_deliveries_request ON notif_deliveries(request_id);
CREATE INDEX idx_notif_deliveries_status ON notif_deliveries(status, queued_at);
CREATE INDEX idx_notif_deliveries_channel ON notif_deliveries(channel);
CREATE INDEX idx_notif_deliveries_provider_id ON notif_deliveries(provider_message_id);
CREATE INDEX idx_notif_deliveries_retry ON notif_deliveries(next_retry_at) WHERE status = 'failed' AND retry_count < max_retries;
CREATE INDEX idx_notif_deliveries_template ON notif_deliveries(template_key, template_version);

COMMENT ON TABLE notif_deliveries IS 'Audit trail for all notification deliveries with engagement tracking';

-- ---------------------------------------------------------------------
-- 5. NOTIFICATION THROTTLES (Rate limiting per tenant)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notif_throttles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  scope TEXT NOT NULL CHECK (scope IN ('global', 'merchant', 'ops')),
  scope_id UUID,

  -- Channel and category
  channel notif_channel NOT NULL,
  category notif_category,

  -- Limits
  max_per_minute INTEGER,
  max_per_hour INTEGER,
  max_per_day INTEGER,

  -- Priority bypass (critical notifications bypass throttles)
  bypass_for_critical BOOLEAN DEFAULT true,

  -- Status
  active BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  UNIQUE(scope, scope_id, channel, category)
);

-- Indexes
CREATE INDEX idx_notif_throttles_scope ON notif_throttles(scope, scope_id);
CREATE INDEX idx_notif_throttles_channel ON notif_throttles(channel);
CREATE INDEX idx_notif_throttles_active ON notif_throttles(active);

COMMENT ON TABLE notif_throttles IS 'Rate limiting configuration per tenant, channel, and category';

-- ---------------------------------------------------------------------
-- 6. NOTIFICATION THROTTLE COUNTERS (Real-time counters in Redis-like fashion)
-- ---------------------------------------------------------------------
-- Note: In production, use Redis for real-time counters.
-- This table is backup/audit for PostgreSQL-only setups.

CREATE TABLE IF NOT EXISTS notif_throttle_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Throttle key
  scope TEXT NOT NULL,
  scope_id UUID,
  channel notif_channel NOT NULL,
  category notif_category,

  -- Time window
  window_type TEXT NOT NULL CHECK (window_type IN ('minute', 'hour', 'day')),
  window_start TIMESTAMPTZ NOT NULL,

  -- Counter
  count INTEGER DEFAULT 0 NOT NULL,

  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  UNIQUE(scope, scope_id, channel, category, window_type, window_start)
);

-- Indexes
CREATE INDEX idx_notif_throttle_counters_window ON notif_throttle_counters(window_start, window_type);
CREATE INDEX idx_notif_throttle_counters_scope ON notif_throttle_counters(scope, scope_id, channel, category);

COMMENT ON TABLE notif_throttle_counters IS 'Real-time throttle counters (backup for Redis)';

-- ---------------------------------------------------------------------
-- 7. NOTIFICATION LOGS (In-app notification storage)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notif_in_app_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Recipient
  user_type TEXT NOT NULL CHECK (user_type IN ('merchant', 'ops_user', 'customer', 'connect_account')),
  user_id UUID NOT NULL,

  -- Delivery reference
  delivery_id UUID REFERENCES notif_deliveries(id) ON DELETE CASCADE,

  -- Content
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  icon TEXT, -- URL or emoji
  action_url TEXT, -- Where to navigate on click

  -- Category
  category notif_category NOT NULL,
  priority notif_priority DEFAULT 'normal',

  -- Status
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  dismissed BOOLEAN DEFAULT false,
  dismissed_at TIMESTAMPTZ,

  -- Expiration (auto-delete after)
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days'),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX idx_notif_in_app_logs_user ON notif_in_app_logs(user_type, user_id, created_at DESC);
CREATE INDEX idx_notif_in_app_logs_read ON notif_in_app_logs(user_type, user_id, read);
CREATE INDEX idx_notif_in_app_logs_category ON notif_in_app_logs(category);
CREATE INDEX idx_notif_in_app_logs_expires ON notif_in_app_logs(expires_at);

COMMENT ON TABLE notif_in_app_logs IS 'In-app notification center (persistent notifications for UI)';

-- ---------------------------------------------------------------------
-- 8. SIRA NOTIFICATION INSIGHTS (AI personalization tracking)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sira_notif_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User
  user_type TEXT NOT NULL,
  user_id UUID NOT NULL,

  -- Behavior tracking
  preferred_channel notif_channel, -- Sira-detected best channel
  preferred_time_of_day INTEGER, -- Hour (0-23) with highest engagement

  -- Engagement scores per channel (0-1)
  email_engagement_score NUMERIC(3,2) DEFAULT 0.5,
  sms_engagement_score NUMERIC(3,2) DEFAULT 0.5,
  push_engagement_score NUMERIC(3,2) DEFAULT 0.5,
  in_app_engagement_score NUMERIC(3,2) DEFAULT 0.5,

  -- Statistics
  total_sent INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,

  -- Last updated
  last_analyzed_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  UNIQUE(user_type, user_id)
);

-- Indexes
CREATE INDEX idx_sira_notif_insights_user ON sira_notif_insights(user_type, user_id);
CREATE INDEX idx_sira_notif_insights_channel ON sira_notif_insights(preferred_channel);

COMMENT ON TABLE sira_notif_insights IS 'Sira AI insights on user notification preferences and engagement';

-- ---------------------------------------------------------------------
-- 9. NOTIFICATION WEBHOOKS CONFIG (Merchant webhook endpoints)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notif_webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner
  merchant_id UUID NOT NULL,

  -- Webhook details
  url TEXT NOT NULL,
  secret TEXT NOT NULL, -- For HMAC signature

  -- Events to send
  events TEXT[] NOT NULL, -- e.g., ['payment.success', 'payment.failed', 'fraud.detected']

  -- Status
  active BOOLEAN DEFAULT true,

  -- Retry config
  max_retries INTEGER DEFAULT 3,
  retry_backoff TEXT DEFAULT 'exponential' CHECK (retry_backoff IN ('linear', 'exponential')),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX idx_notif_webhook_configs_merchant ON notif_webhook_configs(merchant_id);
CREATE INDEX idx_notif_webhook_configs_active ON notif_webhook_configs(active);

COMMENT ON TABLE notif_webhook_configs IS 'Merchant webhook configurations for outbound event notifications';

-- =====================================================================
-- FUNCTIONS
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Get Active Template (default version for key)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_active_template(
  p_template_key TEXT,
  p_scope TEXT DEFAULT 'global',
  p_scope_id UUID DEFAULT NULL
)
RETURNS notif_templates AS $$
DECLARE
  v_template notif_templates;
BEGIN
  -- Try to find active default template
  SELECT * INTO v_template
  FROM notif_templates
  WHERE template_key = p_template_key
    AND scope = p_scope
    AND (p_scope_id IS NULL OR scope_id = p_scope_id)
    AND status = 'active'
    AND is_default = true
  ORDER BY version DESC
  LIMIT 1;

  -- If not found, try latest active
  IF v_template IS NULL THEN
    SELECT * INTO v_template
    FROM notif_templates
    WHERE template_key = p_template_key
      AND scope = p_scope
      AND (p_scope_id IS NULL OR scope_id = p_scope_id)
      AND status = 'active'
    ORDER BY version DESC
    LIMIT 1;
  END IF;

  RETURN v_template;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_active_template IS 'Get active default template for a given key';

-- ---------------------------------------------------------------------
-- 2. Check Throttle Limit
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_throttle_limit(
  p_scope TEXT,
  p_scope_id UUID,
  p_channel notif_channel,
  p_category notif_category,
  p_priority notif_priority DEFAULT 'normal'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_throttle notif_throttles;
  v_count_minute INTEGER := 0;
  v_count_hour INTEGER := 0;
  v_count_day INTEGER := 0;
BEGIN
  -- Critical priority bypasses throttles
  IF p_priority = 'critical' THEN
    RETURN true;
  END IF;

  -- Get throttle config
  SELECT * INTO v_throttle
  FROM notif_throttles
  WHERE scope = p_scope
    AND (p_scope_id IS NULL OR scope_id = p_scope_id)
    AND channel = p_channel
    AND (category IS NULL OR category = p_category)
    AND active = true
  LIMIT 1;

  -- No throttle config = allow
  IF v_throttle IS NULL THEN
    RETURN true;
  END IF;

  -- Check if bypass for critical
  IF v_throttle.bypass_for_critical AND p_priority = 'critical' THEN
    RETURN true;
  END IF;

  -- Get current counts
  SELECT COALESCE(count, 0) INTO v_count_minute
  FROM notif_throttle_counters
  WHERE scope = p_scope AND scope_id = p_scope_id
    AND channel = p_channel AND category = p_category
    AND window_type = 'minute'
    AND window_start >= date_trunc('minute', now());

  SELECT COALESCE(count, 0) INTO v_count_hour
  FROM notif_throttle_counters
  WHERE scope = p_scope AND scope_id = p_scope_id
    AND channel = p_channel AND category = p_category
    AND window_type = 'hour'
    AND window_start >= date_trunc('hour', now());

  SELECT COALESCE(count, 0) INTO v_count_day
  FROM notif_throttle_counters
  WHERE scope = p_scope AND scope_id = p_scope_id
    AND channel = p_channel AND category = p_category
    AND window_type = 'day'
    AND window_start >= date_trunc('day', now());

  -- Check limits
  IF v_throttle.max_per_minute IS NOT NULL AND v_count_minute >= v_throttle.max_per_minute THEN
    RETURN false;
  END IF;

  IF v_throttle.max_per_hour IS NOT NULL AND v_count_hour >= v_throttle.max_per_hour THEN
    RETURN false;
  END IF;

  IF v_throttle.max_per_day IS NOT NULL AND v_count_day >= v_throttle.max_per_day THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_throttle_limit IS 'Check if notification is within throttle limits';

-- ---------------------------------------------------------------------
-- 3. Increment Throttle Counter
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION increment_throttle_counter(
  p_scope TEXT,
  p_scope_id UUID,
  p_channel notif_channel,
  p_category notif_category
)
RETURNS VOID AS $$
BEGIN
  -- Minute window
  INSERT INTO notif_throttle_counters (scope, scope_id, channel, category, window_type, window_start, count)
  VALUES (p_scope, p_scope_id, p_channel, p_category, 'minute', date_trunc('minute', now()), 1)
  ON CONFLICT (scope, scope_id, channel, category, window_type, window_start)
  DO UPDATE SET count = notif_throttle_counters.count + 1, updated_at = now();

  -- Hour window
  INSERT INTO notif_throttle_counters (scope, scope_id, channel, category, window_type, window_start, count)
  VALUES (p_scope, p_scope_id, p_channel, p_category, 'hour', date_trunc('hour', now()), 1)
  ON CONFLICT (scope, scope_id, channel, category, window_type, window_start)
  DO UPDATE SET count = notif_throttle_counters.count + 1, updated_at = now();

  -- Day window
  INSERT INTO notif_throttle_counters (scope, scope_id, channel, category, window_type, window_start, count)
  VALUES (p_scope, p_scope_id, p_channel, p_category, 'day', date_trunc('day', now()), 1)
  ON CONFLICT (scope, scope_id, channel, category, window_type, window_start)
  DO UPDATE SET count = notif_throttle_counters.count + 1, updated_at = now();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_throttle_counter IS 'Increment throttle counter for all time windows';

-- ---------------------------------------------------------------------
-- 4. Check User Preferences (opt-in/out)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_user_preference(
  p_user_type TEXT,
  p_user_id UUID,
  p_channel notif_channel,
  p_category notif_category
)
RETURNS BOOLEAN AS $$
DECLARE
  v_prefs notif_preferences;
  v_channel_enabled BOOLEAN := true;
  v_category_enabled BOOLEAN := true;
  v_granular_enabled BOOLEAN := true;
BEGIN
  -- Get preferences
  SELECT * INTO v_prefs
  FROM notif_preferences
  WHERE user_type = p_user_type AND user_id = p_user_id;

  -- No preferences = allow all
  IF v_prefs IS NULL THEN
    RETURN true;
  END IF;

  -- Check channel-level opt-out
  CASE p_channel
    WHEN 'email' THEN v_channel_enabled := v_prefs.email_enabled;
    WHEN 'sms' THEN v_channel_enabled := v_prefs.sms_enabled;
    WHEN 'push' THEN v_channel_enabled := v_prefs.push_enabled;
    WHEN 'in_app' THEN v_channel_enabled := v_prefs.in_app_enabled;
    WHEN 'webhook' THEN v_channel_enabled := v_prefs.webhook_enabled;
  END CASE;

  IF NOT v_channel_enabled THEN
    RETURN false;
  END IF;

  -- Check category-level opt-out
  IF v_prefs.category_preferences ? p_category::TEXT THEN
    v_category_enabled := (v_prefs.category_preferences->>p_category::TEXT)::BOOLEAN;
    IF NOT v_category_enabled THEN
      RETURN false;
    END IF;
  END IF;

  -- Check granular preferences (channel + category)
  IF v_prefs.granular_preferences ? p_channel::TEXT THEN
    IF (v_prefs.granular_preferences->p_channel::TEXT) ? p_category::TEXT THEN
      v_granular_enabled := (v_prefs.granular_preferences->p_channel::TEXT->>p_category::TEXT)::BOOLEAN;
      IF NOT v_granular_enabled THEN
        RETURN false;
      END IF;
    END IF;
  END IF;

  -- Check quiet hours (if in_app or push)
  IF p_channel IN ('in_app', 'push') AND v_prefs.quiet_hours_enabled THEN
    DECLARE
      v_current_time TIME;
    BEGIN
      -- TODO: Convert to user's timezone
      v_current_time := CURRENT_TIME;

      IF v_prefs.quiet_hours_start < v_prefs.quiet_hours_end THEN
        -- Normal range (e.g., 22:00 - 08:00 next day)
        IF v_current_time >= v_prefs.quiet_hours_start AND v_current_time <= v_prefs.quiet_hours_end THEN
          RETURN false;
        END IF;
      ELSE
        -- Wraps midnight (e.g., 22:00 - 08:00)
        IF v_current_time >= v_prefs.quiet_hours_start OR v_current_time <= v_prefs.quiet_hours_end THEN
          RETURN false;
        END IF;
      END IF;
    END;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_user_preference IS 'Check if user has opted in for channel + category';

-- ---------------------------------------------------------------------
-- 5. Record Notification Engagement (opened/clicked)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION record_notification_engagement(
  p_delivery_id UUID,
  p_event_type TEXT, -- 'opened', 'clicked'
  p_clicked_url TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF p_event_type = 'opened' THEN
    UPDATE notif_deliveries
    SET opened_at = now()
    WHERE id = p_delivery_id AND opened_at IS NULL;
  ELSIF p_event_type = 'clicked' THEN
    UPDATE notif_deliveries
    SET clicked_at = now(),
        clicked_links = array_append(COALESCE(clicked_links, ARRAY[]::TEXT[]), p_clicked_url)
    WHERE id = p_delivery_id;
  END IF;

  -- Update Sira insights asynchronously (can be done via trigger)
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION record_notification_engagement IS 'Record when user opens or clicks a notification';

-- ---------------------------------------------------------------------
-- 6. Get Unread In-App Notifications Count
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_unread_notif_count(
  p_user_type TEXT,
  p_user_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM notif_in_app_logs
  WHERE user_type = p_user_type
    AND user_id = p_user_id
    AND read = false
    AND dismissed = false
    AND (expires_at IS NULL OR expires_at > now());

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_unread_notif_count IS 'Get count of unread in-app notifications for a user';

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Auto-update updated_at timestamp
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_notif_templates_updated_at BEFORE UPDATE ON notif_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notif_preferences_updated_at BEFORE UPDATE ON notif_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notif_throttles_updated_at BEFORE UPDATE ON notif_throttles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sira_notif_insights_updated_at BEFORE UPDATE ON sira_notif_insights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notif_webhook_configs_updated_at BEFORE UPDATE ON notif_webhook_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------
-- 2. Auto-update Sira insights on delivery engagement
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_sira_insights_on_engagement()
RETURNS TRIGGER AS $$
BEGIN
  -- Get recipient from request
  DECLARE
    v_request notif_requests;
  BEGIN
    SELECT * INTO v_request FROM notif_requests WHERE id = NEW.request_id;

    IF v_request IS NULL THEN
      RETURN NEW;
    END IF;

    -- Increment total_sent
    INSERT INTO sira_notif_insights (user_type, user_id, total_sent)
    VALUES (v_request.recipient_type, v_request.recipient_id, 1)
    ON CONFLICT (user_type, user_id)
    DO UPDATE SET total_sent = sira_notif_insights.total_sent + 1;

    -- If opened, increment total_opened and update engagement score
    IF NEW.opened_at IS NOT NULL AND (OLD.opened_at IS NULL OR OLD.opened_at IS DISTINCT FROM NEW.opened_at) THEN
      UPDATE sira_notif_insights
      SET total_opened = total_opened + 1,
          email_engagement_score = CASE WHEN NEW.channel = 'email' THEN LEAST(1.0, email_engagement_score + 0.01) ELSE email_engagement_score END,
          push_engagement_score = CASE WHEN NEW.channel = 'push' THEN LEAST(1.0, push_engagement_score + 0.01) ELSE push_engagement_score END
      WHERE user_type = v_request.recipient_type AND user_id = v_request.recipient_id;
    END IF;

    -- If clicked, increment total_clicked
    IF NEW.clicked_at IS NOT NULL AND (OLD.clicked_at IS NULL OR OLD.clicked_at IS DISTINCT FROM NEW.clicked_at) THEN
      UPDATE sira_notif_insights
      SET total_clicked = total_clicked + 1
      WHERE user_type = v_request.recipient_type AND user_id = v_request.recipient_id;
    END IF;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sira_insights_on_delivery_change
AFTER INSERT OR UPDATE ON notif_deliveries
FOR EACH ROW EXECUTE FUNCTION update_sira_insights_on_engagement();

-- ---------------------------------------------------------------------
-- 3. Auto-delete expired in-app notifications
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION delete_expired_in_app_notifications()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM notif_in_app_logs
  WHERE expires_at IS NOT NULL AND expires_at < now();

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger runs periodically (via cron or manual call)
-- For demo, attach to INSERT (in production, use pg_cron)
CREATE TRIGGER cleanup_expired_in_app_notifications
AFTER INSERT ON notif_in_app_logs
FOR EACH STATEMENT EXECUTE FUNCTION delete_expired_in_app_notifications();

-- =====================================================================
-- VIEWS
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Delivery Stats per Template
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW notif_template_stats AS
SELECT
  template_key,
  template_version,
  channel,
  COUNT(*) as total_deliveries,
  COUNT(*) FILTER (WHERE status = 'delivered') as delivered_count,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
  COUNT(*) FILTER (WHERE status = 'bounced') as bounced_count,
  COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as opened_count,
  COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) as clicked_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'delivered') / NULLIF(COUNT(*), 0), 2) as delivery_rate,
  ROUND(100.0 * COUNT(*) FILTER (WHERE opened_at IS NOT NULL) / NULLIF(COUNT(*) FILTER (WHERE status = 'delivered'), 0), 2) as open_rate,
  ROUND(100.0 * COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) / NULLIF(COUNT(*) FILTER (WHERE opened_at IS NOT NULL), 0), 2) as click_through_rate
FROM notif_deliveries
GROUP BY template_key, template_version, channel;

COMMENT ON VIEW notif_template_stats IS 'Aggregated delivery and engagement stats per template';

-- ---------------------------------------------------------------------
-- 2. Merchant Notification Dashboard
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW merchant_notif_dashboard AS
SELECT
  nr.recipient_id as merchant_id,
  COUNT(DISTINCT nr.id) as total_notifications,
  COUNT(DISTINCT nd.id) FILTER (WHERE nd.status = 'delivered') as delivered,
  COUNT(DISTINCT nd.id) FILTER (WHERE nd.status = 'failed') as failed,
  COUNT(DISTINCT nd.id) FILTER (WHERE nd.opened_at IS NOT NULL) as opened,
  COUNT(DISTINCT nd.id) FILTER (WHERE nd.clicked_at IS NOT NULL) as clicked,
  MAX(nd.queued_at) as last_notification_at
FROM notif_requests nr
LEFT JOIN notif_deliveries nd ON nd.request_id = nr.id
WHERE nr.recipient_type = 'merchant'
GROUP BY nr.recipient_id;

COMMENT ON VIEW merchant_notif_dashboard IS 'Per-merchant notification activity summary';

-- =====================================================================
-- SEED DATA (Default templates)
-- =====================================================================

-- Global template: Payment Success
INSERT INTO notif_templates (
  template_key, version, scope, category, channels, content, variables, status, is_default, created_by
) VALUES (
  'payment_success',
  1,
  'global',
  'transaction',
  ARRAY['email', 'sms', 'push', 'in_app']::notif_channel[],
  '{
    "fr": {
      "subject": "Paiement réussi - {{amount}}",
      "body_text": "Bonjour {{customer_name}},\n\nVotre paiement de {{amount}} a été traité avec succès.\n\nID de transaction: {{transaction_id}}\nDate: {{transaction_date}}\n\nMerci pour votre confiance.",
      "body_html": "<html><body><h1>Paiement réussi</h1><p>Bonjour {{customer_name}},</p><p>Votre paiement de <strong>{{amount}}</strong> a été traité avec succès.</p><p>ID: {{transaction_id}}<br>Date: {{transaction_date}}</p></body></html>",
      "sms_text": "Paiement de {{amount}} reçu avec succès. ID: {{transaction_id}}",
      "push_title": "Paiement réussi",
      "push_body": "{{amount}} - Transaction {{transaction_id}}"
    },
    "en": {
      "subject": "Payment successful - {{amount}}",
      "body_text": "Hello {{customer_name}},\n\nYour payment of {{amount}} has been processed successfully.\n\nTransaction ID: {{transaction_id}}\nDate: {{transaction_date}}\n\nThank you for your trust.",
      "body_html": "<html><body><h1>Payment successful</h1><p>Hello {{customer_name}},</p><p>Your payment of <strong>{{amount}}</strong> has been processed successfully.</p><p>ID: {{transaction_id}}<br>Date: {{transaction_date}}</p></body></html>",
      "sms_text": "Payment of {{amount}} received successfully. ID: {{transaction_id}}",
      "push_title": "Payment successful",
      "push_body": "{{amount}} - Transaction {{transaction_id}}"
    }
  }'::JSONB,
  ARRAY['customer_name', 'amount', 'transaction_id', 'transaction_date'],
  'active',
  true,
  '00000000-0000-0000-0000-000000000000'
);

-- Global template: Fraud Alert
INSERT INTO notif_templates (
  template_key, version, scope, category, channels, content, variables, status, is_default, created_by
) VALUES (
  'fraud_alert_high',
  1,
  'global',
  'fraud_alert',
  ARRAY['email', 'sms', 'push', 'in_app', 'webhook']::notif_channel[],
  '{
    "fr": {
      "subject": "🚨 ALERTE FRAUDE - Action requise",
      "body_text": "ALERTE FRAUDE CRITIQUE\n\nTransaction suspecte détectée:\n- Montant: {{amount}}\n- Pays: {{country}}\n- Raison: {{fraud_reason}}\n\nConnectez-vous immédiatement pour vérifier.",
      "body_html": "<html><body><h1 style=\"color:red;\">🚨 ALERTE FRAUDE</h1><p>Transaction suspecte détectée:</p><ul><li>Montant: {{amount}}</li><li>Pays: {{country}}</li><li>Raison: {{fraud_reason}}</li></ul><p><a href=\"{{dashboard_url}}\">Vérifier maintenant</a></p></body></html>",
      "sms_text": "ALERTE FRAUDE: Transaction {{amount}} depuis {{country}}. Raison: {{fraud_reason}}. Vérifiez votre dashboard.",
      "push_title": "🚨 Alerte Fraude",
      "push_body": "{{amount}} - {{fraud_reason}}",
      "webhook_payload": {
        "event": "fraud.alert.high",
        "transaction_id": "{{transaction_id}}",
        "amount": "{{amount}}",
        "country": "{{country}}",
        "reason": "{{fraud_reason}}"
      }
    },
    "en": {
      "subject": "🚨 FRAUD ALERT - Action required",
      "body_text": "CRITICAL FRAUD ALERT\n\nSuspicious transaction detected:\n- Amount: {{amount}}\n- Country: {{country}}\n- Reason: {{fraud_reason}}\n\nLog in immediately to verify.",
      "body_html": "<html><body><h1 style=\"color:red;\">🚨 FRAUD ALERT</h1><p>Suspicious transaction detected:</p><ul><li>Amount: {{amount}}</li><li>Country: {{country}}</li><li>Reason: {{fraud_reason}}</li></ul><p><a href=\"{{dashboard_url}}\">Verify now</a></p></body></html>",
      "sms_text": "FRAUD ALERT: Transaction {{amount}} from {{country}}. Reason: {{fraud_reason}}. Check your dashboard.",
      "push_title": "🚨 Fraud Alert",
      "push_body": "{{amount}} - {{fraud_reason}}",
      "webhook_payload": {
        "event": "fraud.alert.high",
        "transaction_id": "{{transaction_id}}",
        "amount": "{{amount}}",
        "country": "{{country}}",
        "reason": "{{fraud_reason}}"
      }
    }
  }'::JSONB,
  ARRAY['amount', 'country', 'fraud_reason', 'transaction_id', 'dashboard_url'],
  'active',
  true,
  '00000000-0000-0000-0000-000000000000'
);

-- Default throttle config (global)
INSERT INTO notif_throttles (scope, channel, category, max_per_minute, max_per_hour, max_per_day, bypass_for_critical)
VALUES
  ('global', 'email', 'marketing', 10, 100, 1000, true),
  ('global', 'sms', 'marketing', 5, 50, 500, true),
  ('global', 'email', 'transaction', 100, 1000, 10000, true),
  ('global', 'sms', 'transaction', 50, 500, 5000, true);

-- =====================================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================================

-- Partitioning suggestions for high-volume tables
COMMENT ON TABLE notif_deliveries IS 'PARTITIONING RECOMMENDED: Partition by queued_at (monthly) for high volume';
COMMENT ON TABLE notif_in_app_logs IS 'PARTITIONING RECOMMENDED: Partition by created_at (monthly)';
COMMENT ON TABLE notif_throttle_counters IS 'CLEANUP RECOMMENDED: Delete counters older than 7 days';

-- =====================================================================
-- GRANTS (Role-based access)
-- =====================================================================

-- Grant read-only to analytics role
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_role;

-- Grant full access to notification service
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO notification_service_role;

-- =====================================================================
-- COMPLETION
-- =====================================================================

-- Schema version
COMMENT ON SCHEMA public IS 'Brique 76 - Notifications v1.0.0 - 2025-11-12';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Brique 76 - Notifications schema created successfully';
  RAISE NOTICE '📊 Tables created: 9';
  RAISE NOTICE '⚙️ Functions created: 6';
  RAISE NOTICE '🔔 Triggers created: 6';
  RAISE NOTICE '📈 Views created: 2';
  RAISE NOTICE '🌍 Seed templates: 2 (payment_success, fraud_alert_high)';
  RAISE NOTICE '🚀 Ready for multi-channel notification delivery';
END $$;
