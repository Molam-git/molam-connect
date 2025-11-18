// SIRA Routing Integration
// Intelligent routing for payouts using SIRA API

import { pool } from '../utils/db';

export interface RoutingRequest {
  currency: string;
  amount: number;
  priority: 'normal' | 'priority' | 'instant';
  beneficiary: any;
  origin_module: string;
  origin_entity_id?: string;
}

export interface RoutingRecommendation {
  bank_profile_id: string;
  treasury_account_id: string;
  routing_method: string; // 'batch','instant','sepa','swift', etc.
  estimated_bank_fee: number;
  estimated_settlement_time_minutes: number;
  confidence_score: number; // 0-1
  fraud_score: number; // 0-1 (higher = more suspicious)
  recommended_action: 'approve' | 'hold' | 'reject';
  hold_reason?: string;
  metadata: any;
}

/**
 * Pick optimal routing for payout using SIRA
 */
export async function pickRouting(request: RoutingRequest): Promise<RoutingRecommendation> {
  // Step 1: Get SIRA evaluation
  const siraEval = await evaluatePayoutWithSIRA(request);

  // Step 2: If fraud score high, recommend hold
  if (siraEval.fraud_score > 0.7) {
    // Still provide routing but flag for hold
    const routing = await selectBestRouting(request, siraEval);
    return {
      ...routing,
      recommended_action: 'hold',
      hold_reason: 'fraud_score_high',
    };
  }

  // Step 3: Select best routing based on criteria
  const routing = await selectBestRouting(request, siraEval);

  return routing;
}

/**
 * Evaluate payout with SIRA for fraud detection and routing optimization
 */
async function evaluatePayoutWithSIRA(request: RoutingRequest): Promise<any> {
  // In production, this calls actual SIRA API
  // For now, simulate SIRA response

  const SIRA_API_URL = process.env.SIRA_API_URL || 'http://localhost:3001';

  try {
    // Mock SIRA evaluation
    const mockResponse = {
      fraud_score: calculateMockFraudScore(request),
      routing_suggestions: await getMockRoutingSuggestions(request),
      risk_factors: [],
      confidence: 0.85,
    };

    // TODO: Replace with actual API call
    // const response = await fetch(`${SIRA_API_URL}/api/evaluate-payout`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(request)
    // });
    // return await response.json();

    return mockResponse;
  } catch (error) {
    console.error('SIRA evaluation failed, falling back to default routing:', error);
    return {
      fraud_score: 0.1,
      routing_suggestions: [],
      confidence: 0.5,
    };
  }
}

/**
 * Select best routing from available options
 */
async function selectBestRouting(
  request: RoutingRequest,
  siraEval: any
): Promise<RoutingRecommendation> {
  // Get available bank profiles for currency
  const { rows: bankProfiles } = await pool.query(
    `SELECT bp.id, bp.bank_name, bp.supported_currencies, bp.metadata,
            ta.id as treasury_account_id, ta.currency, ta.available_balance
     FROM bank_profiles bp
     LEFT JOIN treasury_accounts ta ON ta.bank_profile_id = bp.id AND ta.currency = $1
     WHERE bp.active = TRUE
       AND bp.supported_currencies ? $1
       AND (ta.available_balance IS NULL OR ta.available_balance >= $2)
     ORDER BY bp.priority DESC`,
    [request.currency, request.amount]
  );

  if (bankProfiles.length === 0) {
    throw new Error(`No bank profiles available for ${request.currency}`);
  }

  // If SIRA provided suggestions, prefer those
  if (siraEval.routing_suggestions && siraEval.routing_suggestions.length > 0) {
    const suggestion = siraEval.routing_suggestions[0];
    const matchingProfile = bankProfiles.find((bp) => bp.id === suggestion.bank_profile_id);

    if (matchingProfile) {
      return {
        bank_profile_id: matchingProfile.id,
        treasury_account_id: matchingProfile.treasury_account_id,
        routing_method: suggestion.routing_method || determineRoutingMethod(request),
        estimated_bank_fee: suggestion.estimated_fee || 0,
        estimated_settlement_time_minutes: suggestion.settlement_time || 1440,
        confidence_score: siraEval.confidence || 0.8,
        fraud_score: siraEval.fraud_score || 0,
        recommended_action: siraEval.fraud_score > 0.7 ? 'hold' : 'approve',
        metadata: siraEval,
      };
    }
  }

  // Fallback: select based on priority and availability
  const selected = bankProfiles[0];

  return {
    bank_profile_id: selected.id,
    treasury_account_id: selected.treasury_account_id,
    routing_method: determineRoutingMethod(request),
    estimated_bank_fee: estimateFeeForBank(selected.id, request),
    estimated_settlement_time_minutes: estimateSettlementTime(request),
    confidence_score: 0.6,
    fraud_score: siraEval.fraud_score || 0,
    recommended_action: 'approve',
    metadata: {},
  };
}

/**
 * Determine routing method based on priority and currency
 */
function determineRoutingMethod(request: RoutingRequest): string {
  if (request.priority === 'instant') {
    return 'instant';
  }

  if (request.currency === 'EUR') {
    return 'sepa';
  }

  if (['USD', 'GBP', 'CHF'].includes(request.currency)) {
    return 'swift';
  }

  return 'batch';
}

/**
 * Estimate bank fee for a given bank profile
 */
function estimateFeeForBank(bank_profile_id: string, request: RoutingRequest): number {
  // In production, query bank_profiles fee schedule
  // For now, return mock fees

  const method = determineRoutingMethod(request);

  if (method === 'instant') {
    return request.currency === 'USD' ? 5.0 : request.currency === 'EUR' ? 4.5 : 2000;
  }

  if (method === 'sepa') {
    return 0.5;
  }

  if (method === 'swift') {
    return 25.0;
  }

  return request.currency === 'USD' ? 1.0 : request.currency === 'EUR' ? 0.9 : 500;
}

/**
 * Estimate settlement time in minutes
 */
function estimateSettlementTime(request: RoutingRequest): number {
  const method = determineRoutingMethod(request);

  const times: Record<string, number> = {
    instant: 30, // 30 minutes
    sepa: 1440, // 1 day
    swift: 2880, // 2 days
    batch: 1440, // 1 day
  };

  return times[method] || 1440;
}

/**
 * Mock fraud score calculation (replace with SIRA)
 */
function calculateMockFraudScore(request: RoutingRequest): number {
  // Simple heuristics for demo
  let score = 0;

  // High amounts slightly increase score
  if (request.amount > 100000) {
    score += 0.2;
  }

  // Instant payouts have slight risk increase
  if (request.priority === 'instant') {
    score += 0.1;
  }

  // Random variation
  score += Math.random() * 0.3;

  return Math.min(score, 1.0);
}

/**
 * Mock routing suggestions from SIRA
 */
async function getMockRoutingSuggestions(request: RoutingRequest): Promise<any[]> {
  // In production, SIRA returns optimized routing suggestions
  // For now, return empty (will use fallback logic)
  return [];
}

/**
 * Get batching recommendations from SIRA
 */
export async function getBatchingRecommendations(currency: string): Promise<{
  recommended_batch_size: number;
  recommended_cutoff_time: string; // HH:MM format
  estimated_fee_savings_pct: number;
}> {
  // In production, call SIRA API
  // For now, return defaults

  const defaults: Record<string, any> = {
    USD: { recommended_batch_size: 100, recommended_cutoff_time: '14:00', estimated_fee_savings_pct: 15 },
    EUR: { recommended_batch_size: 100, recommended_cutoff_time: '12:00', estimated_fee_savings_pct: 12 },
    GBP: { recommended_batch_size: 50, recommended_cutoff_time: '15:00', estimated_fee_savings_pct: 10 },
    XOF: { recommended_batch_size: 200, recommended_cutoff_time: '16:00', estimated_fee_savings_pct: 20 },
  };

  return defaults[currency] || defaults['USD'];
}

/**
 * Notify SIRA of payout outcome for learning
 */
export async function notifySIRAOutcome(payout_id: string, outcome: {
  success: boolean;
  settlement_time_minutes?: number;
  actual_fee?: number;
  fraud_detected?: boolean;
}): Promise<void> {
  // In production, send outcome to SIRA for ML training
  console.log(`SIRA notification for payout ${payout_id}:`, outcome);

  // TODO: Implement actual SIRA API call
  // await fetch(`${SIRA_API_URL}/api/payout-outcome`, {
  //   method: 'POST',
  //   body: JSON.stringify({ payout_id, ...outcome })
  // });
}

/**
 * Check if payout requires approval based on SIRA risk score
 */
export async function requiresApproval(request: RoutingRequest): Promise<{
  requires_approval: boolean;
  approval_count: number;
  reason?: string;
}> {
  const siraEval = await evaluatePayoutWithSIRA(request);

  // High fraud score requires approval
  if (siraEval.fraud_score > 0.7) {
    return {
      requires_approval: true,
      approval_count: 2,
      reason: 'high_fraud_score',
    };
  }

  // High amount requires approval
  const thresholds: Record<string, number> = {
    USD: 50000,
    EUR: 45000,
    GBP: 40000,
    XOF: 25000000,
  };

  const threshold = thresholds[request.currency] || 50000;

  if (request.amount > threshold) {
    return {
      requires_approval: true,
      approval_count: 2,
      reason: 'high_amount',
    };
  }

  return {
    requires_approval: false,
    approval_count: 0,
  };
}
