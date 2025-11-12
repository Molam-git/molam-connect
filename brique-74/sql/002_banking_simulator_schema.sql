-- =====================================================
-- Brique 74bis - Banking Network Simulator Schema
-- =====================================================
-- Version: 1.0.0
-- Purpose: Advanced playground with banking network simulation, 3DS/OTP flows, and webhook replay
-- Dependencies: Requires Brique 74 (001_developer_portal_schema.sql)
-- =====================================================

-- =====================================================
-- 1. SIMULATION SCENARIOS
-- =====================================================
-- Purpose: Predefined and custom scenarios for testing payment flows
-- Features: Network-specific behaviors, 3DS flows, fraud simulation

CREATE TABLE IF NOT EXISTS dev_playground_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scenario metadata
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('payment','refund','dispute','payout','authorization','3ds','webhook')),

  -- Network & provider
  network TEXT NOT NULL CHECK (network IN ('visa','mastercard','amex','discover','mobile_money','bank_ach','sepa','swift')),
  provider TEXT, -- specific provider: mtn_momo, orange_money, wave, etc.

  -- Scenario parameters
  parameters JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Example: {"status":"succeeded","delay_ms":1000,"3ds_required":true}

  expected_outcome TEXT NOT NULL CHECK (expected_outcome IN (
    'success','failure','pending','3ds_required','otp_required',
    'fraud_detected','insufficient_funds','card_declined','network_error',
    'timeout','partial_approval','dispute_created','chargeback'
  )),

  -- Behavior configuration
  response_delay_ms INTEGER DEFAULT 500 CHECK (response_delay_ms >= 0 AND response_delay_ms <= 30000),
  failure_rate NUMERIC(3,2) DEFAULT 0.0 CHECK (failure_rate >= 0.0 AND failure_rate <= 1.0),
  requires_3ds BOOLEAN DEFAULT false,
  requires_otp BOOLEAN DEFAULT false,

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_preset BOOLEAN DEFAULT false, -- System presets vs user-created
  created_by_user_id UUID,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_playground_scenarios_category ON dev_playground_scenarios(category, is_active) WHERE is_active = true;
CREATE INDEX idx_playground_scenarios_network ON dev_playground_scenarios(network, is_active) WHERE is_active = true;
CREATE INDEX idx_playground_scenarios_preset ON dev_playground_scenarios(is_preset) WHERE is_preset = true;
CREATE INDEX idx_playground_scenarios_tags ON dev_playground_scenarios USING GIN(tags);

COMMENT ON TABLE dev_playground_scenarios IS 'Simulation scenarios for testing payment flows and network behaviors';
COMMENT ON COLUMN dev_playground_scenarios.parameters IS 'JSON configuration: status, delay, error codes, custom data';
COMMENT ON COLUMN dev_playground_scenarios.failure_rate IS 'Probability of failure (0.0-1.0) for chaos testing';

-- =====================================================
-- 2. SIMULATION EXECUTIONS
-- =====================================================
-- Purpose: Log every simulation execution for analytics and debugging

CREATE TABLE IF NOT EXISTS dev_simulation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Execution context
  session_id UUID REFERENCES dev_playground_sessions(id) ON DELETE CASCADE,
  scenario_id UUID REFERENCES dev_playground_scenarios(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  tenant_type TEXT NOT NULL,
  tenant_id UUID NOT NULL,

  -- Request details
  request_payload JSONB NOT NULL,
  -- Example: {"amount":10000,"currency":"XOF","card":{"number":"4242..."},"metadata":{}}

  -- Simulation behavior
  network TEXT NOT NULL,
  provider TEXT,
  expected_outcome TEXT NOT NULL,
  actual_outcome TEXT NOT NULL,

  -- 3DS/OTP flow
  requires_3ds BOOLEAN DEFAULT false,
  three_ds_version TEXT, -- 1.0, 2.0, 2.1
  three_ds_challenge_type TEXT, -- frictionless, challenge, fallback
  requires_otp BOOLEAN DEFAULT false,
  otp_delivery_method TEXT, -- sms, email, app_push

  -- Response details
  response_status_code INTEGER NOT NULL,
  response_payload JSONB NOT NULL,
  response_time_ms INTEGER NOT NULL,
  delay_injected_ms INTEGER DEFAULT 0,

  -- Error simulation
  error_code TEXT,
  error_message TEXT,
  error_type TEXT,

  -- Webhook simulation
  webhook_events_generated TEXT[], -- ['payment.succeeded','charge.captured']
  webhook_replay_urls TEXT[],

  -- Result
  success BOOLEAN NOT NULL,

  -- Timestamps
  executed_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_simulation_executions_session ON dev_simulation_executions(session_id, executed_at DESC);
CREATE INDEX idx_simulation_executions_scenario ON dev_simulation_executions(scenario_id, executed_at DESC);
CREATE INDEX idx_simulation_executions_tenant ON dev_simulation_executions(tenant_type, tenant_id, executed_at DESC);
CREATE INDEX idx_simulation_executions_network ON dev_simulation_executions(network, executed_at DESC);
CREATE INDEX idx_simulation_executions_outcome ON dev_simulation_executions(actual_outcome, executed_at DESC);

COMMENT ON TABLE dev_simulation_executions IS 'Audit log of all simulation executions with full request/response details';
COMMENT ON COLUMN dev_simulation_executions.delay_injected_ms IS 'Artificial delay added to simulate network latency';

-- =====================================================
-- 3. 3DS AUTHENTICATION FLOWS
-- =====================================================
-- Purpose: Track 3D Secure authentication flows for testing SCA compliance

CREATE TABLE IF NOT EXISTS dev_3ds_authentications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Linked simulation
  simulation_execution_id UUID REFERENCES dev_simulation_executions(id) ON DELETE CASCADE,

  -- 3DS configuration
  version TEXT NOT NULL CHECK (version IN ('1.0','2.0','2.1')),
  challenge_type TEXT NOT NULL CHECK (challenge_type IN ('frictionless','challenge','fallback')),

  -- Authentication request
  authentication_request JSONB NOT NULL,
  -- Example: {"card_number":"4242...","amount":10000,"merchant_id":"merch_123"}

  -- Challenge details
  challenge_required BOOLEAN NOT NULL,
  challenge_url TEXT,
  challenge_method TEXT, -- browser_redirect, iframe, native_app

  -- Authentication result
  authentication_status TEXT NOT NULL CHECK (authentication_status IN (
    'authenticated','not_authenticated','attempted','unavailable',
    'challenge_required','error','timeout'
  )),
  authentication_value TEXT, -- CAVV/AAV (Cardholder Authentication Verification Value)
  eci TEXT, -- Electronic Commerce Indicator
  transaction_id TEXT, -- 3DS transaction ID (XID for 1.0, dsTransID for 2.0)

  -- Risk assessment (3DS 2.0+)
  risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level TEXT CHECK (risk_level IN ('low','medium','high')),

  -- Timestamps
  initiated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_3ds_authentications_simulation ON dev_3ds_authentications(simulation_execution_id);
CREATE INDEX idx_3ds_authentications_status ON dev_3ds_authentications(authentication_status, initiated_at DESC);

COMMENT ON TABLE dev_3ds_authentications IS '3D Secure authentication flows for SCA testing';
COMMENT ON COLUMN dev_3ds_authentications.authentication_value IS 'CAVV for 3DS 1.0, AAV for 3DS 2.0+';

-- =====================================================
-- 4. OTP VERIFICATIONS
-- =====================================================
-- Purpose: Track OTP-based authentication flows (common in mobile money and African banking)

CREATE TABLE IF NOT EXISTS dev_otp_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Linked simulation
  simulation_execution_id UUID REFERENCES dev_simulation_executions(id) ON DELETE CASCADE,

  -- OTP configuration
  delivery_method TEXT NOT NULL CHECK (delivery_method IN ('sms','email','ussd','app_push','voice')),
  phone_number TEXT, -- If SMS/USSD/voice
  email_address TEXT, -- If email

  -- OTP details
  otp_code TEXT NOT NULL, -- Simulated OTP (e.g., "123456")
  otp_length INTEGER DEFAULT 6,
  expires_at TIMESTAMPTZ NOT NULL,

  -- Verification attempts
  attempts_allowed INTEGER DEFAULT 3,
  attempts_made INTEGER DEFAULT 0,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN (
    'pending','verified','failed','expired','max_attempts_exceeded'
  )),

  -- Result
  verified_at TIMESTAMPTZ,
  failed_reason TEXT,

  -- Timestamps
  sent_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_otp_verifications_simulation ON dev_otp_verifications(simulation_execution_id);
CREATE INDEX idx_otp_verifications_status ON dev_otp_verifications(verification_status, sent_at DESC);

COMMENT ON TABLE dev_otp_verifications IS 'OTP verification flows for mobile money and banking authentication';
COMMENT ON COLUMN dev_otp_verifications.otp_code IS 'Simulated OTP code visible in sandbox mode';

-- =====================================================
-- 5. WEBHOOK SIMULATION EVENTS
-- =====================================================
-- Purpose: Track webhook events generated by simulations for testing webhook handlers

CREATE TABLE IF NOT EXISTS dev_webhook_simulation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Linked simulation
  simulation_execution_id UUID REFERENCES dev_simulation_executions(id) ON DELETE CASCADE,

  -- Event details
  event_type TEXT NOT NULL,
  -- Examples: payment.succeeded, payment.failed, charge.captured, refund.processed, dispute.created
  event_payload JSONB NOT NULL,

  -- Webhook configuration
  target_url TEXT, -- If user specified webhook URL
  webhook_sent BOOLEAN DEFAULT false,
  webhook_response_status_code INTEGER,
  webhook_response_time_ms INTEGER,

  -- Replay functionality
  replay_count INTEGER DEFAULT 0,
  last_replayed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_webhook_simulation_events_simulation ON dev_webhook_simulation_events(simulation_execution_id);
CREATE INDEX idx_webhook_simulation_events_type ON dev_webhook_simulation_events(event_type, created_at DESC);

COMMENT ON TABLE dev_webhook_simulation_events IS 'Webhook events generated by simulations for testing integrations';

-- =====================================================
-- 6. NETWORK CONFIGURATION TEMPLATES
-- =====================================================
-- Purpose: Store network-specific behavior templates (Visa rules, MasterCard timings, etc.)

CREATE TABLE IF NOT EXISTS dev_network_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Network details
  network TEXT NOT NULL UNIQUE CHECK (network IN ('visa','mastercard','amex','discover','mobile_money','bank_ach','sepa','swift')),
  display_name TEXT NOT NULL,
  description TEXT,

  -- Default behaviors
  default_response_time_ms INTEGER DEFAULT 500,
  default_timeout_ms INTEGER DEFAULT 30000,
  supports_3ds BOOLEAN DEFAULT true,
  supports_otp BOOLEAN DEFAULT false,
  supports_partial_approval BOOLEAN DEFAULT false,

  -- Error codes mapping
  error_codes JSONB DEFAULT '{}'::JSONB,
  -- Example: {"insufficient_funds":"51","card_declined":"05","fraud":"59"}

  -- Specific rules
  rules JSONB DEFAULT '{}'::JSONB,
  -- Example: {"max_amount":100000,"min_amount":100,"requires_cvv":true}

  -- Status codes
  status_codes JSONB DEFAULT '{}'::JSONB,
  -- Example: {"approved":"00","declined":"05","call_issuer":"01"}

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

COMMENT ON TABLE dev_network_configurations IS 'Network-specific configuration templates for realistic simulation';

-- =====================================================
-- 7. FRAUD SIMULATION PATTERNS
-- =====================================================
-- Purpose: Simulate fraud scenarios for testing fraud detection systems

CREATE TABLE IF NOT EXISTS dev_fraud_simulation_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Pattern details
  name TEXT NOT NULL,
  description TEXT,
  fraud_type TEXT NOT NULL CHECK (fraud_type IN (
    'card_testing','credential_stuffing','account_takeover',
    'friendly_fraud','true_fraud','synthetic_identity',
    'velocity_abuse','bin_attack','refund_abuse'
  )),

  -- Behavior configuration
  parameters JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Example: {"transaction_count":50,"time_window_seconds":60,"unique_cards":5}

  -- Detection triggers
  detection_signals JSONB DEFAULT '[]'::JSONB,
  -- Example: [{"signal":"high_velocity","threshold":10},{"signal":"multiple_failed_auth","threshold":5}]

  -- Expected SIRA response
  expected_sira_action TEXT CHECK (expected_sira_action IN ('alert','throttle','block','review')),
  expected_confidence_score NUMERIC(3,2) CHECK (expected_confidence_score >= 0.0 AND expected_confidence_score <= 1.0),

  -- Status
  is_active BOOLEAN DEFAULT true,
  created_by_user_id UUID,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_fraud_patterns_type ON dev_fraud_simulation_patterns(fraud_type, is_active) WHERE is_active = true;

COMMENT ON TABLE dev_fraud_simulation_patterns IS 'Fraud simulation patterns for testing detection systems';

-- =====================================================
-- VIEWS
-- =====================================================

-- View: Simulation success rate by network
CREATE OR REPLACE VIEW v_simulation_success_rate_by_network AS
SELECT
  network,
  COUNT(*) AS total_simulations,
  COUNT(*) FILTER (WHERE success = true) AS successful_simulations,
  COUNT(*) FILTER (WHERE success = false) AS failed_simulations,
  ROUND(100.0 * COUNT(*) FILTER (WHERE success = true) / NULLIF(COUNT(*),0), 2) AS success_rate_pct,
  AVG(response_time_ms) AS avg_response_time_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) AS p95_response_time_ms
FROM dev_simulation_executions
WHERE executed_at >= now() - INTERVAL '30 days'
GROUP BY network
ORDER BY total_simulations DESC;

COMMENT ON VIEW v_simulation_success_rate_by_network IS 'Success rate and performance metrics by network (30 days)';

-- View: Popular simulation scenarios
CREATE OR REPLACE VIEW v_popular_simulation_scenarios AS
SELECT
  s.id,
  s.name,
  s.category,
  s.network,
  s.expected_outcome,
  COUNT(e.id) AS execution_count,
  COUNT(e.id) FILTER (WHERE e.success = true) AS success_count,
  COUNT(e.id) FILTER (WHERE e.success = false) AS failure_count,
  AVG(e.response_time_ms) AS avg_response_time_ms
FROM dev_playground_scenarios s
LEFT JOIN dev_simulation_executions e ON e.scenario_id = s.id
  AND e.executed_at >= now() - INTERVAL '30 days'
WHERE s.is_active = true
GROUP BY s.id
ORDER BY execution_count DESC;

COMMENT ON VIEW v_popular_simulation_scenarios IS 'Most executed simulation scenarios (30 days)';

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Trigger: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_simulator_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_playground_scenarios_updated_at
  BEFORE UPDATE ON dev_playground_scenarios
  FOR EACH ROW EXECUTE FUNCTION update_simulator_updated_at();

CREATE TRIGGER trg_network_configurations_updated_at
  BEFORE UPDATE ON dev_network_configurations
  FOR EACH ROW EXECUTE FUNCTION update_simulator_updated_at();

CREATE TRIGGER trg_fraud_patterns_updated_at
  BEFORE UPDATE ON dev_fraud_simulation_patterns
  FOR EACH ROW EXECUTE FUNCTION update_simulator_updated_at();

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function: Generate realistic test card number
CREATE OR REPLACE FUNCTION generate_test_card_number(network TEXT)
RETURNS TEXT AS $$
DECLARE
  prefix TEXT;
  random_part TEXT;
BEGIN
  -- BIN ranges for different networks
  CASE network
    WHEN 'visa' THEN prefix := '4';
    WHEN 'mastercard' THEN prefix := '5';
    WHEN 'amex' THEN prefix := '37';
    WHEN 'discover' THEN prefix := '6011';
    ELSE prefix := '4'; -- Default to Visa
  END CASE;

  -- Generate random digits
  random_part := '';
  FOR i IN 1..12 LOOP
    random_part := random_part || floor(random() * 10)::TEXT;
  END LOOP;

  RETURN prefix || random_part;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_test_card_number IS 'Generate test card numbers with correct BIN ranges';

-- Function: Calculate 3DS risk score
CREATE OR REPLACE FUNCTION calculate_3ds_risk_score(
  amount NUMERIC,
  merchant_category TEXT,
  customer_history JSONB
)
RETURNS INTEGER AS $$
DECLARE
  base_score INTEGER := 50;
  score INTEGER;
BEGIN
  score := base_score;

  -- Amount-based adjustment
  IF amount > 100000 THEN
    score := score + 20;
  ELSIF amount < 1000 THEN
    score := score - 10;
  END IF;

  -- Merchant category adjustment
  IF merchant_category IN ('gambling','crypto','forex') THEN
    score := score + 15;
  END IF;

  -- Customer history adjustment
  IF customer_history->>'transaction_count' IS NOT NULL THEN
    IF (customer_history->>'transaction_count')::INTEGER > 10 THEN
      score := score - 15;
    END IF;
  END IF;

  -- Ensure score is in valid range
  score := LEAST(GREATEST(score, 0), 100);

  RETURN score;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_3ds_risk_score IS 'Calculate simulated 3DS risk score based on transaction parameters';

-- =====================================================
-- PRESET DATA - SIMULATION SCENARIOS
-- =====================================================

-- Visa scenarios
INSERT INTO dev_playground_scenarios (name, description, category, network, parameters, expected_outcome, response_delay_ms, is_preset, tags) VALUES
('Visa Payment Success', 'Standard successful Visa payment', 'payment', 'visa', '{"status":"succeeded","auth_code":"123456"}', 'success', 500, true, ARRAY['visa','success','basic']),
('Visa Payment Declined - Insufficient Funds', 'Visa payment declined due to insufficient funds', 'payment', 'visa', '{"status":"failed","error_code":"51","decline_reason":"insufficient_funds"}', 'insufficient_funds', 600, true, ARRAY['visa','failure','decline']),
('Visa 3DS Required', 'Visa payment requiring 3D Secure authentication', 'payment', 'visa', '{"status":"requires_action","3ds_version":"2.1"}', '3ds_required', 800, true, ARRAY['visa','3ds','sca']),
('Visa Fraud Detected', 'Visa payment blocked by fraud detection', 'payment', 'visa', '{"status":"blocked","fraud_score":95}', 'fraud_detected', 700, true, ARRAY['visa','fraud','security'])
ON CONFLICT DO NOTHING;

-- Mastercard scenarios
INSERT INTO dev_playground_scenarios (name, description, category, network, parameters, expected_outcome, response_delay_ms, is_preset, tags) VALUES
('Mastercard Payment Success', 'Standard successful Mastercard payment', 'payment', 'mastercard', '{"status":"succeeded","auth_code":"654321"}', 'success', 550, true, ARRAY['mastercard','success','basic']),
('Mastercard 3DS Challenge', 'Mastercard payment with 3DS challenge', 'payment', 'mastercard', '{"status":"requires_action","3ds_version":"2.0","challenge_type":"challenge"}', '3ds_required', 900, true, ARRAY['mastercard','3ds','challenge']),
('Mastercard Card Declined', 'Mastercard payment declined by issuer', 'payment', 'mastercard', '{"status":"failed","error_code":"05","decline_reason":"card_declined"}', 'card_declined', 650, true, ARRAY['mastercard','failure','decline'])
ON CONFLICT DO NOTHING;

-- Mobile Money scenarios
INSERT INTO dev_playground_scenarios (name, description, category, network, provider, parameters, expected_outcome, response_delay_ms, requires_otp, is_preset, tags) VALUES
('MTN Mobile Money Success', 'Successful MTN Mobile Money payment', 'payment', 'mobile_money', 'mtn_momo', '{"status":"succeeded","transaction_id":"MM123456"}', 'success', 2000, false, true, ARRAY['mobile_money','mtn','success']),
('MTN Mobile Money OTP Required', 'MTN payment requiring OTP verification', 'payment', 'mobile_money', 'mtn_momo', '{"status":"pending","otp_required":true}', 'otp_required', 1500, true, true, ARRAY['mobile_money','mtn','otp']),
('Orange Money Success', 'Successful Orange Money payment', 'payment', 'mobile_money', 'orange_money', '{"status":"succeeded","transaction_id":"OM789012"}', 'success', 1800, false, true, ARRAY['mobile_money','orange','success']),
('Wave Payment Success', 'Successful Wave payment', 'payment', 'mobile_money', 'wave', '{"status":"succeeded","transaction_id":"WV345678"}', 'success', 1200, false, true, ARRAY['mobile_money','wave','success'])
ON CONFLICT DO NOTHING;

-- Bank ACH scenarios
INSERT INTO dev_playground_scenarios (name, description, category, network, parameters, expected_outcome, response_delay_ms, is_preset, tags) VALUES
('ACH Payment Pending', 'ACH payment in pending state', 'payment', 'bank_ach', '{"status":"pending","settlement_date":"2025-11-13"}', 'pending', 1000, true, ARRAY['ach','pending','bank']),
('ACH Payment Success', 'ACH payment successfully settled', 'payment', 'bank_ach', '{"status":"succeeded","settled_at":"2025-11-12"}', 'success', 1200, true, ARRAY['ach','success','bank']),
('ACH Payment Failed - Account Closed', 'ACH payment failed due to closed account', 'payment', 'bank_ach', '{"status":"failed","error_code":"R02","return_reason":"account_closed"}', 'failure', 1500, true, ARRAY['ach','failure','return'])
ON CONFLICT DO NOTHING;

-- Refund scenarios
INSERT INTO dev_playground_scenarios (name, description, category, network, parameters, expected_outcome, response_delay_ms, is_preset, tags) VALUES
('Visa Refund Processed', 'Successful Visa refund', 'refund', 'visa', '{"status":"succeeded","refund_id":"rfnd_123"}', 'success', 700, true, ARRAY['visa','refund','success']),
('Mastercard Partial Refund', 'Partial Mastercard refund', 'refund', 'mastercard', '{"status":"succeeded","refund_id":"rfnd_456","amount_refunded":5000}', 'partial_approval', 750, true, ARRAY['mastercard','refund','partial'])
ON CONFLICT DO NOTHING;

-- Dispute scenarios
INSERT INTO dev_playground_scenarios (name, description, category, network, parameters, expected_outcome, response_delay_ms, is_preset, tags) VALUES
('Visa Dispute Created', 'Customer dispute filed on Visa transaction', 'dispute', 'visa', '{"status":"created","dispute_reason":"fraudulent","dispute_amount":10000}', 'dispute_created', 800, true, ARRAY['visa','dispute','chargeback']),
('Mastercard Chargeback', 'Chargeback initiated by Mastercard', 'dispute', 'mastercard', '{"status":"chargeback","reason_code":"4853"}', 'chargeback', 850, true, ARRAY['mastercard','chargeback','dispute'])
ON CONFLICT DO NOTHING;

-- =====================================================
-- PRESET DATA - NETWORK CONFIGURATIONS
-- =====================================================

INSERT INTO dev_network_configurations (network, display_name, description, default_response_time_ms, supports_3ds, supports_otp, error_codes, status_codes) VALUES
('visa', 'Visa', 'Visa card network', 500, true, false,
  '{"insufficient_funds":"51","card_declined":"05","fraud":"59","expired_card":"54","invalid_cvv":"N7"}',
  '{"approved":"00","declined":"05","call_issuer":"01","pick_up_card":"04"}'
),
('mastercard', 'Mastercard', 'Mastercard network', 550, true, false,
  '{"insufficient_funds":"51","card_declined":"05","fraud":"59","expired_card":"33","invalid_cvv":"N7"}',
  '{"approved":"00","declined":"05","call_issuer":"01","pick_up_card":"04"}'
),
('mobile_money', 'Mobile Money', 'Mobile money providers (MTN, Orange, Wave)', 1500, false, true,
  '{"insufficient_balance":"INSUFFICIENT_FUNDS","invalid_number":"INVALID_MSISDN","expired_transaction":"TIMEOUT"}',
  '{"success":"SUCCESSFUL","pending":"PENDING","failed":"FAILED"}'
),
('bank_ach', 'Bank ACH', 'Automated Clearing House', 1200, false, false,
  '{"account_closed":"R02","insufficient_funds":"R01","invalid_account":"R03"}',
  '{"accepted":"00","pending":"01","returned":"02"}'
)
ON CONFLICT (network) DO NOTHING;

-- =====================================================
-- PRESET DATA - FRAUD SIMULATION PATTERNS
-- =====================================================

INSERT INTO dev_fraud_simulation_patterns (name, description, fraud_type, parameters, detection_signals, expected_sira_action, expected_confidence_score) VALUES
('Card Testing Attack', 'Multiple small transactions to test stolen card numbers', 'card_testing',
  '{"transaction_count":20,"amount_range":[100,500],"time_window_seconds":120,"success_rate":0.3}',
  '[{"signal":"high_velocity","threshold":10},{"signal":"low_amounts","threshold":1000},{"signal":"multiple_failures","threshold":5}]',
  'block', 0.95
),
('Velocity Abuse', 'Rapid-fire transactions from same source', 'velocity_abuse',
  '{"transaction_count":50,"time_window_seconds":60,"unique_recipients":10}',
  '[{"signal":"high_velocity","threshold":30},{"signal":"suspicious_pattern","threshold":0.8}]',
  'throttle', 0.85
),
('Account Takeover', 'Unauthorized access to legitimate account', 'account_takeover',
  '{"new_device":true,"location_mismatch":true,"password_reset":true,"high_value_transaction":true}',
  '[{"signal":"device_mismatch","threshold":1},{"signal":"location_anomaly","threshold":1},{"signal":"account_changes","threshold":1}]',
  'alert', 0.90
)
ON CONFLICT DO NOTHING;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Grant permissions to application role (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO molam_app_role;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO molam_app_role;

-- =====================================================
-- COMPLETION
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Brique 74bis - Banking Network Simulator Schema installed successfully';
  RAISE NOTICE '📊 Tables created: 7';
  RAISE NOTICE '📈 Views created: 2';
  RAISE NOTICE '⚡ Triggers created: 3';
  RAISE NOTICE '🔧 Functions created: 2';
  RAISE NOTICE '🎮 Preset scenarios: 20+';
  RAISE NOTICE '🏦 Network configurations: 4';
  RAISE NOTICE '🚨 Fraud patterns: 3';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 Next steps:';
  RAISE NOTICE '   1. Review preset scenarios in dev_playground_scenarios';
  RAISE NOTICE '   2. Customize network configurations if needed';
  RAISE NOTICE '   3. Test simulation endpoints';
  RAISE NOTICE '   4. Integrate with SIRA fraud detection';
END $$;
