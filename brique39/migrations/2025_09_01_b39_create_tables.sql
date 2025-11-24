CREATE TABLE IF NOT EXISTS fraud_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  event_type TEXT NOT NULL,
  score NUMERIC(6,4),
  model_version TEXT,
  decision JSONB,
  explain JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS features_user_daily (
  user_id UUID NOT NULL,
  day DATE NOT NULL,
  tx_count_7d INT DEFAULT 0,
  tx_vol_7d NUMERIC(18,4) DEFAULT 0,
  p2p_count_7d INT DEFAULT 0,
  cashout_count_7d INT DEFAULT 0,
  dispute_count_30d INT DEFAULT 0,
  device_new_count_30d INT DEFAULT 0,
  kyc_level TEXT,
  sira_score NUMERIC(6,4) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(user_id, day)
);

CREATE TABLE IF NOT EXISTS features_agent_daily (
  agent_id UUID NOT NULL,
  day DATE NOT NULL,
  cashin_self_count_7d INT DEFAULT 0,
  cashin_other_count_7d INT DEFAULT 0,
  cashout_count_7d INT DEFAULT 0,
  avg_float NUMERIC(18,4) DEFAULT 0,
  dispute_rate_30d NUMERIC(6,4) DEFAULT 0,
  sira_score NUMERIC(6,4) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(agent_id, day)
);

CREATE TABLE IF NOT EXISTS ml_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  metadata JSONB,
  path TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ml_model_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID REFERENCES ml_models(id),
  eval_date DATE,
  auc NUMERIC(6,4),
  precision_at_k NUMERIC(6,4),
  recall NUMERIC(6,4),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);