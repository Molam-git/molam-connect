/**
 * Brique 97 — SIRA Risk Service
 *
 * Integration with SIRA AI for fraud detection and risk scoring
 */

export interface SiraRiskCheck {
  merchant_id?: string;
  user_id?: string;
  action: string;
  amount?: number;
  currency?: string;
  payment_method_id?: string;
}

export interface SiraRiskResult {
  risk_score: number; // 0-1 (0 = safe, 1 = risky)
  block_client_token: boolean;
  block_charge: boolean;
  require_3ds: boolean;
  reasons: string[];
  confidence: number;
}

/**
 * Check risk with SIRA
 */
export async function checkSiraRisk(params: SiraRiskCheck): Promise<SiraRiskResult> {
  try {
    // TODO: Integrate with actual SIRA API
    // For now, return mock response

    // Simulate API call
    const response = await mockSiraApi(params);

    return response;
  } catch (error: any) {
    console.error('SIRA risk check failed:', error);

    // Fail open with moderate risk score
    return {
      risk_score: 0.3,
      block_client_token: false,
      block_charge: false,
      require_3ds: false,
      reasons: ['sira_unavailable'],
      confidence: 0,
    };
  }
}

/**
 * Mock SIRA API (for development/testing)
 */
async function mockSiraApi(params: SiraRiskCheck): Promise<SiraRiskResult> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Mock risk logic
  let riskScore = 0.1;
  const reasons: string[] = [];

  // High amount increases risk
  if (params.amount && params.amount > 1000000) {
    riskScore += 0.2;
    reasons.push('high_amount');
  }

  // Mock merchant risk
  if (params.merchant_id?.includes('risky')) {
    riskScore += 0.5;
    reasons.push('high_risk_merchant');
  }

  // Mock user risk
  if (params.user_id?.includes('suspicious')) {
    riskScore += 0.4;
    reasons.push('suspicious_user');
  }

  return {
    risk_score: Math.min(riskScore, 1),
    block_client_token: riskScore > 0.8,
    block_charge: riskScore > 0.9,
    require_3ds: riskScore > 0.5,
    reasons,
    confidence: 0.85,
  };
}

/**
 * Report payment result back to SIRA (for ML training)
 */
export async function reportToSira(params: {
  payment_method_id: string;
  charge_id: string;
  success: boolean;
  fraud_detected?: boolean;
  chargebackReceived?: boolean;
}): Promise<void> {
  try {
    // TODO: Send feedback to SIRA for ML model training
    console.log('SIRA feedback:', params);
  } catch (error) {
    console.error('Failed to send feedback to SIRA:', error);
    // Don't throw - feedback is best-effort
  }
}
