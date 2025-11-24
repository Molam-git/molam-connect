CREATE TABLE IF NOT EXISTS notification_templates (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  lang TEXT NOT NULL,
  channel TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_type, lang, channel, version)
);

CREATE TABLE IF NOT EXISTS user_notification_prefs (
  user_id BIGINT PRIMARY KEY,
  lang TEXT,
  currency TEXT,
  tz TEXT,
  push_enabled BOOLEAN DEFAULT TRUE,
  sms_enabled  BOOLEAN DEFAULT TRUE,
  email_enabled BOOLEAN DEFAULT TRUE,
  ussd_enabled  BOOLEAN DEFAULT FALSE,
  quiet_hours JSONB DEFAULT '{"start":"22:00","end":"07:00"}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL,
  user_id BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  lang TEXT NOT NULL,
  currency TEXT NOT NULL,
  payload JSONB NOT NULL,
  rendered_subject TEXT,
  rendered_body TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id, channel)
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id BIGSERIAL PRIMARY KEY,
  outbox_id BIGINT NOT NULL REFERENCES notification_outbox(id),
  provider TEXT NOT NULL,
  provider_msg_id TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbox_status ON notification_outbox(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_outbox_event ON notification_outbox(event_type, created_at);