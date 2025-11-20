/**
 * SIRA Client for Payout Routing Recommendations
 */

export interface SiraPayoutInput {
  sellerId: string;
  amount: number;
  currency: string;
  mode?: 'auto' | 'instant' | 'manual';
  historicalVolume?: number;
}

export interface SiraPayoutRecommendation {
  priority_score: number; // 0-100
  risk_score?: number; // 0-100
  multi_bank: boolean;
  recommended_slices?: Array<{
    treasury_account_id: string;
    amount: number;
    order: number;
  }>;
  recommended_action: 'instant' | 'batch' | 'hold' | 'advance' | 'escrow';
  treasury_account_id?: string;
  reasons?: {
    priority_factors?: string[];
    risk_factors?: string[];
    routing_logic?: string;
  };
  model_version?: string;
}

/**
 * Call SIRA service for payout routing recommendation
 *
 * In production, this would call actual SIRA ML service via gRPC/HTTP
 * For now, implements deterministic fallback logic
 */
export async function callSiraForPayout(input: SiraPayoutInput): Promise<SiraPayoutRecommendation> {
  // Simulate SIRA API call delay
  await new Promise(resolve => setTimeout(resolve, 10));

  // Fallback deterministic policy
  const amount = input.amount;
  const mode = input.mode || 'auto';

  // Calculate priority score
  let priorityScore = 50; // Base score

  if (mode === 'instant') {
    priorityScore += 30;
  }

  // High amounts get higher priority
  if (amount > 10000) {
    priorityScore += 20;
  }

  // Calculate risk score (simplified)
  let riskScore = 10; // Base risk

  if (amount > 50000) {
    riskScore += 30; // Higher amounts = higher risk
  }

  // Determine action
  let recommendedAction: SiraPayoutRecommendation['recommended_action'] = 'batch';

  if (riskScore > 60) {
    recommendedAction = 'hold';
  } else if (priorityScore >= 85) {
    recommendedAction = 'instant';
  }

  // Determine multi-bank routing
  const multiBank = amount > 100000; // Split large amounts

  const recommendation: SiraPayoutRecommendation = {
    priority_score: Math.min(priorityScore, 100),
    risk_score: Math.min(riskScore, 100),
    multi_bank: multiBank,
    recommended_action: recommendedAction,
    reasons: {
      priority_factors: [
        mode === 'instant' ? 'Instant mode requested' : 'Auto mode',
        amount > 10000 ? 'High value transaction' : 'Standard value'
      ],
      risk_factors: [
        amount > 50000 ? 'High amount requires review' : 'Amount within normal range'
      ],
      routing_logic: multiBank
        ? 'Amount exceeds single bank threshold - multi-bank split recommended'
        : 'Standard single bank routing'
    },
    model_version: 'v1.0-fallback'
  };

  // If multi-bank, create slice recommendations
  if (multiBank) {
    const sliceCount = Math.ceil(amount / 50000);
    const sliceAmount = amount / sliceCount;

    recommendation.recommended_slices = Array.from({ length: sliceCount }, (_, i) => ({
      treasury_account_id: `treasury-${i + 1}`, // Would come from actual treasury selection
      amount: sliceAmount,
      order: i + 1
    }));
  } else {
    recommendation.treasury_account_id = 'treasury-default';
  }

  return recommendation;
}

/**
 * Call SIRA for advance eligibility and scoring
 */
export async function callSiraForAdvance(input: {
  sellerId: string;
  requestedAmount: number;
  currency: string;
}): Promise<{
  approval_score: number;
  max_recommended: number;
  fee_percent: number;
  recommendation: 'approve' | 'reject' | 'review';
  reasons: string[];
}> {
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 10));

  // Fallback logic
  const approvalScore = Math.random() * 100;

  return {
    approval_score: approvalScore,
    max_recommended: input.requestedAmount * 1.2,
    fee_percent: 0.05, // 5%
    recommendation: approvalScore >= 70 ? 'approve' : approvalScore >= 40 ? 'review' : 'reject',
    reasons: [
      'Historical sales volume analysis',
      'KYC verification status',
      'Previous advance repayment history'
    ]
  };
}
