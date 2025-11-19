// ============================================================================
// SIRA Client - AI-based Routing Hints
// ============================================================================

/**
 * Get SIRA scoring hints for bank routing
 * In production: call SIRA microservice via gRPC/HTTP
 */
export async function getSiraScoresForBanks(
  bankIds: string[],
  context: { amount: number; currency: string; country: string }
): Promise<Record<string, SiraHint>> {
  // TODO: Call SIRA microservice
  // Example: POST /sira/routing/scores
  // Body: { bank_ids: [...], context: {...} }

  // Stub implementation
  const hints: Record<string, SiraHint> = {};

  for (const bankId of bankIds) {
    hints[bankId] = {
      sira_score: 0.5 + Math.random() * 0.4, // 0.5-0.9
      expected_fx: context.amount * 0.001, // 0.1% FX cost estimate
      expected_settlement_days: 1,
      fraud_risk: 0.01
    };
  }

  return hints;
}

interface SiraHint {
  sira_score: number; // 0-1, higher is better
  expected_fx: number; // Expected FX cost
  expected_settlement_days: number;
  fraud_risk: number; // 0-1, lower is better
}

/**
 * Send routing feedback to SIRA for learning
 */
export async function sendRoutingFeedback(params: {
  decision_id: string;
  bank_profile_id: string;
  success: boolean;
  actual_cost?: number;
  actual_settlement_days?: number;
  error?: string;
}) {
  // TODO: Send feedback to SIRA for ML training
  console.log("[SIRA Feedback]", params);
}
