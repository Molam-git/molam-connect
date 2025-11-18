/**
 * Core routing decision logic
 * Evaluates rules, SIRA hints, costs, and availability to select optimal route
 */

import { pool } from '../db';
import { getSiraHint, getMockSiraHint, SiraResponse } from './siraClient';
import { cacheGet, cacheSet } from './cache';
import { traceAsync, createSpan } from '../telemetry/otel';
import {
  recordRoutingDecision,
  recordRuleEvaluation,
  recordWalletCheck,
  recordFallbackUsed,
  recordIdempotencyConflict,
} from '../telemetry/prom';
import { logRoutingDecision, logWalletCheck, logFallback, logRuleEvaluation } from '../telemetry/logger';

export interface RoutingInput {
  idempotency_key?: string;
  payment_id?: string;
  merchant_id: string;
  user_id: string;
  amount: number;
  currency: string;
  country: string;
  payment_method_hint?: string;
  metadata?: any;
}

export interface CostEstimate {
  molam_fee: number;
  partner_fee: number;
  total: number;
  currency: string;
}

export interface RoutingDecision {
  id: string;
  route: 'wallet' | 'connect' | 'hybrid';
  reason: string;
  costs: {
    wallet: CostEstimate;
    connect: CostEstimate;
  };
  selected_rule_id?: string;
  fallback_routes: string[];
  reserve_ref?: string;
  sira: SiraResponse;
  expires_at: string;
  latency_ms: number;
}

const USE_MOCK_SIRA = process.env.USE_MOCK_SIRA === 'true';

/**
 * Main decision function
 */
export async function decideRouting(input: RoutingInput): Promise<RoutingDecision> {
  return traceAsync('decideRouting', async () => {
    const startTime = Date.now();

    // 1) Check idempotency
    if (input.idempotency_key) {
      const existing = await checkIdempotency(input.idempotency_key);
      if (existing) {
        recordIdempotencyConflict();
        return existing;
      }
    }

  // 2) Get SIRA hint (cached)
  const siraStart = Date.now();
  const sira = USE_MOCK_SIRA
    ? await getMockSiraHint(input)
    : await getSiraHint(input);
  const siraLatency = Date.now() - siraStart;

  // 3) Compute cost estimates
  const costs = estimateCosts(
    Number(input.amount),
    input.currency,
    input.country
  );

  // 4) Load active routing rules
  const rules = await getActiveRules(input.country, input.currency, input.merchant_id);

  // 5) Check for manual overrides first (highest priority)
  const override = await checkManualOverride(input);
  if (override) {
    const decision = await persistDecision(
      input,
      override.route as any,
      `manual_override:${override.reason}`,
      costs,
      sira,
      override.rule_id,
      siraLatency,
      Date.now() - startTime
    );
    return formatDecisionResponse(decision);
  }

  // 6) Apply routing rules in priority order
  let selectedRoute: 'wallet' | 'connect' | 'hybrid' = 'connect';
  let reason = 'default_connect';
  let selectedRuleId: string | undefined;

  for (const rule of rules) {
    const result = applyRule(rule, input, costs, sira);

    // Record rule evaluation metrics
    recordRuleEvaluation(rule.rule_type, result.matched);
    logRuleEvaluation({
      rule_id: rule.id,
      rule_type: rule.rule_type,
      matched: result.matched,
      priority: rule.priority,
    });

    if (result.matched) {
      selectedRoute = result.route;
      reason = result.reason;
      selectedRuleId = rule.id;
      break;
    }
  }

  // 7) If no rule matched, use SIRA hint
  if (!selectedRuleId && sira.routing_hint !== 'no_preference') {
    if (sira.routing_hint === 'prefer_wallet') {
      selectedRoute = 'wallet';
      reason = `sira_hint:prefer_wallet (${sira.reasons.join(', ')})`;
    } else if (sira.routing_hint === 'prefer_connect') {
      selectedRoute = 'connect';
      reason = `sira_hint:prefer_connect (${sira.reasons.join(', ')})`;
    } else if (sira.routing_hint === 'hybrid') {
      selectedRoute = 'hybrid';
      reason = `sira_hint:hybrid (${sira.reasons.join(', ')})`;
    }
  }

  // 8) Verify wallet availability if wallet route selected
  if (selectedRoute === 'wallet') {
    const walletAvailable = await checkWalletAvailability(
      input.user_id,
      input.currency,
      Number(input.amount)
    );

    // Record wallet check metrics
    recordWalletCheck(walletAvailable.available ? 'success' : 'failed');
    logWalletCheck({
      user_id: input.user_id,
      currency: input.currency,
      amount: Number(input.amount),
      available: walletAvailable.available,
      reason: walletAvailable.reason,
    });

    if (!walletAvailable.available) {
      // Fallback to connect
      const primaryRoute = selectedRoute;
      selectedRoute = 'connect';
      reason = `wallet_fallback:${walletAvailable.reason}`;

      // Record fallback metrics
      recordFallbackUsed(primaryRoute, 'connect');
      logFallback({
        decision_id: `temp_${Date.now()}`,
        primary_route: primaryRoute,
        fallback_route: 'connect',
        reason: walletAvailable.reason || 'wallet_unavailable',
      });
    } else if (walletAvailable.reserve_ref) {
      // Wallet hold created successfully
    }
  }

    // 9) Persist decision
    const totalLatency = Date.now() - startTime;
    const decision = await persistDecision(
      input,
      selectedRoute,
      reason,
      costs,
      sira,
      selectedRuleId,
      siraLatency,
      totalLatency
    );

    // 10) Cache decision for idempotency
    if (input.idempotency_key) {
      await cacheSet(`routing:idem:${input.idempotency_key}`, decision, 30);
    }

    // 11) Record metrics and logs
    recordRoutingDecision(
      selectedRoute,
      'success',
      input.country,
      input.currency,
      totalLatency
    );

    logRoutingDecision({
      decision_id: decision.id,
      payment_id: input.payment_id,
      merchant_id: input.merchant_id,
      user_id: input.user_id,
      route: selectedRoute,
      reason,
      amount: Number(input.amount),
      currency: input.currency,
      country: input.country,
      duration_ms: totalLatency,
      sira_hint: sira.routing_hint,
      idempotency_key: input.idempotency_key,
    });

    return formatDecisionResponse(decision);
  });
}

/**
 * Check idempotency
 */
async function checkIdempotency(key: string): Promise<RoutingDecision | null> {
  // Check cache first
  const cached = await cacheGet<any>(`routing:idem:${key}`);
  if (cached) {
    return formatDecisionResponse(cached);
  }

  // Check database
  const result = await pool.query(
    `SELECT * FROM routing_decisions WHERE idempotency_key = $1 LIMIT 1`,
    [key]
  );

  if (result.rows.length > 0) {
    return formatDecisionResponse(result.rows[0]);
  }

  return null;
}

/**
 * Estimate costs for wallet vs connect
 */
function estimateCosts(
  amount: number,
  currency: string,
  country: string
): { wallet: CostEstimate; connect: CostEstimate } {
  // In production, query fee_tables from database
  // Simplified calculation here

  // Wallet fees: 0.9% for P2P, 1.5% for merchant
  const walletFeePct = 0.015; // 1.5%
  const walletFee = +(amount * walletFeePct).toFixed(2);

  // Connect fees: 2.25% + fixed fee
  const connectFeePct = 0.0225; // 2.25%
  const connectFixed = 0.25; // $0.25 equivalent
  const connectFee = +(amount * connectFeePct + connectFixed).toFixed(2);

  return {
    wallet: {
      molam_fee: walletFee,
      partner_fee: 0,
      total: walletFee,
      currency
    },
    connect: {
      molam_fee: +(amount * connectFeePct).toFixed(2),
      partner_fee: connectFixed,
      total: connectFee,
      currency
    }
  };
}

/**
 * Get active routing rules
 */
async function getActiveRules(
  country: string,
  currency: string,
  merchant_id: string
): Promise<any[]> {
  const result = await pool.query(
    `SELECT * FROM get_active_routing_rules($1, $2, $3)`,
    [country, currency, merchant_id]
  );
  return result.rows;
}

/**
 * Check for manual overrides
 */
async function checkManualOverride(input: RoutingInput): Promise<any | null> {
  const result = await pool.query(
    `SELECT * FROM routing_overrides
     WHERE is_active = true
       AND valid_from <= NOW()
       AND (valid_until IS NULL OR valid_until >= NOW())
       AND (
         scope->>'merchant_id' = $1 OR
         scope->>'user_id' = $2 OR
         scope->>'country' = $3
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.merchant_id, input.user_id, input.country]
  );

  if (result.rows.length > 0) {
    const override = result.rows[0];
    return {
      route: override.forced_route,
      reason: override.reason,
      rule_id: override.id
    };
  }

  return null;
}

/**
 * Apply a single routing rule
 */
function applyRule(
  rule: any,
  input: RoutingInput,
  costs: { wallet: CostEstimate; connect: CostEstimate },
  sira: SiraResponse
): { matched: boolean; route: 'wallet' | 'connect' | 'hybrid'; reason: string } {
  const amount = Number(input.amount);

  switch (rule.rule_type) {
    case 'prefer_wallet':
      return { matched: true, route: 'wallet', reason: `rule:prefer_wallet (${rule.id})` };

    case 'prefer_connect':
      return { matched: true, route: 'connect', reason: `rule:prefer_connect (${rule.id})` };

    case 'force_wallet':
      return { matched: true, route: 'wallet', reason: `rule:force_wallet (${rule.id})` };

    case 'force_connect':
      return { matched: true, route: 'connect', reason: `rule:force_connect (${rule.id})` };

    case 'cost_threshold': {
      const thresholdPct = Number(rule.params?.threshold_pct || 0.02);
      if (costs.wallet.total <= costs.connect.total * (1 - thresholdPct)) {
        return { matched: true, route: 'wallet', reason: `rule:cost_threshold (${rule.id})` };
      }
      return { matched: false, route: 'connect', reason: '' };
    }

    case 'amount_based': {
      const minAmount = Number(rule.params?.min_amount || 0);
      const maxAmount = Number(rule.params?.max_amount || Infinity);
      const preferredRoute = rule.params?.preferred_route || 'connect';

      if (amount >= minAmount && amount <= maxAmount) {
        return {
          matched: true,
          route: preferredRoute,
          reason: `rule:amount_based (${rule.id})`
        };
      }
      return { matched: false, route: 'connect', reason: '' };
    }

    case 'time_based': {
      const now = new Date();
      const currentHour = now.getHours();
      const startHour = Number(rule.params?.start_hour || 0);
      const endHour = Number(rule.params?.end_hour || 23);
      const preferredRoute = rule.params?.preferred_route || 'connect';

      if (currentHour >= startHour && currentHour <= endHour) {
        return {
          matched: true,
          route: preferredRoute,
          reason: `rule:time_based (${rule.id})`
        };
      }
      return { matched: false, route: 'connect', reason: '' };
    }

    default:
      return { matched: false, route: 'connect', reason: '' };
  }
}

/**
 * Check wallet availability
 */
async function checkWalletAvailability(
  user_id: string,
  currency: string,
  amount: number
): Promise<{ available: boolean; reason?: string; reserve_ref?: string }> {
  try {
    // Query wallet balance (assuming molam_wallets table exists from previous briques)
    const result = await pool.query(
      `SELECT balance, kyc_level, status
       FROM molam_wallets
       WHERE user_id = $1 AND currency = $2
       LIMIT 1`,
      [user_id, currency]
    );

    if (result.rows.length === 0) {
      return { available: false, reason: 'wallet_not_found' };
    }

    const wallet = result.rows[0];

    if (wallet.status !== 'active') {
      return { available: false, reason: 'wallet_inactive' };
    }

    if (Number(wallet.balance) < amount) {
      return { available: false, reason: 'insufficient_balance' };
    }

    // Check KYC level (could add more sophisticated checks)
    if (wallet.kyc_level < 1 && amount > 50000) {
      return { available: false, reason: 'kyc_insufficient' };
    }

    // In production, create a ledger hold here
    // const holdRef = await createLedgerHold(user_id, amount, currency);

    return {
      available: true,
      reserve_ref: `hold_${Date.now()}_${user_id.substring(0, 8)}`
    };
  } catch (error) {
    console.error('Wallet availability check error:', error);
    return { available: false, reason: 'wallet_check_failed' };
  }
}

/**
 * Persist decision to database
 */
async function persistDecision(
  input: RoutingInput,
  route: 'wallet' | 'connect' | 'hybrid',
  reason: string,
  costs: { wallet: CostEstimate; connect: CostEstimate },
  sira: SiraResponse,
  selectedRuleId: string | undefined,
  siraLatency: number,
  totalLatency: number
): Promise<any> {
  const decision = {
    route,
    reason,
    costs,
    selected_rule_id: selectedRuleId,
    fallback_routes: getFallbackRoutes(route),
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 min expiry
  };

  const result = await pool.query(
    `INSERT INTO routing_decisions (
      idempotency_key, payment_id, merchant_id, user_id,
      amount, currency, country,
      decision, sira_snapshot,
      payment_method_hint, metadata,
      decision_latency_ms, sira_latency_ms,
      execution_status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
    RETURNING *`,
    [
      input.idempotency_key || null,
      input.payment_id || null,
      input.merchant_id,
      input.user_id,
      input.amount,
      input.currency,
      input.country,
      JSON.stringify(decision),
      JSON.stringify(sira),
      input.payment_method_hint || null,
      JSON.stringify(input.metadata || {}),
      totalLatency,
      siraLatency
    ]
  );

  return result.rows[0];
}

/**
 * Get fallback routes
 */
function getFallbackRoutes(primaryRoute: string): string[] {
  switch (primaryRoute) {
    case 'wallet':
      return ['connect'];
    case 'connect':
      return ['hybrid', 'wallet'];
    case 'hybrid':
      return ['connect', 'wallet'];
    default:
      return [];
  }
}

/**
 * Format decision response for API
 */
function formatDecisionResponse(dbRecord: any): RoutingDecision {
  const decision = typeof dbRecord.decision === 'string'
    ? JSON.parse(dbRecord.decision)
    : dbRecord.decision;

  const sira = typeof dbRecord.sira_snapshot === 'string'
    ? JSON.parse(dbRecord.sira_snapshot)
    : dbRecord.sira_snapshot;

  return {
    id: dbRecord.id,
    route: decision.route,
    reason: decision.reason,
    costs: decision.costs,
    selected_rule_id: decision.selected_rule_id,
    fallback_routes: decision.fallback_routes || [],
    reserve_ref: decision.reserve_ref,
    sira: sira,
    expires_at: decision.expires_at,
    latency_ms: dbRecord.decision_latency_ms || 0
  };
}
