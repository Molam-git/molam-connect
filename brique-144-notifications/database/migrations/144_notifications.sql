-- BRIQUE 144 — Notifications Center (global: Email/SMS/Push)
-- Industrial multi-tenant notification system with templates, providers, and audit

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- User preferences (per user, Molam ID referenced)
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY,
  channels JSONB NOT NULL DEFAULT '{"email": true, "sms": true, "push": true}',
  dnd JSONB NULL,  -- {"start":"22:00","end":"07:00","tz":"Africa/Dakar"}
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_preferences_user ON notification_preferences(user_id);

-- Templates (multi-tenant, versioned, multi-language)
CREATE TABLE IF NOT EXISTS notif_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_type TEXT NOT NULL,  -- 'global'|'merchant'|'agent'|'internal'
  tenant_id UUID NULL,
  key TEXT NOT NULL,  -- 'payment.succeeded', 'kyc.verified', etc.
  lang TEXT NOT NULL DEFAULT 'en',
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  metadata JSONB,
  version INT NOT NULL DEFAULT 1,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'draft')),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_type, tenant_id, key, lang, version)
);

CREATE INDEX IF NOT EXISTS idx_notif_templates_key ON notif_templates(key);
CREATE INDEX IF NOT EXISTS idx_notif_templates_status ON notif_templates(status);
CREATE INDEX IF NOT EXISTS idx_notif_templates_tenant ON notif_templates(tenant_type, tenant_id);

-- Notifications queue (immutable audit log)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_type TEXT NOT NULL,
  tenant_id UUID NULL,
  user_id UUID NULL,
  target JSONB NOT NULL,  -- {email:, phone:, push_tokens:[]}
  type TEXT NOT NULL,
  template_key TEXT NOT NULL,
  template_lang TEXT DEFAULT 'en',
  params JSONB,
  channel_preference JSONB,
  idempotency_key TEXT UNIQUE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'delivering', 'sent', 'failed', 'quarantined')),
  next_attempt_at TIMESTAMPTZ DEFAULT now(),
  attempts INT DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_status_next ON notifications(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_type, tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_idempotency ON notifications(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Notification delivery logs (audit trail)
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
  channel TEXT,  -- 'email'|'sms'|'push'
  provider TEXT,  -- 'ses','smtp','twilio','fcm','apns'
  provider_ref TEXT,
  status TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_notif ON notification_logs(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_channel ON notification_logs(channel);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created ON notification_logs(created_at DESC);

-- Provider configurations (metadata only, secrets in Vault)
CREATE TABLE IF NOT EXISTS notification_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_type TEXT NOT NULL,
  tenant_id UUID NULL,
  provider_key TEXT NOT NULL UNIQUE,  -- 'smtp:default','twilio:primary','fcm:global'
  type TEXT NOT NULL CHECK (type IN ('smtp', 'ses', 'twilio', 'fcm', 'apns', 'webpush')),
  priority INT DEFAULT 100,
  enabled BOOLEAN DEFAULT true,
  region TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_providers_type ON notification_providers(type);
CREATE INDEX IF NOT EXISTS idx_notification_providers_enabled ON notification_providers(enabled);
CREATE INDEX IF NOT EXISTS idx_notification_providers_tenant ON notification_providers(tenant_type, tenant_id);

-- Sample global templates
INSERT INTO notif_templates(tenant_type, key, lang, subject, body_text, body_html, status) VALUES
  ('global', 'payment.succeeded', 'en', 'Payment Successful',
   'Your payment of {{amount}} {{currency}} was successful. Transaction ID: {{tx_id}}',
   '<p>Your payment of <strong>{{amount}} {{currency}}</strong> was successful.</p><p>Transaction ID: {{tx_id}}</p>',
   'active'),
  ('global', 'payment.succeeded', 'fr', 'Paiement réussi',
   'Votre paiement de {{amount}} {{currency}} a été effectué avec succès. ID de transaction: {{tx_id}}',
   '<p>Votre paiement de <strong>{{amount}} {{currency}}</strong> a été effectué avec succès.</p><p>ID de transaction: {{tx_id}}</p>',
   'active'),
  ('global', 'kyc.verified', 'en', 'KYC Verified',
   'Hello {{name}}, your identity verification is complete. You can now access all features.',
   '<p>Hello <strong>{{name}}</strong>,</p><p>Your identity verification is complete. You can now access all features.</p>',
   'active'),
  ('global', 'kyc.verified', 'fr', 'KYC Vérifié',
   'Bonjour {{name}}, votre vérification d''identité est terminée. Vous pouvez maintenant accéder à toutes les fonctionnalités.',
   '<p>Bonjour <strong>{{name}}</strong>,</p><p>Votre vérification d''identité est terminée. Vous pouvez maintenant accéder à toutes les fonctionnalités.</p>',
   'active')
ON CONFLICT DO NOTHING;

-- Sample provider configurations (metadata only)
INSERT INTO notification_providers(tenant_type, provider_key, type, priority, enabled, metadata) VALUES
  ('global', 'smtp:default', 'smtp', 100, true,
   '{"host":"smtp.example.com","port":587,"secure":false,"from":"noreply@molam.com"}'),
  ('global', 'twilio:primary', 'twilio', 100, true,
   '{"from":"+221770000000"}'),
  ('global', 'fcm:global', 'fcm', 100, true,
   '{"projectId":"molam-app"}')
ON CONFLICT DO NOTHING;
