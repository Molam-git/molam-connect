-- ============================================================================
-- Cooperative Failover Mesh (SIRA) - Database Schema
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================================================
-- 1) Mesh Regions (géographiques ou logiques)
-- ============================================================================
CREATE TABLE IF NOT EXISTS mesh_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,              -- "CEDEAO", "EU", "US", "GLOBAL"
  description TEXT,
  countries TEXT[] NOT NULL,

  -- Géolocalisation
  region_geometry GEOMETRY(Polygon, 4326),

  -- Configuration
  auto_failover_enabled BOOLEAN DEFAULT FALSE,
  approval_threshold NUMERIC(18,2) DEFAULT 10000,  -- montant nécessitant approbation
  allowed_crossborder BOOLEAN DEFAULT TRUE,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mesh_regions_countries ON mesh_regions USING GIN(countries);
CREATE INDEX IF NOT EXISTS idx_mesh_regions_geometry ON mesh_regions USING GIST(region_geometry);

-- ============================================================================
-- 2) Mesh Members (banques/PSP participant au mesh)
-- ============================================================================
CREATE TABLE IF NOT EXISTS mesh_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mesh_region_id UUID NOT NULL REFERENCES mesh_regions(id) ON DELETE CASCADE,
  bank_profile_id UUID NOT NULL REFERENCES bank_profiles(id) ON DELETE CASCADE,

  -- Role dans le mesh
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('primary', 'secondary', 'tertiary', 'observer', 'member')),
  prefer_order INTEGER DEFAULT 100,       -- ordre de préférence (1 = highest)

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'suspended', 'pending_approval')),

  -- Capacités
  capabilities JSONB DEFAULT '{
    "max_amount_per_txn": 10000000,
    "daily_volume_limit": 100000000,
    "supported_currencies": ["XOF", "EUR", "USD"],
    "cross_border_enabled": true,
    "settlement_time_hours": 24,
    "sla_uptime_pct": 99.9
  }'::jsonb,

  -- Health tracking
  last_health_update TIMESTAMPTZ,
  current_health_score NUMERIC(5,2),      -- 0-100

  -- Compliance
  kyc_verified BOOLEAN DEFAULT FALSE,
  contract_signed BOOLEAN DEFAULT FALSE,
  compliance_status TEXT DEFAULT 'pending',

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(mesh_region_id, bank_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_mesh_members_region ON mesh_members(mesh_region_id);
CREATE INDEX IF NOT EXISTS idx_mesh_members_bank ON mesh_members(bank_profile_id);
CREATE INDEX IF NOT EXISTS idx_mesh_members_status ON mesh_members(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_mesh_members_role ON mesh_members(role);

-- ============================================================================
-- 3) Bank Health Predictions (SIRA predictions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS bank_health_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_profile_id UUID NOT NULL REFERENCES bank_profiles(id),
  mesh_region_id UUID REFERENCES mesh_regions(id),

  -- Prediction
  predicted_score NUMERIC(5,2) NOT NULL,  -- 0-100 (health score)
  confidence NUMERIC(5,4) NOT NULL,       -- 0-1
  prediction_window_minutes INTEGER NOT NULL,  -- durée de validité

  -- Détails
  prediction_reason TEXT,
  risk_factors TEXT[],                    -- ["latency_spike", "volume_surge", "settlement_delay"]
  recommended_action TEXT,                -- "failover", "monitor", "increase_reserve"

  -- SIRA metadata
  sira_model_version TEXT NOT NULL,
  sira_confidence_intervals JSONB,        -- { "p10": 85, "p50": 92, "p90": 98 }

  -- Signature (pour integrity)
  sira_signature TEXT,                    -- JWT signature

  -- Validity
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_predictions_bank ON bank_health_predictions(bank_profile_id);
CREATE INDEX IF NOT EXISTS idx_health_predictions_region ON bank_health_predictions(mesh_region_id);
CREATE INDEX IF NOT EXISTS idx_health_predictions_valid ON bank_health_predictions(valid_until) WHERE valid_until > now();

-- ============================================================================
-- 4) Mesh Routing Proposals (SIRA routing recommendations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS mesh_routing_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mesh_region_id UUID NOT NULL REFERENCES mesh_regions(id),

  -- Scope
  currency TEXT NOT NULL,
  min_amount NUMERIC(18,2) DEFAULT 0,
  max_amount NUMERIC(18,2),

  -- Proposal (routing sequence)
  proposal JSONB NOT NULL,                -- { "sequence": [{"bank_profile_id", "score", "estimated_cost", "confidence", "reason"}], "sira_version", "timestamp" }

  -- Status workflow
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'simulated', 'approved', 'rejected', 'applied', 'rolled_back')),

  -- Simulation results
  simulation_results JSONB,               -- { "estimated_cost_delta": -50, "estimated_latency_delta": -120, "affected_payouts": 45 }

  -- Approval tracking
  created_by TEXT NOT NULL,               -- 'sira' or user_id
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,

  -- Rollback tracking
  rolled_back_at TIMESTAMPTZ,
  rollback_reason TEXT,

  -- SIRA signature
  sira_signature TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_routing_proposals_region ON mesh_routing_proposals(mesh_region_id);
CREATE INDEX IF NOT EXISTS idx_routing_proposals_status ON mesh_routing_proposals(status);
CREATE INDEX IF NOT EXISTS idx_routing_proposals_currency ON mesh_routing_proposals(currency);
CREATE INDEX IF NOT EXISTS idx_routing_proposals_created ON mesh_routing_proposals(created_at DESC);

-- ============================================================================
-- 5) Mesh Action Logs (audit trail immutable)
-- ============================================================================
CREATE TABLE IF NOT EXISTS mesh_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Action details
  action_type TEXT NOT NULL,              -- 'apply_route', 'rollback', 'override', 'failover', 'manual_switch', 'emergency_stop'
  mesh_region_id UUID REFERENCES mesh_regions(id),
  routing_proposal_id UUID REFERENCES mesh_routing_proposals(id),

  -- Payload
  payload JSONB NOT NULL,                 -- full action context

  -- Actor
  actor_type TEXT NOT NULL,               -- 'sira', 'user', 'system', 'policy_engine'
  actor_id TEXT NOT NULL,

  -- Impact
  affected_payouts UUID[],
  affected_bank_profiles UUID[],

  -- Results
  result TEXT NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'success', 'partial', 'failed', 'rolled_back')),
  error_details TEXT,

  -- Timing
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Idempotency
  idempotency_key TEXT UNIQUE,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mesh_actions_type ON mesh_action_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_mesh_actions_region ON mesh_action_logs(mesh_region_id);
CREATE INDEX IF NOT EXISTS idx_mesh_actions_actor ON mesh_action_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_mesh_actions_created ON mesh_action_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mesh_actions_result ON mesh_action_logs(result);

-- ============================================================================
-- 6) Mesh Policies (règles de routage et failover)
-- ============================================================================
CREATE TABLE IF NOT EXISTS mesh_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mesh_region_id UUID NOT NULL REFERENCES mesh_regions(id),

  -- Policy details
  name TEXT NOT NULL,
  description TEXT,

  -- Rules
  rules JSONB NOT NULL DEFAULT '{
    "auto_failover_enabled": false,
    "approval_required_threshold": 10000,
    "max_cascading_depth": 3,
    "min_confidence_for_auto": 0.8,
    "allowed_crossborder": true,
    "require_multisig_for_new_member": true,
    "rollback_window_hours": 24,
    "max_cost_increase_pct": 10,
    "compliance_checks": ["kyc_verified", "contract_signed"]
  }'::jsonb,

  -- Priority
  priority INTEGER DEFAULT 100,

  -- Status
  active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mesh_policies_region ON mesh_policies(mesh_region_id);
CREATE INDEX IF NOT EXISTS idx_mesh_policies_active ON mesh_policies(active) WHERE active = TRUE;

-- ============================================================================
-- 7) Mesh Reconciliations (suivi cross-region transfers)
-- ============================================================================
CREATE TABLE IF NOT EXISTS mesh_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Original payout
  payout_id UUID NOT NULL REFERENCES payouts(id),
  original_bank_profile_id UUID NOT NULL REFERENCES bank_profiles(id),

  -- Rerouted details
  rerouted_bank_profile_id UUID NOT NULL REFERENCES bank_profiles(id),
  routing_proposal_id UUID REFERENCES mesh_routing_proposals(id),

  -- Amounts
  original_amount NUMERIC(18,2) NOT NULL,
  original_currency TEXT NOT NULL,
  rerouted_amount NUMERIC(18,2) NOT NULL,
  rerouted_currency TEXT NOT NULL,
  fx_rate NUMERIC(18,8),

  -- Costs
  original_estimated_cost NUMERIC(18,2),
  actual_cost NUMERIC(18,2),
  cost_delta NUMERIC(18,2),

  -- Timing
  original_estimated_settlement TIMESTAMPTZ,
  actual_settlement TIMESTAMPTZ,
  settlement_delta_seconds INTEGER,

  -- Status
  reconciliation_status TEXT NOT NULL DEFAULT 'pending' CHECK (reconciliation_status IN ('pending', 'matched', 'unmatched', 'disputed', 'resolved')),

  -- Ledger entries
  ledger_entry_ids UUID[],
  bank_statement_line_ids UUID[],

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT now(),
  reconciled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mesh_recon_payout ON mesh_reconciliations(payout_id);
CREATE INDEX IF NOT EXISTS idx_mesh_recon_status ON mesh_reconciliations(reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_mesh_recon_created ON mesh_reconciliations(created_at DESC);

-- ============================================================================
-- 8) Mesh Liquidity Pools (pour mutualisation cross-bank)
-- ============================================================================
CREATE TABLE IF NOT EXISTS mesh_liquidity_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mesh_region_id UUID NOT NULL REFERENCES mesh_regions(id),

  -- Pool details
  name TEXT NOT NULL,
  currency TEXT NOT NULL,

  -- Participants
  participant_bank_profiles UUID[],

  -- Balances
  total_available NUMERIC(18,2) NOT NULL DEFAULT 0,
  reserved NUMERIC(18,2) NOT NULL DEFAULT 0,

  -- Limits
  max_single_draw NUMERIC(18,2),
  daily_draw_limit NUMERIC(18,2),

  -- Rebalancing
  auto_rebalance_enabled BOOLEAN DEFAULT FALSE,
  rebalance_threshold_pct NUMERIC(5,2) DEFAULT 20,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_liquidity_pools_region ON mesh_liquidity_pools(mesh_region_id);
CREATE INDEX IF NOT EXISTS idx_liquidity_pools_currency ON mesh_liquidity_pools(currency);

-- ============================================================================
-- Seed default regions
-- ============================================================================
INSERT INTO mesh_regions (name, description, countries, auto_failover_enabled, approval_threshold) VALUES
  ('CEDEAO', 'Communauté Économique des États de l''Afrique de l''Ouest', ARRAY['CI', 'SN', 'ML', 'BF', 'NE', 'TG', 'BJ', 'GN', 'GW', 'LR', 'SL', 'NG', 'GH', 'GM', 'CV'], FALSE, 10000),
  ('EU', 'European Union', ARRAY['FR', 'DE', 'IT', 'ES', 'PT', 'BE', 'NL', 'LU', 'AT', 'FI', 'SE', 'DK', 'PL', 'CZ', 'HU', 'RO', 'BG', 'GR', 'IE', 'HR', 'SI', 'SK', 'EE', 'LV', 'LT', 'CY', 'MT'], FALSE, 50000),
  ('US', 'United States', ARRAY['US'], FALSE, 100000),
  ('GLOBAL', 'Global Mesh (cross-continental)', ARRAY[]::TEXT[], FALSE, 500000)
ON CONFLICT (name) DO NOTHING;

-- Seed default policies
INSERT INTO mesh_policies (mesh_region_id, name, description, rules, priority)
SELECT
  id,
  'Default Policy - ' || name,
  'Conservative default policy for ' || name,
  jsonb_build_object(
    'auto_failover_enabled', FALSE,
    'approval_required_threshold', approval_threshold,
    'max_cascading_depth', 3,
    'min_confidence_for_auto', 0.85,
    'allowed_crossborder', allowed_crossborder,
    'require_multisig_for_new_member', TRUE,
    'rollback_window_hours', 24,
    'max_cost_increase_pct', 10,
    'compliance_checks', ARRAY['kyc_verified', 'contract_signed']
  ),
  100
FROM mesh_regions
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Functions
-- ============================================================================

-- Function to get active routing for a region
CREATE OR REPLACE FUNCTION get_active_routing(p_mesh_region_id UUID, p_currency TEXT, p_amount NUMERIC)
RETURNS TABLE(bank_profile_id UUID, prefer_order INTEGER, health_score NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mm.bank_profile_id,
    mm.prefer_order,
    mm.current_health_score
  FROM mesh_members mm
  WHERE mm.mesh_region_id = p_mesh_region_id
    AND mm.status = 'active'
    AND mm.capabilities -> 'supported_currencies' ? p_currency
    AND (mm.capabilities ->> 'max_amount_per_txn')::numeric >= p_amount
  ORDER BY mm.prefer_order ASC, mm.current_health_score DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update mesh_regions.updated_at
CREATE OR REPLACE FUNCTION update_mesh_region_timestamp() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mesh_regions_update_timestamp
BEFORE UPDATE ON mesh_regions
FOR EACH ROW EXECUTE FUNCTION update_mesh_region_timestamp();

CREATE TRIGGER mesh_members_update_timestamp
BEFORE UPDATE ON mesh_members
FOR EACH ROW EXECUTE FUNCTION update_mesh_region_timestamp();
