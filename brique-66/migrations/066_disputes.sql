-- ============================================================================
-- Brique 66 — Disputes & Chargebacks (Connect)
-- ============================================================================
-- Purpose: Dispute and chargeback management for Connect transactions
-- Features: Evidence submission, network sync, fee tracking, resolution workflow
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- TABLE: disputes
-- Purpose: Track all disputes and chargebacks
-- ============================================================================
CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connect_tx_id UUID NOT NULL,
  merchant_id UUID NOT NULL,
  customer_id UUID,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  reason TEXT,
  dispute_type TEXT DEFAULT 'chargeback' CHECK (dispute_type IN ('chargeback','inquiry','retrieval','fraud_claim')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open','evidence_submitted','under_review','won','lost','closed','expired')),
  evidence JSONB,
  network_ref TEXT UNIQUE,
  network_name TEXT,
  due_date TIMESTAMPTZ,
  initiated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_disputes_txid ON disputes(connect_tx_id);
CREATE INDEX idx_disputes_merchant ON disputes(merchant_id, status);
CREATE INDEX idx_disputes_status ON disputes(status) WHERE status IN ('open','evidence_submitted','under_review');
CREATE INDEX idx_disputes_network_ref ON disputes(network_ref) WHERE network_ref IS NOT NULL;
CREATE INDEX idx_disputes_due_date ON disputes(due_date) WHERE due_date IS NOT NULL AND status IN ('open','evidence_submitted');

-- ============================================================================
-- TABLE: dispute_fees
-- Purpose: Track all fees associated with disputes
-- ============================================================================
CREATE TABLE IF NOT EXISTS dispute_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID REFERENCES disputes(id) ON DELETE CASCADE,
  fee_type TEXT NOT NULL CHECK (fee_type IN ('bank_fee','molam_fee','chargeback_loss','reversal')),
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','charged','waived','refunded')),
  charged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dispute_fees_dispute ON dispute_fees(dispute_id);
CREATE INDEX idx_dispute_fees_status ON dispute_fees(status) WHERE status = 'pending';

-- ============================================================================
-- TABLE: dispute_evidence
-- Purpose: Store evidence documents and submissions
-- ============================================================================
CREATE TABLE IF NOT EXISTS dispute_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID REFERENCES disputes(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('invoice','shipping_proof','customer_communication','refund_proof','product_description','terms_conditions','other')),
  file_url TEXT,
  file_name TEXT,
  mime_type TEXT,
  notes TEXT,
  uploaded_by UUID,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dispute_evidence_dispute ON dispute_evidence(dispute_id, uploaded_at DESC);

-- ============================================================================
-- TABLE: dispute_logs
-- Purpose: Audit trail for all dispute actions
-- ============================================================================
CREATE TABLE IF NOT EXISTS dispute_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID REFERENCES disputes(id) ON DELETE CASCADE,
  actor UUID,
  actor_type TEXT DEFAULT 'user' CHECK (actor_type IN ('user','system','network','merchant')),
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dispute_logs_dispute ON dispute_logs(dispute_id, created_at DESC);
CREATE INDEX idx_dispute_logs_actor ON dispute_logs(actor, created_at DESC);

-- ============================================================================
-- TABLE: dispute_templates
-- Purpose: Pre-configured response templates
-- ============================================================================
CREATE TABLE IF NOT EXISTS dispute_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  reason_code TEXT,
  template_text TEXT NOT NULL,
  required_evidence TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- TABLE: molam_audit_logs (if not exists)
-- ============================================================================
CREATE TABLE IF NOT EXISTS molam_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brique_id TEXT NOT NULL,
  actor UUID,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_brique66 ON molam_audit_logs(brique_id, created_at DESC)
  WHERE brique_id = 'brique-66';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Updated_at trigger for disputes
CREATE OR REPLACE FUNCTION update_disputes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_disputes_updated_at
  BEFORE UPDATE ON disputes
  FOR EACH ROW
  EXECUTE FUNCTION update_disputes_updated_at();

-- Auto-log status changes
CREATE OR REPLACE FUNCTION log_dispute_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO dispute_logs(dispute_id, actor_type, action, details)
    VALUES (
      NEW.id,
      'system',
      'status_changed',
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'changed_at', NOW()
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_dispute_status_log
  AFTER UPDATE ON disputes
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION log_dispute_status_change();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active disputes requiring action
CREATE OR REPLACE VIEW v_disputes_requiring_action AS
SELECT
  d.*,
  COUNT(de.id) as evidence_count,
  d.due_date - NOW() as time_remaining
FROM disputes d
LEFT JOIN dispute_evidence de ON de.dispute_id = d.id
WHERE d.status IN ('open', 'evidence_submitted')
  AND (d.due_date IS NULL OR d.due_date > NOW())
GROUP BY d.id
ORDER BY d.due_date ASC NULLS LAST;

-- Dispute statistics by merchant
CREATE OR REPLACE VIEW v_dispute_stats_by_merchant AS
SELECT
  merchant_id,
  COUNT(*) as total_disputes,
  COUNT(*) FILTER (WHERE status = 'won') as won_count,
  COUNT(*) FILTER (WHERE status = 'lost') as lost_count,
  COUNT(*) FILTER (WHERE status IN ('open','evidence_submitted','under_review')) as pending_count,
  SUM(amount) as total_amount,
  SUM(amount) FILTER (WHERE status = 'lost') as lost_amount,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'won')::NUMERIC * 100 / NULLIF(COUNT(*) FILTER (WHERE status IN ('won','lost')), 0),
    2
  ) as win_rate_pct
FROM disputes
GROUP BY merchant_id;

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Common dispute templates
INSERT INTO dispute_templates(name, reason_code, template_text, required_evidence)
VALUES
  (
    'Fraudulent Transaction',
    'FRAUD',
    'The transaction was fraudulent. We have verified the customer identity and the transaction was legitimate.',
    ARRAY['invoice','customer_communication','shipping_proof']
  ),
  (
    'Product Not Received',
    'NOT_RECEIVED',
    'The customer claims they did not receive the product. We have provided tracking information showing successful delivery.',
    ARRAY['shipping_proof','invoice']
  ),
  (
    'Product Not As Described',
    'NOT_AS_DESCRIBED',
    'The customer claims the product was not as described. Our product description accurately matches what was delivered.',
    ARRAY['product_description','invoice','customer_communication']
  ),
  (
    'Duplicate Charge',
    'DUPLICATE',
    'The customer claims they were charged twice. This was a legitimate separate transaction.',
    ARRAY['invoice','customer_communication']
  ),
  (
    'Subscription Cancelled',
    'SUBSCRIPTION',
    'The customer claims they cancelled their subscription. Our records show the subscription was active during the billing period.',
    ARRAY['terms_conditions','customer_communication']
  )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE disputes IS 'All disputes and chargebacks from card networks and banks';
COMMENT ON TABLE dispute_fees IS 'Fees charged for disputes (bank fees, chargeback losses)';
COMMENT ON TABLE dispute_evidence IS 'Evidence documents uploaded for dispute resolution';
COMMENT ON TABLE dispute_logs IS 'Audit trail of all dispute actions';
COMMENT ON TABLE dispute_templates IS 'Pre-configured response templates for common dispute reasons';

COMMENT ON COLUMN disputes.network_ref IS 'Unique reference from card network (Visa/MC/Amex)';
COMMENT ON COLUMN disputes.due_date IS 'Deadline for submitting evidence';
COMMENT ON COLUMN disputes.dispute_type IS 'Type of dispute: chargeback, inquiry, retrieval, fraud_claim';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================