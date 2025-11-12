/**
 * Brique 44 - Anti-fraude
 * SIRA Integration Service
 *
 * Connects to SIRA AI scoring service for enriched fraud detection
 */

import fetch from "node-fetch";

export interface SiraContext {
  txnId: string;
  userId: string;
  merchantId?: string;
  amount: number;
  currency: string;
  country: string;
  ip: string;
  device?: {
    fingerprint?: string;
    type?: string;
    os?: string;
  };
  payment_method?: {
    type: string;
    brand?: string;
    last4?: string;
  };
}

export interface SiraResponse {
  score: number;                  // 0-100
  confidence: number;             // 0-1
  reasons: string[];
  recommended_action: "allow" | "review" | "block";
  signals: Array<{
    type: string;
    value: any;
    contribution: number;
  }>;
}

/**
 * Call SIRA AI scoring service
 */
export async function callSira(ctx: SiraContext): Promise<SiraResponse> {
  const siraUrl = process.env.SIRA_URL;
  const siraApiKey = process.env.SIRA_API_KEY;

  // If SIRA is disabled or not configured, return stub
  if (!siraUrl || process.env.MOCK_SIRA === "true") {
    return mockSiraScore(ctx);
  }

  try {
    const response = await fetch(`${siraUrl}/api/score`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": siraApiKey || "",
      },
      body: JSON.stringify({
        transaction: {
          id: ctx.txnId,
          amount: ctx.amount,
          currency: ctx.currency,
          country: ctx.country,
        },
        user: {
          id: ctx.userId,
          merchant_id: ctx.merchantId,
        },
        context: {
          ip: ctx.ip,
          device: ctx.device,
          payment_method: ctx.payment_method,
        },
      }),
      timeout: 2000, // 2s timeout for real-time
    } as any);

    if (!response.ok) {
      console.error("SIRA API error:", response.status);
      return mockSiraScore(ctx);
    }

    const data = (await response.json()) as SiraResponse;
    return data;
  } catch (error: any) {
    console.error("SIRA call failed:", error.message);
    return mockSiraScore(ctx);
  }
}

/**
 * Mock SIRA scoring (fallback when SIRA unavailable)
 */
function mockSiraScore(ctx: SiraContext): SiraResponse {
  let score = 50;
  const reasons: string[] = [];
  const signals: Array<{ type: string; value: any; contribution: number }> = [];

  // High amount
  if (ctx.amount > 5000) {
    score += 20;
    reasons.push("high_amount");
    signals.push({ type: "amount", value: ctx.amount, contribution: 20 });
  }

  // Foreign currency
  const domesticCurrencies = ["USD", "EUR", "XOF", "KES"];
  if (!domesticCurrencies.includes(ctx.currency)) {
    score += 10;
    reasons.push("foreign_currency");
    signals.push({ type: "currency", value: ctx.currency, contribution: 10 });
  }

  // Suspicious IP (example: private ranges, known proxies)
  if (isSuspiciousIP(ctx.ip)) {
    score += 25;
    reasons.push("suspicious_ip");
    signals.push({ type: "ip", value: ctx.ip, contribution: 25 });
  }

  // Device fingerprint missing
  if (!ctx.device?.fingerprint) {
    score += 5;
    reasons.push("missing_device_fingerprint");
    signals.push({ type: "device", value: "missing", contribution: 5 });
  }

  // Card payment from high-risk country
  const highRiskCountries = ["XX", "YY", "ZZ"]; // Placeholder
  if (ctx.payment_method?.type === "card" && highRiskCountries.includes(ctx.country)) {
    score += 15;
    reasons.push("high_risk_country_card");
    signals.push({ type: "geolocation", value: ctx.country, contribution: 15 });
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Determine action
  let recommended_action: "allow" | "review" | "block" = "allow";
  if (score >= 80) recommended_action = "block";
  else if (score >= 60) recommended_action = "review";

  const confidence = score >= 80 ? 0.95 : score >= 60 ? 0.85 : 0.75;

  return {
    score,
    confidence,
    reasons,
    recommended_action,
    signals,
  };
}

/**
 * Check if IP is suspicious
 */
function isSuspiciousIP(ip: string): boolean {
  // Simple heuristic: check if private IP or localhost
  if (ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.")) {
    return true;
  }

  // In production: check against threat intelligence databases
  // For now: stub
  return false;
}
