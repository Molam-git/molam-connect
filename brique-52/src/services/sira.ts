/**
 * SIRA integration - fraud/risk scoring
 */
import fetch from "node-fetch";

const SIRA_URL = process.env.SIRA_URL || "http://localhost:8044";
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || "";

export interface SiraScore {
  score: number; // 0-1 probability
  risk_level: "low" | "medium" | "high";
  reasons: string[];
}

export async function pickSiraScore(customerId: string, context: any = {}): Promise<SiraScore> {
  try {
    const response = await fetch(`${SIRA_URL}/api/score`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        customer_id: customerId,
        context,
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(3000), // 3s timeout
    });

    if (!response.ok) {
      console.warn("SIRA scoring failed, using default low score");
      return { score: 0.1, risk_level: "low", reasons: ["default"] };
    }

    const data = await response.json() as any;
    return {
      score: data.score || 0.1,
      risk_level: data.risk_level || "low",
      reasons: data.reasons || [],
    };
  } catch (err) {
    console.error("SIRA service error:", err);
    return { score: 0.1, risk_level: "low", reasons: ["error_fallback"] };
  }
}
