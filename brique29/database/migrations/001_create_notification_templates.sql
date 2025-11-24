-- notifications_templates.sql

-- Table principale : templates
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'push', 'ussd', 'voice')),
  lang TEXT NOT NULL DEFAULT 'en',
  version INT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT false,
  created_by UUID REFERENCES molam_users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(template_key, channel, lang, version)
);

-- Audit : chaque modification
CREATE TABLE IF NOT EXISTS notification_templates_audit (
  id BIGSERIAL PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES notification_templates(id),
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'activated', 'deactivated')),
  actor_id UUID REFERENCES molam_users(id),
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_templates_key_lang_active 
ON notification_templates(template_key, lang, is_active);

CREATE INDEX IF NOT EXISTS idx_templates_channel_lang 
ON notification_templates(channel, lang);

CREATE INDEX IF NOT EXISTS idx_templates_audit_template_id 
ON notification_templates_audit(template_id);

CREATE INDEX IF NOT EXISTS idx_templates_audit_created_at 
ON notification_templates_audit(created_at);

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_notification_templates_updated_at 
    BEFORE UPDATE ON notification_templates 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();