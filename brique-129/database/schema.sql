-- ============================================================================
-- Brique 129 — Settlement SLA Monitoring & Alerts
-- ============================================================================

-- SLA policy definitions per bank/rail/currency/zone
CREATE TABLE IF NOT EXISTS settlement_sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_profile_id UUID,
  rail TEXT,
  country TEXT,
  currency TEXT,
  metric TEXT NOT NULL CHECK (metric IN ('max_lag_hours','match_rate','success_rate','pending_count')),
  threshold NUMERIC NOT NULL,
  operator TEXT NOT NULL DEFAULT '>=' CHECK (operator IN ('>=','<=','<','>')),
  severity TEXT NOT NULL DEFAULT 'critical' CHECK (severity IN ('info','warning','critical')),
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sla_policies_enabled ON settlement_sla_policies(enabled);
CREATE INDEX IF NOT EXISTS idx_sla_policies_bank ON settlement_sla_policies(bank_profile_id);

-- Alert events (immutable audit)
CREATE TABLE IF NOT EXISTS settlement_sla_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sla_policy_id UUID REFERENCES settlement_sla_policies(id),
  bank_profile_id UUID,
  rail TEXT,
  country TEXT,
  metric TEXT NOT NULL,
  observed_value NUMERIC NOT NULL,
  threshold NUMERIC NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','suppressed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sla_alerts_status ON settlement_sla_alerts(status);
CREATE INDEX IF NOT EXISTS idx_sla_alerts_created ON settlement_sla_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sla_alerts_policy ON settlement_sla_alerts(sla_policy_id);

-- Auto-remediation rules
CREATE TABLE IF NOT EXISTS sla_auto_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sla_policy_id UUID REFERENCES settlement_sla_policies(id),
  action_type TEXT NOT NULL CHECK (action_type IN ('auto_pause_bank','auto_reroute','create_ticket','notify','email','sms','slack')),
  params JSONB DEFAULT '{}'::jsonb,
  cooldown_seconds INTEGER DEFAULT 3600,
  last_executed_at TIMESTAMPTZ,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_actions_policy ON sla_auto_actions(sla_policy_id);

-- Incident tickets
CREATE TABLE IF NOT EXISTS sla_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID REFERENCES settlement_sla_alerts(id),
  ticket_ref TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  assigned_to UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_incidents_alert ON sla_incidents(alert_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON sla_incidents(status);

-- Alert notification log
CREATE TABLE IF NOT EXISTS sla_alert_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID REFERENCES settlement_sla_alerts(id),
  channel TEXT NOT NULL,
  recipient TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_alert ON sla_alert_notifications(alert_id);
