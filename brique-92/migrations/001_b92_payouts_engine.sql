-- Brique 92 — Payouts & Settlement Engine
-- Industrial-grade payout processing with ledger integration, retry logic, and reconciliation
-- Author: Molam Platform Team
-- Date: 2025-01-14

-- ============================================================================
-- 1. PAYOUTS (Core table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Idempotency & Origin
  external_id TEXT, -- Idempotency key (unique per caller)
  origin_module TEXT NOT NULL, -- 'connect','wallet','agents','treasury'
  origin_entity_id UUID, -- merchant_id / agent_id / user_id

  -- Amount & Currency
  currency TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),

  -- Beneficiary details (JSONB for flexibility)
  beneficiary JSONB NOT NULL, -- {name, account:{iban,acc,bank_code,routing}, email, phone}

  -- Routing & Accounts
  bank_profile_id UUID, -- REFERENCES bank_profiles(id) in B34
  treasury_account_id UUID, -- REFERENCES treasury_accounts(id) in B34
  routing JSONB, -- chosen route: {bank_profile_id, connector, priority, estimated_cost}

  -- Fees & Deductions
  molam_fee NUMERIC(18,2) DEFAULT 0,
  bank_fee NUMERIC(18,2) DEFAULT 0,
  total_deducted NUMERIC(18,2), -- amount + molam_fee + bank_fee

  -- Ledger Integration
  reserved_ledger_ref TEXT, -- ledger hold reference
  ledger_entry_ref TEXT, -- final ledger entry reference

  -- Status & Lifecycle
  status TEXT DEFAULT 'pending', -- pending|reserved|processing|sent|settled|failed|reversed|cancelled
  priority SMALLINT DEFAULT 10, -- lower number = higher priority
  scheduled_for TIMESTAMPTZ DEFAULT now(),

  -- References
  reference_code TEXT UNIQUE, -- e.g. PAYOUT-20250114-XXXX
  provider_ref TEXT, -- external provider reference

  -- Retry & Error Tracking
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  last_attempt_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB, -- additional context
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

-- Unique constraint on external_id per origin
CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_external_id_origin
  ON payouts(external_id, origin_module, origin_entity_id)
  WHERE external_id IS NOT NULL;

-- Index for status queries
CREATE INDEX IF NOT EXISTS idx_payouts_status
  ON payouts(status, scheduled_for);

-- Index for reference lookups
CREATE INDEX IF NOT EXISTS idx_payouts_reference
  ON payouts(reference_code);

CREATE INDEX IF NOT EXISTS idx_payouts_provider_ref
  ON payouts(provider_ref)
  WHERE provider_ref IS NOT NULL;

-- Index for entity queries
CREATE INDEX IF NOT EXISTS idx_payouts_origin
  ON payouts(origin_module, origin_entity_id, created_at DESC);

-- ============================================================================
-- 2. PAYOUT BATCHES (for scheduled/batch execution)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_ref TEXT UNIQUE NOT NULL,

  -- Owner & Scheduling
  created_by UUID,
  scheduled_for TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'draft', -- draft|queued|processing|completed|failed|cancelled

  -- Statistics
  stats JSONB, -- {count, total_amount, success_count, failed_count}

  -- Metadata
  metadata JSONB,
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_batch_status
  ON payout_batches(status, scheduled_for);

-- ============================================================================
-- 3. PAYOUT BATCH ITEMS (many-to-many)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES payout_batches(id) ON DELETE CASCADE,
  payout_id UUID NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,

  -- Item status within batch
  status TEXT DEFAULT 'pending', -- pending|processing|completed|failed

  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(batch_id, payout_id)
);

CREATE INDEX IF NOT EXISTS idx_batch_items_batch
  ON payout_batch_items(batch_id, status);

-- ============================================================================
-- 4. PAYOUT ATTEMPTS (execution history)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,

  -- Attempt Details
  attempt_number INTEGER NOT NULL,
  attempted_at TIMESTAMPTZ DEFAULT now(),

  -- Connector Info
  connector TEXT NOT NULL, -- name of bank connector
  provider_ref TEXT, -- provider's reference

  -- Result
  status TEXT NOT NULL, -- sent|settled|failed|partial|timeout
  http_code INTEGER,
  response JSONB,

  -- Performance
  latency_ms INTEGER,

  -- Error Details
  error_code TEXT,
  error_message TEXT,
  error_details JSONB,

  -- Metadata
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_attempts_payout
  ON payout_attempts(payout_id, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_attempts_connector
  ON payout_attempts(connector, attempted_at DESC);

-- ============================================================================
-- 5. IDEMPOTENCY KEYS (lightweight store)
-- ============================================================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Key & Owner
  key TEXT UNIQUE NOT NULL,
  owner_id UUID, -- who created it

  -- Response Storage
  response_snapshot JSONB NOT NULL,

  -- Expiration
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,

  -- Resource reference
  resource_type TEXT, -- 'payout', 'batch', etc.
  resource_id UUID
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires
  ON idempotency_keys(expires_at)
  WHERE expires_at > now();

-- ============================================================================
-- 6. PAYOUT QUEUE (for worker processing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,

  -- Scheduling
  next_attempt_at TIMESTAMPTZ DEFAULT now(),

  -- Locking (for distributed workers)
  locked_until TIMESTAMPTZ,
  locked_by TEXT, -- worker instance id

  -- Retry Tracking
  attempts INTEGER DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'ready', -- ready|processing|delayed|quarantined

  -- Priority
  priority SMALLINT DEFAULT 10,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(payout_id)
);

CREATE INDEX IF NOT EXISTS idx_payout_queue_next_attempt
  ON payout_queue(next_attempt_at, status, priority)
  WHERE status IN ('ready', 'delayed');

CREATE INDEX IF NOT EXISTS idx_payout_queue_lock
  ON payout_queue(locked_until)
  WHERE locked_until IS NOT NULL;

-- ============================================================================
-- 7. PAYOUT AUDIT (immutable log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Subject
  payout_id UUID,
  batch_id UUID,

  -- Actor & Action
  actor_type TEXT NOT NULL, -- 'user', 'system', 'worker'
  actor_id TEXT, -- user_id or worker_instance_id
  action TEXT NOT NULL, -- 'created', 'queued', 'sent', 'settled', 'cancelled', 'retried'

  -- Details
  details JSONB,

  -- Context
  ip_address INET,
  user_agent TEXT,

  -- Timestamp (immutable)
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_payout
  ON payout_audit(payout_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_action
  ON payout_audit(action, created_at DESC);

-- ============================================================================
-- 8. PAYOUT RECONCILIATION (statement matching)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Payout Reference
  payout_id UUID NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,

  -- Statement Line Reference (from B91 or B34)
  statement_line_id UUID, -- references bank_statement_lines

  -- Match Details
  match_method TEXT, -- 'exact_reference', 'provider_ref', 'amount_date', 'fuzzy', 'manual'
  match_confidence NUMERIC(5,2), -- 0.00 to 1.00
  match_details JSONB,

  -- Reconciled By
  reconciled_by TEXT, -- 'auto' or user_id
  reconciled_at TIMESTAMPTZ DEFAULT now(),

  -- Settlement Details
  actual_amount NUMERIC(18,2),
  actual_fees NUMERIC(18,2),
  fee_variance NUMERIC(18,2), -- difference from expected

  -- Status
  status TEXT DEFAULT 'matched', -- matched|pending_review|disputed

  -- Metadata
  notes TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_recon_payout
  ON payout_reconciliation(payout_id);

CREATE INDEX IF NOT EXISTS idx_recon_statement
  ON payout_reconciliation(statement_line_id);

-- ============================================================================
-- 9. CONNECTOR HEALTH (monitoring)
-- ============================================================================

CREATE TABLE IF NOT EXISTS connector_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Connector
  connector_name TEXT UNIQUE NOT NULL,

  -- Health Status
  status TEXT DEFAULT 'healthy', -- healthy|degraded|down

  -- Metrics
  success_rate NUMERIC(5,2), -- over last hour
  avg_latency_ms INTEGER,
  error_count INTEGER,

  -- Circuit Breaker
  consecutive_failures INTEGER DEFAULT 0,
  circuit_open BOOLEAN DEFAULT false,
  circuit_opened_at TIMESTAMPTZ,

  -- Last Check
  last_check_at TIMESTAMPTZ DEFAULT now(),
  last_success_at TIMESTAMPTZ,
  last_error TEXT,

  -- Metadata
  metadata JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate next retry time with exponential backoff
CREATE OR REPLACE FUNCTION calculate_next_retry(
  attempts INTEGER,
  base_delay_seconds INTEGER DEFAULT 60
) RETURNS TIMESTAMPTZ AS $$
DECLARE
  backoff_seconds INTEGER[] := ARRAY[60, 300, 900, 3600, 21600]; -- 1m,5m,15m,1h,6h
  delay_seconds INTEGER;
BEGIN
  IF attempts >= array_length(backoff_seconds, 1) THEN
    delay_seconds := backoff_seconds[array_length(backoff_seconds, 1)];
  ELSE
    delay_seconds := backoff_seconds[attempts + 1];
  END IF;

  RETURN now() + make_interval(secs => delay_seconds);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to generate payout reference code
CREATE OR REPLACE FUNCTION generate_payout_reference() RETURNS TEXT AS $$
DECLARE
  date_part TEXT;
  random_part TEXT;
BEGIN
  date_part := to_char(now(), 'YYYYMMDD');
  random_part := upper(substring(md5(random()::text) from 1 for 8));
  RETURN 'PAYOUT-' || date_part || '-' || random_part;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_payouts_updated_at BEFORE UPDATE ON payouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payout_batches_updated_at BEFORE UPDATE ON payout_batches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payout_queue_updated_at BEFORE UPDATE ON payout_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_connector_health_updated_at BEFORE UPDATE ON connector_health
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-generate reference_code if not provided
CREATE OR REPLACE FUNCTION auto_generate_payout_reference()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reference_code IS NULL THEN
    NEW.reference_code := generate_payout_reference();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_payout_reference BEFORE INSERT ON payouts
  FOR EACH ROW EXECUTE FUNCTION auto_generate_payout_reference();

-- ============================================================================
-- MATERIALIZED VIEW: Payout Statistics
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS payout_statistics AS
SELECT
  date_trunc('hour', created_at) as hour,
  origin_module,
  currency,
  status,
  COUNT(*) as count,
  SUM(amount) as total_amount,
  AVG(amount) as avg_amount,
  SUM(molam_fee) as total_molam_fee,
  SUM(bank_fee) as total_bank_fee,
  AVG(attempts) as avg_attempts,
  COUNT(*) FILTER (WHERE settled_at IS NOT NULL AND settled_at - created_at < INTERVAL '5 minutes') as settled_under_5min
FROM payouts
WHERE created_at > now() - INTERVAL '7 days'
GROUP BY 1, 2, 3, 4;

CREATE UNIQUE INDEX ON payout_statistics(hour, origin_module, currency, status);

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_payout_statistics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY payout_statistics;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Insert sample connector health records
INSERT INTO connector_health (connector_name, status, success_rate, avg_latency_ms, consecutive_failures)
VALUES
  ('sandbox', 'healthy', 100.00, 50, 0),
  ('bank_of_africa', 'healthy', 99.50, 1200, 0),
  ('ecobank', 'healthy', 98.80, 1500, 0),
  ('wise', 'healthy', 99.90, 800, 0)
ON CONFLICT (connector_name) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE payouts IS 'Core payout requests with full lifecycle tracking';
COMMENT ON TABLE payout_batches IS 'Batch execution groups for scheduled payouts';
COMMENT ON TABLE payout_attempts IS 'Execution history with retry tracking';
COMMENT ON TABLE idempotency_keys IS 'Idempotency enforcement with response caching';
COMMENT ON TABLE payout_queue IS 'Worker processing queue with distributed locking';
COMMENT ON TABLE payout_audit IS 'Immutable audit log for compliance';
COMMENT ON TABLE payout_reconciliation IS 'Statement matching and settlement finalization';
COMMENT ON TABLE connector_health IS 'Bank connector health monitoring and circuit breaker';

COMMENT ON COLUMN payouts.external_id IS 'Idempotency key from caller';
COMMENT ON COLUMN payouts.reserved_ledger_ref IS 'Ledger hold reference before send';
COMMENT ON COLUMN payouts.ledger_entry_ref IS 'Final ledger entry after settlement';
COMMENT ON COLUMN payouts.status IS 'Lifecycle: pending→reserved→processing→sent→settled';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
