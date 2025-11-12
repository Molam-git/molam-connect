/**
 * Radar Evaluator - Core rule evaluation engine using JSONLogic
 */
import jsonLogic from "json-logic-js";
import { pool } from "../utils/db.js";

export interface PaymentSignal {
  id: string;
  payment_id: string;
  merchant_id: string;
  customer_id?: string;
  country: string;
  currency: string;
  amount: number;
  device_fingerprint?: any;
  ip_address?: string;
  geo?: any;
  velocity?: any;
  agent_info?: any;
  shipping_info?: any;
  billing_info?: any;
  labels?: any;
  sira_score?: number;
  created_at: Date;
}

export interface RadarRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  scope: any;
  condition: string; // JSONLogic as string
  action: any;
  priority: number;
}

export interface RuleEvaluation {
  ruleId: string;
  ruleName: string;
  triggered: boolean;
  score: number;
  explanation: any;
}

export interface RadarAction {
  type: string;
  params: any;
  ruleId: string;
  requireApproval: boolean;
}

export interface EvaluationResult {
  evaluations: RuleEvaluation[];
  actions: RadarAction[];
  totalScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
}

/**
 * Evaluate all enabled rules for a payment
 */
export async function evaluateRulesForPayment(
  signal: PaymentSignal
): Promise<EvaluationResult> {
  // Load enabled rules ordered by priority
  const { rows: rules } = await pool.query<RadarRule>(
    `SELECT * FROM radar_rules WHERE enabled = true ORDER BY priority ASC`
  );

  const evaluations: RuleEvaluation[] = [];
  const actions: RadarAction[] = [];
  let totalScore = 0;
  let shouldBreak = false;

  for (const rule of rules) {
    if (shouldBreak) break;

    try {
      // Check scope match
      if (!matchesScope(signal, rule.scope)) {
        continue;
      }

      // Parse JSONLogic condition
      const condition = JSON.parse(rule.condition);

      // Flatten signal into JSONLogic context
      const data = flattenSignal(signal);

      // Evaluate rule
      const triggered = !!jsonLogic.apply(condition, data);

      // Calculate score (0-1 range)
      const score = triggered ? 1 : 0;
      totalScore += score;

      // Build explanation
      const explanation = {
        matched: triggered,
        rule: rule.name,
        condition: condition,
        data: data,
        reason: triggered ? `Rule "${rule.name}" triggered` : `Rule "${rule.name}" not triggered`,
      };

      evaluations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        triggered,
        score,
        explanation,
      });

      // If triggered, add action
      if (triggered) {
        const action = rule.action || {};
        actions.push({
          type: action.type || "notify",
          params: action.params || {},
          ruleId: rule.id,
          requireApproval: action.require_approval === true,
        });

        // Break if action is blocking and immediate
        if (action.type === "block" && action.immediate === true) {
          shouldBreak = true;
        }
      }
    } catch (error) {
      console.error(`Rule evaluation error for rule ${rule.id}:`, error);
      // Log failed evaluation
      evaluations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        triggered: false,
        score: 0,
        explanation: { error: "Rule evaluation failed", details: String(error) },
      });
    }
  }

  // Calculate risk level based on total score and actions
  const riskLevel = calculateRiskLevel(totalScore, actions);

  return {
    evaluations,
    actions,
    totalScore,
    riskLevel,
  };
}

/**
 * Check if payment signal matches rule scope
 */
function matchesScope(signal: PaymentSignal, scope: any): boolean {
  if (!scope || Object.keys(scope).length === 0) return true;

  // Check countries
  if (scope.countries && Array.isArray(scope.countries)) {
    if (!scope.countries.includes(signal.country)) return false;
  }

  // Check merchants
  if (scope.merchants && Array.isArray(scope.merchants)) {
    if (!scope.merchants.includes(signal.merchant_id)) return false;
  }

  // Check min amount
  if (scope.min_amount && signal.amount < scope.min_amount) {
    return false;
  }

  // Check max amount
  if (scope.max_amount && signal.amount > scope.max_amount) {
    return false;
  }

  return true;
}

/**
 * Flatten payment signal into JSONLogic context
 */
function flattenSignal(signal: PaymentSignal): any {
  return {
    // Basic fields
    amount: Number(signal.amount),
    country: signal.country,
    currency: signal.currency,
    merchant_id: signal.merchant_id,
    customer_id: signal.customer_id || null,

    // IP and geo
    ip: signal.ip_address || null,
    geo_country: signal.geo?.country_code || signal.geo?.country || null,
    geo_city: signal.geo?.city || null,
    geo_latitude: signal.geo?.latitude || null,
    geo_longitude: signal.geo?.longitude || null,

    // Device fingerprint
    device_id: signal.device_fingerprint?.id || null,
    device_type: signal.device_fingerprint?.type || null,
    device_os: signal.device_fingerprint?.os || null,
    device_browser: signal.device_fingerprint?.browser || null,

    // Velocity signals
    velocity_count_1h: signal.velocity?.count_1h || 0,
    velocity_count_24h: signal.velocity?.count_24h || 0,
    velocity_sum_1h: signal.velocity?.sum_1h || 0,
    velocity_sum_24h: signal.velocity?.sum_24h || 0,
    velocity_unique_cards_24h: signal.velocity?.unique_cards_24h || 0,

    // Shipping info
    shipping_country: signal.shipping_info?.country || null,
    shipping_city: signal.shipping_info?.city || null,
    shipping_tracking: signal.shipping_info?.tracking_number || null,

    // Billing info
    billing_country: signal.billing_info?.country || null,
    billing_postal_code: signal.billing_info?.postal_code || null,

    // Agent info (for agent-assisted transactions)
    agent_id: signal.agent_info?.agent_id || null,
    agent_location: signal.agent_info?.agent_location || null,

    // SIRA score
    sira_score: signal.sira_score || 0,

    // Custom labels
    labels: signal.labels || {},
  };
}

/**
 * Calculate risk level based on score and actions
 */
function calculateRiskLevel(
  totalScore: number,
  actions: RadarAction[]
): "low" | "medium" | "high" | "critical" {
  // Check for critical actions
  const hasCriticalAction = actions.some((a) => a.type === "block" || a.type === "hold_payout");
  if (hasCriticalAction) return "critical";

  // Check for high-risk actions
  const hasHighRiskAction = actions.some((a) => a.type === "challenge" || a.type === "auto_refute");
  if (hasHighRiskAction) return "high";

  // Score-based risk level
  if (totalScore >= 3) return "high";
  if (totalScore >= 2) return "medium";
  return "low";
}

/**
 * Validate JSONLogic rule (for rule creation/update)
 */
export function validateRule(condition: string): { valid: boolean; error?: string } {
  try {
    const parsed = JSON.parse(condition);
    // Try to evaluate with empty data to check syntax
    jsonLogic.apply(parsed, {});
    return { valid: true };
  } catch (error) {
    return { valid: false, error: String(error) };
  }
}
