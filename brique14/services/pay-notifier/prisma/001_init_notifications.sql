-- Migration: 001_init_notifications.sql
-- Create notification system tables

CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,             -- e.g., txn.success, bill.reminder, security.alert
  version INT NOT NULL DEFAULT 1,
  channel TEXT NOT NULL,                 -- push|sms|email|ussd|whatsapp
  subject JSONB,                         -- email/push title (multilingual)
  body JSONB NOT NULL,                   -- body (multilingual) with placeholders
  variables TEXT[] NOT NULL,             -- ["amount","currency","merchant","tx_ref"]
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_notification_prefs (
  user_id UUID PRIMARY KEY REFERENCES molam_users(id) ON DELETE CASCADE,
  lang TEXT NOT NULL DEFAULT 'en',
  currency TEXT NOT NULL DEFAULT 'USD',
  country_code TEXT,                     -- e.g., SN, CI, US
  channels JSONB NOT NULL DEFAULT '{"push":true,"sms":true,"email":true,"ussd":false,"whatsapp":false}',
  marketing_opt_in BOOLEAN DEFAULT FALSE,
  quiet_hours JSONB DEFAULT '{"start":"22:00","end":"07:00"}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS molam_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES molam_users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                    -- txn|reward|bill|security|system
  template_code TEXT NOT NULL,
  template_version INT NOT NULL,
  channel TEXT NOT NULL,                 -- push|sms|email|ussd|whatsapp
  locale TEXT NOT NULL,                  -- fr|en|...
  title TEXT,                            -- denormalized for quick fetch (email/push)
  message TEXT NOT NULL,                 -- rendered content
  currency TEXT DEFAULT 'USD',
  amount NUMERIC(18,2),
  tx_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  priority TEXT NOT NULL DEFAULT 'normal',  -- low|normal|high|critical
  status TEXT NOT NULL DEFAULT 'queued',    -- queued|sent|failed|blocked
  spam_reason TEXT,
  idempotency_key TEXT,                   -- to dedupe publisher calls
  retries INT DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_notif_idem ON molam_notifications(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_notif_user_time ON molam_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_notif_status_priority ON molam_notifications(status, priority);

-- immutable audit of outbound communications
CREATE TABLE IF NOT EXISTS notif_audit_wal (
  seq BIGSERIAL PRIMARY KEY,
  notif_id UUID NOT NULL REFERENCES molam_notifications(id) ON DELETE CASCADE,
  event TEXT NOT NULL,                   -- queued|rendered|sent|failed|blocked
  details JSONB,
  at TIMESTAMPTZ DEFAULT now()
);

-- Insert sample templates
INSERT INTO notification_templates (code, channel, subject, body, variables) VALUES
(
  'txn.success','push',
  '{"en":"Payment successful","fr":"Paiement réussi"}',
  '{"en":"You paid {{amount}} {{currency}} to {{merchant}} (Ref: {{tx_ref}}).","fr":"Vous avez payé {{amount}} {{currency}} à {{merchant}} (Réf: {{tx_ref}})."}',
  ARRAY['amount','currency','merchant','tx_ref']
),
(
  'bill.reminder','sms',
  '{}',
  '{"en":"Bill {{provider}} due {{due_date}}: {{amount}} {{currency}}. Pay in Molam → Bills.","fr":"Facture {{provider}} échéance {{due_date}} : {{amount}} {{currency}}. Payer dans Molam → Factures."}',
  ARRAY['provider','due_date','amount','currency']
),
(
  'security.alert','email',
  '{"en":"Security alert: new device","fr":"Alerte sécurité : nouvel appareil"}',
  '{"en":"Your Molam account was accessed from {{device}} at {{time}}.","fr":"Votre compte Molam a été accédé depuis {{device}} à {{time}}."}',
  ARRAY['device','time']
)
ON CONFLICT (code, channel) DO NOTHING;