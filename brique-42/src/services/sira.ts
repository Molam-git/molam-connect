/**
 * Brique 42 - Connect Payments
 * SIRA (Scoring & Risk Assessment) integration
 */

export interface SiraInput {
  amount: number;
  method: string;
  country: string;
  mcc?: string;
  customer_ref?: string;
}

export interface SiraScore {
  score: number; // 0..1 (higher = more risky)
  label: "low" | "normal" | "elevated" | "high" | "blocked";
  factors: string[];
}

/**
 * Score a transaction with SIRA
 * In production, this would call an external SIRA microservice
 */
export async function scoreWithSira(input: SiraInput): Promise<SiraScore> {
  // Simple stub implementation
  // In production: await fetch('http://sira-service/score', { method: 'POST', body: JSON.stringify(input) })

  const factors: string[] = [];
  let score = 0.0;

  // Amount-based risk
  if (input.amount > 10000) {
    score += 0.4;
    factors.push("high_amount");
  } else if (input.amount > 1000) {
    score += 0.2;
    factors.push("medium_amount");
  } else {
    score += 0.1;
  }

  // Method-based risk
  if (input.method === "card") {
    score += 0.15;
    factors.push("card_payment");
  } else if (input.method === "wallet") {
    score += 0.05;
    factors.push("wallet_payment");
  } else if (input.method === "bank") {
    score += 0.1;
    factors.push("bank_transfer");
  }

  // Country-based risk (simplified)
  const highRiskCountries = ["NG", "GH", "CM"];
  if (highRiskCountries.includes(input.country)) {
    score += 0.2;
    factors.push("high_risk_country");
  }

  // MCC-based risk
  if (input.mcc) {
    const highRiskMCCs = ["5967", "6211", "7995"]; // Gambling, securities, betting
    if (highRiskMCCs.includes(input.mcc)) {
      score += 0.3;
      factors.push("high_risk_mcc");
    }
  }

  // Cap at 0.99
  score = Math.min(0.99, score);

  // Determine label
  let label: SiraScore["label"];
  if (score >= 0.8) {
    label = "high";
  } else if (score >= 0.6) {
    label = "elevated";
  } else if (score >= 0.3) {
    label = "normal";
  } else {
    label = "low";
  }

  console.log(`[SIRA] Score: ${score.toFixed(2)} (${label})`, {
    amount: input.amount,
    method: input.method,
    factors,
  });

  return {
    score,
    label,
    factors,
  };
}

/**
 * Calculate additional hold days based on risk
 */
export function calculateRiskHoldDays(riskLabel: string): number {
  switch (riskLabel) {
    case "high":
      return 7; // +7 days
    case "elevated":
      return 3; // +3 days
    default:
      return 0; // No additional hold
  }
}

/**
 * Check if transaction should be blocked
 */
export function shouldBlockTransaction(score: number): boolean {
  return score >= 0.95;
}
