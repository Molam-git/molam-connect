-- Brique 31 - Tables pour l'aggregation temps réel
-- 1) Realtime metrics (high frequency, small row size)
CREATE TABLE IF NOT EXISTS realtime_metrics (
  id BIGSERIAL PRIMARY KEY,
  metric_key TEXT NOT NULL,     -- e.g. "txn.count", "txn.amount", "float.opening"
  dimension JSONB NOT NULL,     -- { "agent_id": 123, "country":"SN", "zone":"CEDEAO", "module":"pay" }
  value NUMERIC(24,6) NOT NULL,
  currency TEXT DEFAULT 'USD',
  ts TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_realtime_metrics_key_ts ON realtime_metrics(metric_key, ts DESC);
CREATE INDEX IF NOT EXISTS idx_realtime_metrics_dim ON realtime_metrics USING GIN (dimension jsonb_path_ops);

-- 2) Dashboard alerts
CREATE TABLE IF NOT EXISTS dashboard_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,       -- info/warn/critical
  payload JSONB,
  triggered_by TEXT,            -- service or SIRA signal id
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  rule_id BIGINT REFERENCES alert_rules(id)
);

-- 3) Aggregated view (materialized daily by country/zone)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_kpi_by_zone AS
SELECT
  (occurred_at AT TIME ZONE 'UTC')::date AS day,
  country,
  zone,
  SUM(amount) FILTER (WHERE status='succeeded') AS total_volume_local,
  SUM(fee_molam) FILTER (WHERE status='succeeded') AS total_fees_molam,
  COUNT(*) FILTER (WHERE status='succeeded') AS total_count
FROM wallet_transactions
GROUP BY day, country, zone;

CREATE INDEX IF NOT EXISTS idx_mv_kpi_zone ON mv_kpi_by_zone(day, country, zone);

-- 4) Alert rules table
CREATE TABLE IF NOT EXISTS alert_rules (
  id BIGSERIAL PRIMARY KEY,
  name TEXT,
  region TEXT,
  country TEXT,
  metric_key TEXT,
  operator TEXT,   -- '>', '<', '>='
  threshold NUMERIC(24,6),
  severity TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);