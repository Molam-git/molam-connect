-- 1) Agent insurance policies
CREATE TABLE IF NOT EXISTS agent_insurance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id BIGINT NOT NULL,
  policy_status TEXT NOT NULL DEFAULT 'draft',
  cover_pct NUMERIC(5,2) DEFAULT 50.0,
  coverage_limit NUMERIC(18,2) DEFAULT 0,
  premium_period TEXT DEFAULT 'weekly',
  premium_amount NUMERIC(18,2) DEFAULT 0,
  currency TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  reinsurance_partner_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2) Agent risk scores (time series)
CREATE TABLE IF NOT EXISTS agent_risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id BIGINT NOT NULL,
  score NUMERIC(5,2) NOT NULL,
  factors JSONB,
  computed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_risk_agent ON agent_risk_scores(agent_id);

-- 3) Insurance claims
CREATE TABLE IF NOT EXISTS agent_insurance_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES agent_insurance_policies(id),
  agent_id BIGINT NOT NULL,
  claim_amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT DEFAULT 'submitted',
  evidence JSONB,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4) Reinsurance partners
CREATE TABLE IF NOT EXISTS reinsurance_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT,
  coverage_pct NUMERIC(5,2),
  fee_pct NUMERIC(5,2),
  contact JSONB,
  status TEXT DEFAULT 'onboarding',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5) Premium invoices / ledger
CREATE TABLE IF NOT EXISTS agent_insurance_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES agent_insurance_policies(id),
  agent_id BIGINT NOT NULL,
  period_start DATE,
  period_end DATE,
  amount NUMERIC(18,2) NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);