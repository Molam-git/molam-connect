-- ============================================================================
-- Molam Approval Notifications - Database Schema
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1) Notification Audit (immutable log of all email notifications sent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id UUID NOT NULL,        -- Link to approval_requests (B135)
  recipient_email TEXT NOT NULL,
  recipient_id UUID NOT NULL,
  recipient_role TEXT NOT NULL,
  notification_type TEXT NOT NULL,          -- 'approval_request' | 'expiry_warning' | 'approved' | 'rejected'
  template_used TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ DEFAULT now(),
  smtp_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',      -- 'sent' | 'failed' | 'bounced'
  error_details TEXT
);

CREATE INDEX IF NOT EXISTS idx_notification_audit_request ON notification_audit(approval_request_id);
CREATE INDEX IF NOT EXISTS idx_notification_audit_recipient ON notification_audit(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notification_audit_sent ON notification_audit(sent_at);

-- ============================================================================
-- 2) Email Action Tokens (signed JWT tokens for one-click approve/reject)
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_action_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,          -- SHA256 hash of JWT token
  action TEXT NOT NULL CHECK (action IN ('approve', 'reject')),
  recipient_id UUID NOT NULL,
  recipient_email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by_ip TEXT,
  used_by_user_agent TEXT,
  revoked BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_email_tokens_hash ON email_action_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_email_tokens_request ON email_action_tokens(approval_request_id);
CREATE INDEX IF NOT EXISTS idx_email_tokens_expires ON email_action_tokens(expires_at);

-- ============================================================================
-- 3) Email Click Audit (track all email link clicks for analytics)
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_click_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES email_action_tokens(id),
  approval_request_id UUID NOT NULL,
  action TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  clicked_at TIMESTAMPTZ DEFAULT now(),
  result TEXT NOT NULL,                     -- 'success' | 'expired' | 'invalid' | 'already_used' | 'revoked'
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_click_audit_token ON email_click_audit(token_id);
CREATE INDEX IF NOT EXISTS idx_email_click_audit_request ON email_click_audit(approval_request_id);
CREATE INDEX IF NOT EXISTS idx_email_click_audit_clicked ON email_click_audit(clicked_at);

-- ============================================================================
-- 4) Notification Preferences (user preferences for notifications)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY,
  email_enabled BOOLEAN DEFAULT TRUE,
  sms_enabled BOOLEAN DEFAULT FALSE,
  push_enabled BOOLEAN DEFAULT TRUE,
  approval_request_email BOOLEAN DEFAULT TRUE,
  expiry_warning_email BOOLEAN DEFAULT TRUE,
  approval_decision_email BOOLEAN DEFAULT TRUE,
  language TEXT DEFAULT 'fr',
  timezone TEXT DEFAULT 'UTC',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_prefs_user ON notification_preferences(user_id);
