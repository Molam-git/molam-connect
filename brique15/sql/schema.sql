-- 1. Templates (ICU messageformat per event/channel/locale)
CREATE TABLE IF NOT EXISTS notification_templates (
  template_id       BIGSERIAL PRIMARY KEY,
  event_key         TEXT NOT NULL,
  channel           TEXT NOT NULL,
  locale            TEXT NOT NULL,
  subject_template  TEXT,
  body_template     TEXT NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  version           INT NOT NULL DEFAULT 1,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_key, channel, locale, version)
);

-- 2. User channel endpoints
CREATE TABLE IF NOT EXISTS user_channels (
  user_id           UUID NOT NULL,
  channel           TEXT NOT NULL,
  endpoint          TEXT NOT NULL,
  is_verified       BOOLEAN NOT NULL DEFAULT FALSE,
  is_primary        BOOLEAN NOT NULL DEFAULT FALSE,
  provider_hint     TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, channel, endpoint)
);

-- 3. Preferences (opt-in/out by event/channel + quiet hours)
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id           UUID NOT NULL,
  event_key         TEXT NOT NULL,
  channel           TEXT NOT NULL,
  opted_in          BOOLEAN NOT NULL DEFAULT TRUE,
  quiet_hours_start TIME,
  quiet_hours_end   TIME,
  dnd               BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by        UUID,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event_key, channel)
);

-- 4. Outbox (idempotence + retries)
CREATE TABLE IF NOT EXISTS notification_outbox (
  outbox_id         BIGSERIAL PRIMARY KEY,
  event_key         TEXT NOT NULL,
  user_id           UUID NOT NULL,
  payload_json      JSONB NOT NULL,
  channels          TEXT[] NOT NULL,
  attempt_count     INT NOT NULL DEFAULT 0,
  max_attempts      INT NOT NULL DEFAULT 6,
  status            TEXT NOT NULL DEFAULT 'PENDING',
  idempotency_key   TEXT UNIQUE,
  available_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Delivery traces (per channel)
CREATE TABLE IF NOT EXISTS notification_delivery (
  delivery_id       BIGSERIAL PRIMARY KEY,
  outbox_id         BIGINT NOT NULL REFERENCES notification_outbox(outbox_id) ON DELETE CASCADE,
  user_id           UUID NOT NULL,
  channel           TEXT NOT NULL,
  endpoint          TEXT,
  provider          TEXT,
  provider_msg_id   TEXT,
  status            TEXT NOT NULL DEFAULT 'QUEUED',
  error_code        TEXT,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Minimal in-app store (for inbox)
CREATE TABLE IF NOT EXISTS inapp_notifications (
  inapp_id          BIGSERIAL PRIMARY KEY,
  user_id           UUID NOT NULL,
  event_key         TEXT NOT NULL,
  title             TEXT,
  body              TEXT NOT NULL,
  locale            TEXT NOT NULL,
  read              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_outbox_status_available ON notification_outbox(status, available_at);
CREATE INDEX IF NOT EXISTS idx_delivery_user ON notification_delivery(user_id, channel, status);
CREATE INDEX IF NOT EXISTS idx_inapp_user ON inapp_notifications(user_id, created_at DESC);