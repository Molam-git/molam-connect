/**
 * Sous-Brique 75bis-1 - Geo-Policy & Experimentation Engine
 *
 * Industrial-grade service for:
 * - Geo-specific policy rule management
 * - Dynamic pricing by zone
 * - A/B experiments with safe rollouts
 * - Auto-rollback on KPI breach
 * - Ops approval workflows
 *
 * @module geoPolicyEngine
 */

import { Pool, PoolClient } from 'pg';

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface GeoPolicyRule {
  id: string;
  scope: 'merchant' | 'global';
  scope_id?: string;
  rule_type: 'block' | 'throttle' | 'suspend_payout' | 'require_kyc' | 'dynamic_fee' | 'alert_only' | 'require_3ds';
  target_zone: {
    countries?: string[];
    regions?: string[];
    cities?: string[];
  };
  params: Record<string, any>;
  status: 'pending' | 'active' | 'paused' | 'archived' | 'rejected';
  priority: number;
  created_by: string;
  approved_by?: string;
  rejected_by?: string;
  approved_at?: Date;
  rejected_at?: Date;
  rejection_reason?: string;
  effective_from: Date;
  effective_until?: Date;
  source: 'manual' | 'sira_auto' | 'experiment' | 'emergency';
  source_id?: string;
  description?: string;
  tags?: string[];
  created_at: Date;
  updated_at: Date;
}

export interface ZonePricingOverride {
  id: string;
  merchant_id: string;
  zone: {
    countries?: string[];
    regions?: string[];
    cities?: string[];
  };
  method: 'wallet' | 'card' | 'mobile_money' | 'bank_transfer' | 'ussd' | 'qr_code';
  provider?: string;
  fee_percent: number;
  fee_fixed: number;
  fee_cap?: number;
  is_discount: boolean;
  discount_reason?: string;
  active: boolean;
  effective_from: Date;
  effective_until?: Date;
  created_by: string;
  approved_by?: string;
  approved_at?: Date;
  source: 'manual' | 'experiment' | 'promotion' | 'sira_recommendation';
  source_id?: string;
  description?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ZoneExperiment {
  id: string;
  merchant_id: string;
  name: string;
  description?: string;
  hypothesis?: string;
  variant_a: Record<string, any>;
  variant_b: Record<string, any>;
  percent_b: number;
  target_zones: Array<{ countries?: string[]; regions?: string[]; cities?: string[] }>;
  metrics_targets: {
    fraud_rate_max?: number;
    conversion_min?: number;
    revenue_min?: number;
    evaluation_window_hours?: number;
  };
  auto_rollback_enabled: boolean;
  rollback_conditions: {
    fraud_rate_breach?: number;
    conversion_drop_pct?: number;
    min_transactions?: number;
  };
  status: 'draft' | 'pending' | 'approved' | 'running' | 'paused' | 'stopped' | 'completed' | 'rolled_back' | 'rejected';
  created_by: string;
  approved_by?: string;
  rejected_by?: string;
  approved_at?: Date;
  rejected_at?: Date;
  rejection_reason?: string;
  started_at?: Date;
  stopped_at?: Date;
  rolled_back_at?: Date;
  rollback_reason?: string;
  winner_variant?: 'A' | 'B' | 'inconclusive';
  results_summary?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface ExperimentMetrics {
  experiment_id: string;
  day: Date;
  hour: number;
  zone: Record<string, any>;
  variant: 'A' | 'B';
  tx_count: number;
  tx_amount: number;
  tx_successful: number;
  tx_failed: number;
  fraud_count: number;
  fraud_amount: number;
  conversion_attempts: number;
  conversions: number;
  chargeback_count: number;
  chargeback_amount: number;
  revenue: number;
  fees_collected: number;
  unique_customers: number;
  fraud_rate: number;
  conversion_rate: number;
  chargeback_rate: number;
}

export interface PolicyApplication {
  rule_id: string;
  merchant_id: string;
  transaction_id?: string;
  customer_country: string;
  customer_city?: string;
  action_taken: 'blocked' | 'throttled' | 'payout_suspended' | 'kyc_required' | 'fee_adjusted' | 'alerted' | '3ds_required' | 'allowed';
  original_fee?: number;
  adjusted_fee?: number;
  metadata?: Record<string, any>;
}

// ============================================================================
// GEO POLICY RULES
// ============================================================================

/**
 * Create a new geo policy rule
 */
export async function createGeoPolicyRule(params: {
  scope: 'merchant' | 'global';
  scope_id?: string;
  rule_type: string;
  target_zone: Record<string, any>;
  params?: Record<string, any>;
  priority?: number;
  effective_from?: Date;
  effective_until?: Date;
  source?: string;
  source_id?: string;
  description?: string;
  tags?: string[];
  created_by: string;
}): Promise<GeoPolicyRule> {
  const result = await pool.query<GeoPolicyRule>(
    `INSERT INTO geo_policy_rules (
      scope, scope_id, rule_type, target_zone, params, priority,
      effective_from, effective_until, source, source_id,
      description, tags, created_by, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
    RETURNING *`,
    [
      params.scope,
      params.scope_id,
      params.rule_type,
      JSON.stringify(params.target_zone),
      JSON.stringify(params.params || {}),
      params.priority || 100,
      params.effective_from || new Date(),
      params.effective_until,
      params.source || 'manual',
      params.source_id,
      params.description,
      params.tags || [],
      params.created_by,
    ]
  );

  return result.rows[0];
}

/**
 * Approve a pending policy rule
 */
export async function approveGeoPolicyRule(
  ruleId: string,
  approvedBy: string
): Promise<GeoPolicyRule> {
  const result = await pool.query<GeoPolicyRule>(
    `UPDATE geo_policy_rules
     SET status = 'active', approved_by = $1, approved_at = now(), updated_at = now()
     WHERE id = $2 AND status = 'pending'
     RETURNING *`,
    [approvedBy, ruleId]
  );

  if (result.rows.length === 0) {
    throw new Error('Rule not found or not in pending status');
  }

  // TODO: Push to runtime cache/gateway
  await applyRuleToRuntime(result.rows[0]);

  return result.rows[0];
}

/**
 * Reject a pending policy rule
 */
export async function rejectGeoPolicyRule(
  ruleId: string,
  rejectedBy: string,
  reason: string
): Promise<GeoPolicyRule> {
  const result = await pool.query<GeoPolicyRule>(
    `UPDATE geo_policy_rules
     SET status = 'rejected', rejected_by = $1, rejected_at = now(),
         rejection_reason = $2, updated_at = now()
     WHERE id = $3 AND status = 'pending'
     RETURNING *`,
    [rejectedBy, reason, ruleId]
  );

  if (result.rows.length === 0) {
    throw new Error('Rule not found or not in pending status');
  }

  return result.rows[0];
}

/**
 * Get policy rules for a merchant
 */
export async function getPolicyRules(
  merchantId?: string,
  status?: string
): Promise<GeoPolicyRule[]> {
  let query = `SELECT * FROM geo_policy_rules WHERE 1=1`;
  const params: any[] = [];
  let paramIndex = 1;

  if (merchantId) {
    query += ` AND (scope = 'global' OR (scope = 'merchant' AND scope_id = $${paramIndex}))`;
    params.push(merchantId);
    paramIndex++;
  }

  if (status) {
    query += ` AND status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  query += ` ORDER BY priority DESC, created_at DESC`;

  const result = await pool.query<GeoPolicyRule>(query, params);
  return result.rows;
}

/**
 * Pause/resume a rule
 */
export async function toggleGeoPolicyRule(
  ruleId: string,
  pause: boolean
): Promise<GeoPolicyRule> {
  const newStatus = pause ? 'paused' : 'active';

  const result = await pool.query<GeoPolicyRule>(
    `UPDATE geo_policy_rules
     SET status = $1, updated_at = now()
     WHERE id = $2 AND status IN ('active', 'paused')
     RETURNING *`,
    [newStatus, ruleId]
  );

  if (result.rows.length === 0) {
    throw new Error('Rule not found or cannot be toggled');
  }

  return result.rows[0];
}

/**
 * Apply rule to runtime (placeholder - integrate with actual gateway)
 */
async function applyRuleToRuntime(rule: GeoPolicyRule): Promise<void> {
  // TODO: Push to Redis cache
  // TODO: Push to API Gateway (Envoy/Istio) via GitOps or API
  console.log(`[Runtime] Applying rule ${rule.id} (${rule.rule_type}) to gateway...`);

  // Example: Redis cache
  // await redis.set(`policy:${rule.id}`, JSON.stringify(rule), 'EX', 3600);
}

// ============================================================================
// ZONE PRICING OVERRIDES
// ============================================================================

/**
 * Create zone pricing override
 */
export async function createZonePricingOverride(params: {
  merchant_id: string;
  zone: Record<string, any>;
  method: string;
  provider?: string;
  fee_percent: number;
  fee_fixed: number;
  fee_cap?: number;
  is_discount?: boolean;
  discount_reason?: string;
  effective_from?: Date;
  effective_until?: Date;
  source?: string;
  source_id?: string;
  description?: string;
  created_by: string;
}): Promise<ZonePricingOverride> {
  const result = await pool.query<ZonePricingOverride>(
    `INSERT INTO zone_pricing_overrides (
      merchant_id, zone, method, provider, fee_percent, fee_fixed, fee_cap,
      is_discount, discount_reason, effective_from, effective_until,
      source, source_id, description, created_by, active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, true)
    RETURNING *`,
    [
      params.merchant_id,
      JSON.stringify(params.zone),
      params.method,
      params.provider,
      params.fee_percent,
      params.fee_fixed,
      params.fee_cap,
      params.is_discount || false,
      params.discount_reason,
      params.effective_from || new Date(),
      params.effective_until,
      params.source || 'manual',
      params.source_id,
      params.description,
      params.created_by,
    ]
  );

  return result.rows[0];
}

/**
 * Get applicable pricing for a transaction
 */
export async function getApplicablePricing(
  merchantId: string,
  country: string,
  city: string,
  method: string,
  provider?: string
): Promise<{
  fee_percent: number;
  fee_fixed: number;
  fee_cap?: number;
  override_id?: string;
} | null> {
  const result = await pool.query(
    `SELECT * FROM get_zone_pricing($1, $2, $3, $4, $5)`,
    [merchantId, country, city, method, provider]
  );

  return result.rows[0] || null;
}

/**
 * Get pricing overrides for merchant
 */
export async function getZonePricingOverrides(
  merchantId: string,
  active?: boolean
): Promise<ZonePricingOverride[]> {
  let query = `SELECT * FROM zone_pricing_overrides WHERE merchant_id = $1`;
  const params: any[] = [merchantId];

  if (active !== undefined) {
    query += ` AND active = $2`;
    params.push(active);
  }

  query += ` ORDER BY created_at DESC`;

  const result = await pool.query<ZonePricingOverride>(query, params);
  return result.rows;
}

// ============================================================================
// A/B EXPERIMENTS
// ============================================================================

/**
 * Create experiment
 */
export async function createExperiment(params: {
  merchant_id: string;
  name: string;
  description?: string;
  hypothesis?: string;
  variant_a: Record<string, any>;
  variant_b: Record<string, any>;
  percent_b: number;
  target_zones?: Array<Record<string, any>>;
  metrics_targets?: Record<string, any>;
  auto_rollback_enabled?: boolean;
  rollback_conditions?: Record<string, any>;
  created_by: string;
}): Promise<ZoneExperiment> {
  const result = await pool.query<ZoneExperiment>(
    `INSERT INTO zone_experiments (
      merchant_id, name, description, hypothesis, variant_a, variant_b,
      percent_b, target_zones, metrics_targets, auto_rollback_enabled,
      rollback_conditions, created_by, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft')
    RETURNING *`,
    [
      params.merchant_id,
      params.name,
      params.description,
      params.hypothesis,
      JSON.stringify(params.variant_a),
      JSON.stringify(params.variant_b),
      params.percent_b,
      JSON.stringify(params.target_zones || []),
      JSON.stringify(params.metrics_targets || {}),
      params.auto_rollback_enabled !== false,
      JSON.stringify(params.rollback_conditions || {}),
      params.created_by,
    ]
  );

  return result.rows[0];
}

/**
 * Approve experiment
 */
export async function approveExperiment(
  experimentId: string,
  approvedBy: string
): Promise<ZoneExperiment> {
  const result = await pool.query<ZoneExperiment>(
    `UPDATE zone_experiments
     SET status = 'approved', approved_by = $1, approved_at = now(), updated_at = now()
     WHERE id = $2 AND status = 'pending'
     RETURNING *`,
    [approvedBy, experimentId]
  );

  if (result.rows.length === 0) {
    throw new Error('Experiment not found or not in pending status');
  }

  return result.rows[0];
}

/**
 * Start experiment
 */
export async function startExperiment(experimentId: string): Promise<ZoneExperiment> {
  const result = await pool.query<ZoneExperiment>(
    `UPDATE zone_experiments
     SET status = 'running', started_at = now(), updated_at = now()
     WHERE id = $1 AND status IN ('draft', 'approved')
     RETURNING *`,
    [experimentId]
  );

  if (result.rows.length === 0) {
    throw new Error('Experiment not found or cannot be started');
  }

  // TODO: Start traffic routing
  await startExperimentRouting(result.rows[0]);

  return result.rows[0];
}

/**
 * Stop experiment
 */
export async function stopExperiment(
  experimentId: string,
  reason?: string
): Promise<ZoneExperiment> {
  const result = await pool.query<ZoneExperiment>(
    `UPDATE zone_experiments
     SET status = 'stopped', stopped_at = now(), rollback_reason = $2, updated_at = now()
     WHERE id = $1 AND status = 'running'
     RETURNING *`,
    [experimentId, reason]
  );

  if (result.rows.length === 0) {
    throw new Error('Experiment not found or not running');
  }

  // TODO: Stop traffic routing
  await stopExperimentRouting(result.rows[0]);

  return result.rows[0];
}

/**
 * Check if experiment should be rolled back
 */
export async function checkExperimentRollback(experimentId: string): Promise<boolean> {
  const result = await pool.query<{ check_experiment_rollback: boolean }>(
    `SELECT check_experiment_rollback($1) as should_rollback`,
    [experimentId]
  );

  return result.rows[0].check_experiment_rollback;
}

/**
 * Get experiments for merchant
 */
export async function getExperiments(
  merchantId: string,
  status?: string
): Promise<ZoneExperiment[]> {
  let query = `SELECT * FROM zone_experiments WHERE merchant_id = $1`;
  const params: any[] = [merchantId];

  if (status) {
    query += ` AND status = $2`;
    params.push(status);
  }

  query += ` ORDER BY created_at DESC`;

  const result = await pool.query<ZoneExperiment>(query, params);
  return result.rows;
}

/**
 * Get experiment metrics
 */
export async function getExperimentMetrics(
  experimentId: string,
  days: number = 7
): Promise<ExperimentMetrics[]> {
  const result = await pool.query<ExperimentMetrics>(
    `SELECT * FROM zone_experiment_metrics
     WHERE experiment_id = $1
       AND day >= CURRENT_DATE - $2
     ORDER BY day DESC, hour DESC`,
    [experimentId, days]
  );

  return result.rows;
}

/**
 * Record experiment metrics (called by payment processor)
 */
export async function recordExperimentMetrics(
  experimentId: string,
  variant: 'A' | 'B',
  zone: Record<string, any>,
  metrics: {
    tx_count?: number;
    tx_amount?: number;
    tx_successful?: number;
    tx_failed?: number;
    fraud_count?: number;
    fraud_amount?: number;
    conversion_attempts?: number;
    conversions?: number;
    revenue?: number;
    fees_collected?: number;
    unique_customers?: number;
  }
): Promise<void> {
  const now = new Date();
  const day = now.toISOString().split('T')[0];
  const hour = now.getHours();

  await pool.query(
    `INSERT INTO zone_experiment_metrics (
      experiment_id, day, hour, zone, variant,
      tx_count, tx_amount, tx_successful, tx_failed,
      fraud_count, fraud_amount, conversion_attempts, conversions,
      revenue, fees_collected, unique_customers
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    ON CONFLICT (experiment_id, day, hour, zone, variant) DO UPDATE SET
      tx_count = zone_experiment_metrics.tx_count + EXCLUDED.tx_count,
      tx_amount = zone_experiment_metrics.tx_amount + EXCLUDED.tx_amount,
      tx_successful = zone_experiment_metrics.tx_successful + EXCLUDED.tx_successful,
      tx_failed = zone_experiment_metrics.tx_failed + EXCLUDED.tx_failed,
      fraud_count = zone_experiment_metrics.fraud_count + EXCLUDED.fraud_count,
      fraud_amount = zone_experiment_metrics.fraud_amount + EXCLUDED.fraud_amount,
      conversion_attempts = zone_experiment_metrics.conversion_attempts + EXCLUDED.conversion_attempts,
      conversions = zone_experiment_metrics.conversions + EXCLUDED.conversions,
      revenue = zone_experiment_metrics.revenue + EXCLUDED.revenue,
      fees_collected = zone_experiment_metrics.fees_collected + EXCLUDED.fees_collected,
      unique_customers = zone_experiment_metrics.unique_customers + EXCLUDED.unique_customers`,
    [
      experimentId,
      day,
      hour,
      JSON.stringify(zone),
      variant,
      metrics.tx_count || 0,
      metrics.tx_amount || 0,
      metrics.tx_successful || 0,
      metrics.tx_failed || 0,
      metrics.fraud_count || 0,
      metrics.fraud_amount || 0,
      metrics.conversion_attempts || 0,
      metrics.conversions || 0,
      metrics.revenue || 0,
      metrics.fees_collected || 0,
      metrics.unique_customers || 0,
    ]
  );

  // Check rollback conditions after recording metrics
  await checkExperimentRollback(experimentId);
}

// ============================================================================
// POLICY EVALUATION & APPLICATION
// ============================================================================

/**
 * Evaluate applicable rules for a transaction
 */
export async function evaluateTransaction(
  merchantId: string,
  country: string,
  city?: string,
  amount?: number
): Promise<{
  rules: Array<{ rule_id: string; rule_type: string; params: Record<string, any>; priority: number }>;
  pricing?: { fee_percent: number; fee_fixed: number; fee_cap?: number };
  should_block: boolean;
  should_throttle: boolean;
  should_require_3ds: boolean;
  should_require_kyc: boolean;
}> {
  // Get applicable rules
  const rulesResult = await pool.query(
    `SELECT * FROM get_applicable_rules($1, $2, $3)`,
    [merchantId, country, city]
  );

  const rules = rulesResult.rows;

  // Evaluate rules
  const should_block = rules.some((r: any) => r.rule_type === 'block');
  const should_throttle = rules.some((r: any) => r.rule_type === 'throttle');
  const should_require_3ds = rules.some((r: any) => r.rule_type === 'require_3ds');
  const should_require_kyc = rules.some((r: any) => r.rule_type === 'require_kyc');

  // Get pricing if not blocked
  let pricing;
  if (!should_block) {
    const pricingResult = await pool.query(
      `SELECT * FROM get_zone_pricing($1, $2, $3, 'card', NULL)`,
      [merchantId, country, city || '']
    );
    pricing = pricingResult.rows[0];
  }

  return {
    rules,
    pricing,
    should_block,
    should_throttle,
    should_require_3ds,
    should_require_kyc,
  };
}

/**
 * Log policy application
 */
export async function logPolicyApplication(params: PolicyApplication): Promise<void> {
  await pool.query(
    `INSERT INTO geo_policy_applications (
      rule_id, merchant_id, transaction_id, customer_country, customer_city,
      action_taken, original_fee, adjusted_fee, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      params.rule_id,
      params.merchant_id,
      params.transaction_id,
      params.customer_country,
      params.customer_city,
      params.action_taken,
      params.original_fee,
      params.adjusted_fee,
      JSON.stringify(params.metadata || {}),
    ]
  );
}

// ============================================================================
// TRAFFIC ROUTING (Placeholder - integrate with actual routing system)
// ============================================================================

async function startExperimentRouting(experiment: ZoneExperiment): Promise<void> {
  console.log(`[Routing] Starting experiment ${experiment.id} with ${experiment.percent_b}% traffic to B`);

  // TODO: Configure traffic router to split by user_id hash % 100 < percent_b
  // Example: Redis + Envoy filter
  // await redis.set(`experiment:${experiment.id}`, JSON.stringify({
  //   percent_b: experiment.percent_b,
  //   variant_a: experiment.variant_a,
  //   variant_b: experiment.variant_b
  // }), 'EX', 86400 * 30);
}

async function stopExperimentRouting(experiment: ZoneExperiment): Promise<void> {
  console.log(`[Routing] Stopping experiment ${experiment.id}`);

  // TODO: Remove from traffic router
  // await redis.del(`experiment:${experiment.id}`);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Policy rules
  createGeoPolicyRule,
  approveGeoPolicyRule,
  rejectGeoPolicyRule,
  getPolicyRules,
  toggleGeoPolicyRule,

  // Pricing
  createZonePricingOverride,
  getApplicablePricing,
  getZonePricingOverrides,

  // Experiments
  createExperiment,
  approveExperiment,
  startExperiment,
  stopExperiment,
  checkExperimentRollback,
  getExperiments,
  getExperimentMetrics,
  recordExperimentMetrics,

  // Evaluation
  evaluateTransaction,
  logPolicyApplication,
};
