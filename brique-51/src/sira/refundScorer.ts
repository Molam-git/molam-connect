/**
 * Brique 51 - Refunds & Reversals
 * SIRA Integration for Refund Fraud Scoring
 */

import dotenv from "dotenv";

dotenv.config();

const SIRA_API_URL = process.env.SIRA_API_URL || "http://localhost:8044";
const SIRA_ENABLED = process.env.SIRA_ENABLED === "true";

interface RefundScore {
  probability: number; // 0-1 risk score
  confidence: number;
  factors: string[];
  recommendation: string;
}

/**
 * Compute SIRA fraud score for refund request
 */
export async function computeSiraScoreForRefund(input: any): Promise<RefundScore> {
  if (!SIRA_ENABLED) {
    // Return mock score for development
    return {
      probability: 0.15,
      confidence: 0.85,
      factors: ["amount_normal", "merchant_good_standing"],
      recommendation: "Approve automatically",
    };
  }

  try {
    const response = await fetch(`${SIRA_API_URL}/api/sira/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "refund_fraud_detection",
        features: {
          amount: input.amount,
          currency: input.currency,
          initiator: input.initiator,
          origin_module: input.originModule,
          refund_type: input.type,
          payment_age_minutes: input.paymentAgeMinutes || 0,
        },
      }),
    });

    if (!response.ok) {
      console.error("SIRA scoring failed:", response.statusText);
      return getDefaultScore();
    }

    const data: any = await response.json();

    return {
      probability: data.score / 100, // Convert 0-100 to 0-1
      confidence: data.confidence || 0.5,
      factors: data.factors || [],
      recommendation: data.recommendation || "Review recommended",
    };
  } catch (err) {
    console.error("SIRA scoring error:", err);
    return getDefaultScore();
  }
}

function getDefaultScore(): RefundScore {
  return {
    probability: 0.3,
    confidence: 0.5,
    factors: ["unknown"],
    recommendation: "Manual review recommended",
  };
}
