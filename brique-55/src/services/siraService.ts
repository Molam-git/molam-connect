/**
 * SIRA Integration - Fraud/Risk Scoring for Disputes
 */
import fetch from "node-fetch";

const SIRA_URL = process.env.SIRA_URL || "http://localhost:8044";
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || "";

export interface SiraDisputeScore {
  score: number; // 0-1 probability
  risk_level: "low" | "medium" | "high";
  recommendation: "auto_accept" | "auto_refute" | "escalate";
  evidence_needed: string[];
  reasons: string[];
}

/**
 * Request SIRA scoring for a dispute
 */
export async function requestSiraScore(disputeContext: {
  payment_id: string;
  merchant_id: string;
  customer_id?: string;
  amount: number;
  currency: string;
  reason_code: string;
}): Promise<SiraDisputeScore> {
  try {
    const response = await fetch(`${SIRA_URL}/api/score/dispute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        ...disputeContext,
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5000), // 5s timeout
    });

    if (!response.ok) {
      console.warn("SIRA scoring failed, using default escalate");
      return {
        score: 0.5,
        risk_level: "medium",
        recommendation: "escalate",
        evidence_needed: ["receipt", "invoice", "conversation"],
        reasons: ["default_fallback"],
      };
    }

    const data = (await response.json()) as any;
    return {
      score: data.score || 0.5,
      risk_level: data.risk_level || "medium",
      recommendation: data.recommendation || "escalate",
      evidence_needed: data.evidence_needed || [],
      reasons: data.reasons || [],
    };
  } catch (err) {
    console.error("SIRA service error:", err);
    return {
      score: 0.5,
      risk_level: "medium",
      recommendation: "escalate",
      evidence_needed: ["receipt", "invoice"],
      reasons: ["error_fallback"],
    };
  }
}
