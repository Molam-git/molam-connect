CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  entity TEXT,
  severity TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(type);
CREATE INDEX IF NOT EXISTS idx_alerts_entity ON alerts(entity);

CREATE TABLE IF NOT EXISTS bank_health_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_profile_id UUID NOT NULL,
  latency_ms INTEGER,
  success_rate NUMERIC(5, 4),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  anomalies JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_bank_health_bank ON bank_health_logs(bank_profile_id);
CREATE INDEX IF NOT EXISTS idx_bank_health_checked_at ON bank_health_logs(checked_at DESC);

