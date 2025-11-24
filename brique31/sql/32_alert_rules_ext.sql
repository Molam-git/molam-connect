-- Extension des règles d'alertes pour la notification vocale
-- 1) Extend alert_rules with channels and voice templates
ALTER TABLE IF EXISTS alert_rules
  ADD COLUMN IF NOT EXISTS notify_channels TEXT[] DEFAULT ARRAY['webhook','email'],
  ADD COLUMN IF NOT EXISTS voice_template_id TEXT,
  ADD COLUMN IF NOT EXISTS country_priority JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS retry_policy JSONB DEFAULT '{"retries":3,"interval_sec":60}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_updated_by TEXT,
  ADD COLUMN IF NOT EXISTS webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS email_list TEXT[],
  ADD COLUMN IF NOT EXISTS sms_template TEXT;

-- 2) Delivery logs for notifications
CREATE TABLE IF NOT EXISTS alert_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID REFERENCES dashboard_alerts(id),
  rule_id BIGINT,
  channel TEXT NOT NULL,        -- webhook,email,sms,voice
  target TEXT,                  -- phone, email, webhook url
  status TEXT NOT NULL,         -- queued, sent, delivered, failed
  detail JSONB,
  attempt INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_delivery_alert ON alert_delivery_logs(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_delivery_rule ON alert_delivery_logs(rule_id);

-- 3) Voice templates table
CREATE TABLE IF NOT EXISTS voice_templates (
  id TEXT PRIMARY KEY,
  language TEXT,
  country TEXT,
  tts_text TEXT,
  ivr_flow JSONB,   -- optional advanced IVR instructions
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Audit logs table (si elle n'existe pas)
CREATE TABLE IF NOT EXISTS molam_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  actor TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);