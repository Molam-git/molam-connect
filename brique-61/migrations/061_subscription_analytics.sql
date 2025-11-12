-- ============================================
-- Brique 61: Subscription Analytics & Churn Prevention
-- Description: Analytics temps réel + prévention churn avec SIRA
-- ============================================

-- 1) Cohort metrics & analytics
CREATE TABLE IF NOT EXISTS subscription_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  cohort_date DATE NOT NULL,
  plan_id UUID,
  country TEXT,
  currency TEXT,
  mrr NUMERIC(18,2),
  arr NUMERIC(18,2),
  arpu NUMERIC(18,2),
  cltv NUMERIC(18,2),
  churn_rate NUMERIC(5,2),
  active_count INT DEFAULT 0,
  cancelled_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_merchant ON subscription_analytics(merchant_id);
CREATE INDEX IF NOT EXISTS idx_analytics_cohort ON subscription_analytics(cohort_date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_merchant_cohort ON subscription_analytics(merchant_id, cohort_date DESC);

-- 2) Churn predictions by SIRA
CREATE TABLE IF NOT EXISTS churn_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL,
  merchant_id UUID NOT NULL,
  risk_score NUMERIC(5,2) NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  predicted_reason TEXT,
  recommended_action JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','applied','rejected')),
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_churn_subscription ON churn_predictions(subscription_id);
CREATE INDEX IF NOT EXISTS idx_churn_merchant ON churn_predictions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_churn_status ON churn_predictions(status);
CREATE INDEX IF NOT EXISTS idx_churn_risk ON churn_predictions(risk_score DESC);

-- 3) Feedback loop (Ops / Merchant)
CREATE TABLE IF NOT EXISTS sira_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  churn_prediction_id UUID NOT NULL REFERENCES churn_predictions(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('ops','merchant','system')),
  action TEXT NOT NULL CHECK (action IN ('approve','reject','modify')),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_prediction ON sira_feedback(churn_prediction_id);
CREATE INDEX IF NOT EXISTS idx_feedback_actor ON sira_feedback(actor_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON sira_feedback(created_at DESC);

-- 4) Audit logs
CREATE TABLE IF NOT EXISTS molam_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON molam_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON molam_audit_logs(created_at DESC);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_analytics_updated_at
  BEFORE UPDATE ON subscription_analytics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_churn_updated_at
  BEFORE UPDATE ON churn_predictions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Commentaires
COMMENT ON TABLE subscription_analytics IS 'Cohort-based subscription analytics (MRR, ARR, churn rate)';
COMMENT ON TABLE churn_predictions IS 'SIRA-powered churn predictions with risk scores';
COMMENT ON TABLE sira_feedback IS 'Human feedback loop for SIRA learning';
COMMENT ON COLUMN churn_predictions.risk_score IS 'Churn risk 0-100, higher = more risk';
COMMENT ON COLUMN churn_predictions.recommended_action IS 'SIRA recommendation: {type:"discount", value:10}';
