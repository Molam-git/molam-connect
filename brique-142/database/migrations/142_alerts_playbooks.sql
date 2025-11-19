/**
 * BRIQUE 142 — Alerts & Playbooks UI
 * Système temps réel d'alertes et playbooks automatisés
 */

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) Alerts (détection & notifications)
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('payout_delay','fraud_detected','bank_failover','suspicious_txn','float_alert','reconciliation_mismatch','rate_limit','webhook_failure','custom')),
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'new' CHECK (status IN ('new','acknowledged','in_progress','resolved','dismissed')),
  priority INTEGER DEFAULT 50, -- 0-100, SIRA-computed
  detected_at TIMESTAMPTZ DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2) Playbooks (templates d'action)
CREATE TABLE IF NOT EXISTS playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  triggers JSONB, -- conditions: ex { "alert_type":"fraud_detected", "severity":"critical", "threshold":5 }
  actions JSONB NOT NULL, -- actions: [{type:"freeze_account", params:{}}, {type:"reverse_payout"}, {type:"notify_ops"}]
  auto_execute BOOLEAN DEFAULT false, -- si true, SIRA peut exécuter automatiquement
  require_approval BOOLEAN DEFAULT true,
  created_by UUID,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3) Exécutions de playbooks (audit immuable)
CREATE TABLE IF NOT EXISTS playbook_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id UUID REFERENCES playbooks(id),
  alert_id UUID REFERENCES alerts(id),
  executed_by UUID, -- agent interne ou 'sira-auto'
  execution_mode TEXT DEFAULT 'manual' CHECK (execution_mode IN ('manual','auto','scheduled')),
  actions JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','running','success','partial','failed','rolled_back')),
  logs JSONB DEFAULT '[]', -- [{step:"freeze_account", status:"success", timestamp:"..."}, ...]
  result JSONB,
  executed_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 4) Alert rules (configuration dynamique)
CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  condition JSONB NOT NULL, -- ex: {"metric":"payout_delay_minutes", "operator":">", "threshold":60}
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  playbook_id UUID REFERENCES playbooks(id), -- auto-trigger ce playbook
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5) Notification channels
CREATE TABLE IF NOT EXISTS alert_notification_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('email','sms','slack','webhook','push','pagerduty')),
  config JSONB NOT NULL, -- ex: {"email":"ops@molam.com"} or {"slack_webhook":"https://..."}
  severity_filter TEXT[], -- ['critical','warning'] ou null pour tous
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6) Alert notifications sent (tracking)
CREATE TABLE IF NOT EXISTS alert_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID REFERENCES alerts(id),
  channel_id UUID REFERENCES alert_notification_channels(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','delivered')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(type, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_playbook_executions_alert ON playbook_executions(alert_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_playbook_executions_status ON playbook_executions(status, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_notifications_alert ON alert_notifications(alert_id);

-- View dashboard
CREATE OR REPLACE VIEW alerts_summary AS
SELECT
  a.id,
  a.type,
  a.severity,
  a.message,
  a.status,
  a.priority,
  a.detected_at,
  a.resolved_at,
  (SELECT COUNT(*) FROM playbook_executions WHERE alert_id = a.id) as playbooks_executed,
  (SELECT COUNT(*) FROM alert_notifications WHERE alert_id = a.id AND status = 'delivered') as notifications_sent
FROM alerts a
ORDER BY a.priority DESC, a.detected_at DESC;

-- Sample alert rules
INSERT INTO alert_rules(name, description, condition, alert_type, severity, enabled)
VALUES (
  'Payout Delay Critical',
  'Alert si payout delayed > 60 min',
  '{"metric":"payout_delay_minutes", "operator":">", "threshold":60}'::JSONB,
  'payout_delay',
  'critical',
  true
);

INSERT INTO alert_rules(name, description, condition, alert_type, severity, enabled)
VALUES (
  'Suspicious Transaction Pattern',
  'Alert si pattern suspect détecté',
  '{"metric":"txn_risk_score", "operator":">", "threshold":0.8}'::JSONB,
  'suspicious_txn',
  'warning',
  true
);

-- Sample playbook
INSERT INTO playbooks(name, description, triggers, actions, auto_execute, require_approval)
VALUES (
  'Freeze Suspicious Account',
  'Freeze account when fraud detected',
  '{"alert_type":"fraud_detected", "severity":"critical"}'::JSONB,
  '[
    {"type":"freeze_account", "params":{"reason":"fraud_detected"}},
    {"type":"notify_ops", "params":{"channel":"slack", "message":"Account frozen due to fraud"}},
    {"type":"create_investigation", "params":{"priority":"high"}}
  ]'::JSONB,
  false,
  true
);

INSERT INTO playbooks(name, description, triggers, actions, auto_execute)
VALUES (
  'Auto-Retry Failed Payout',
  'Retry payout automatically on bank timeout',
  '{"alert_type":"payout_delay", "severity":"warning"}'::JSONB,
  '[
    {"type":"retry_payout", "params":{"max_retries":3, "delay_seconds":300}},
    {"type":"log_event", "params":{"event":"payout_retry_triggered"}}
  ]'::JSONB,
  true
);

-- Sample notification channel
INSERT INTO alert_notification_channels(name, channel_type, config, severity_filter, active)
VALUES (
  'Ops Slack Critical',
  'slack',
  '{"webhook_url":"https://hooks.slack.com/services/xxx", "channel":"#ops-alerts"}'::JSONB,
  ARRAY['critical'],
  true
);

INSERT INTO alert_notification_channels(name, channel_type, config, active)
VALUES (
  'Ops Email All',
  'email',
  '{"to":"ops@molam.com", "subject_prefix":"[Molam Alert]"}'::JSONB,
  true
);
