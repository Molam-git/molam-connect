/**
 * Brique 51bis - Merchant Refund Policies & Zones
 * SIRA Integration for Risk Scoring
 */

import dotenv from "dotenv";

dotenv.config();

const SIRA_URL = process.env.SIRA_URL || "http://localhost:8044";
const SIRA_KEY = process.env.SIRA_KEY || "test-key";
const SIRA_ENABLED = process.env.SIRA_ENABLED === "true";

/**
 * Get SIRA risk score for refund request
 * Returns normalized score [0..1]
 */
export async function pickSiraScore(customerId: string, paymentId?: string): Promise<number> {
  if (!SIRA_ENABLED) {
    // Return mock score for development
    return 0.15;
  }

  try {
    const url = `${SIRA_URL}/api/sira/score?customer=${customerId}${paymentId ? `&payment=${paymentId}` : ""}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${SIRA_KEY}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error(`[SIRA] Score fetch failed: ${response.statusText}`);
      return 0.5; // Default fallback
    }

    const data: any = await response.json();
    return data.score || 0.5;
  } catch (err) {
    console.error("[SIRA] Score fetch error:", err);
    return 0.5; // Default fallback
  }
}
