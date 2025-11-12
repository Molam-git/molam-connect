/**
 * Brique 43 - Checkout Orchestration
 * Payment Method Orchestrator
 *
 * Intelligent routing based on SIRA hints, country, currency, amount
 * Fallback logic for failed attempts
 * Fee calculation per route
 */

export type Route = "wallet" | "card" | "bank";

export interface SiraHint {
  preferred_route: Route;
  risk_score: "low" | "med" | "high";
  three_ds: "required" | "recommended" | "off";
  factors?: Record<string, any>;
}

export interface FeeStructure {
  molam: number;
  provider: number;
}

export interface PaymentIntent {
  amount: number;
  currency: string;
  country: string;
  metadata?: Record<string, any>;
}

/**
 * Compute SIRA hint for intelligent routing
 * In production: call external SIRA service
 * Here: basic heuristic based on amount, currency, country
 */
export async function computeSiraHint(intent: PaymentIntent): Promise<SiraHint> {
  const { amount, currency, country } = intent;

  // Risk scoring (simplified)
  let risk: "low" | "med" | "high" = "low";
  if (amount > 5000) risk = "high";
  else if (amount > 500) risk = "med";

  // Preferred route based on currency/country
  let preferred: Route = "card";

  // West African countries prefer wallet (XOF)
  const westAfricaCFA = ["SN", "ML", "BF", "CI", "NE", "TG", "BJ", "GW"];
  // East African countries prefer wallet (KES, TZS, UGX)
  const eastAfrica = ["KE", "TZ", "UG"];

  if (westAfricaCFA.includes(country) || currency === "XOF") {
    preferred = "wallet";
  } else if (eastAfrica.includes(country) || ["KES", "TZS", "UGX"].includes(currency)) {
    preferred = "wallet";
  } else if (currency === "EUR" && ["FR", "DE", "IT", "ES"].includes(country)) {
    preferred = "bank"; // SEPA is competitive in Europe
  }

  // 3DS requirements
  let three_ds: "required" | "recommended" | "off" = "recommended";
  if (risk === "high" || (preferred === "card" && amount > 1000)) {
    three_ds = "required";
  } else if (preferred === "wallet") {
    three_ds = "off"; // Wallet has its own authentication
  }

  return {
    preferred_route: preferred,
    risk_score: risk,
    three_ds,
    factors: {
      amount_risk: risk,
      currency_match: currency,
      country_match: country,
    },
  };
}

/**
 * Get ordered list of routes to try (with fallbacks)
 */
export function nextRoutes(hint: SiraHint): Route[] {
  const { preferred_route } = hint;

  // Fallback order based on preferred route
  const routeOrder: Record<Route, Route[]> = {
    wallet: ["wallet", "card", "bank"],
    card: ["card", "wallet", "bank"],
    bank: ["bank", "card", "wallet"],
  };

  return routeOrder[preferred_route] || ["card", "wallet", "bank"];
}

/**
 * Calculate fees for a given route
 * Returns { molam: X, provider: Y }
 */
export function feeFor(route: Route, amount: number, currency: string): FeeStructure {
  // Fee structures (can be loaded from config/database)

  if (route === "wallet") {
    // Wallet: 0.9% Molam fee, no provider fee
    return {
      molam: +(amount * 0.009).toFixed(2),
      provider: 0,
    };
  }

  if (route === "card") {
    // Card: 2.25% + 0.23 fixed (Stripe-like)
    return {
      molam: +(amount * 0.0225 + 0.23).toFixed(2),
      provider: 0,
    };
  }

  if (route === "bank") {
    // Bank transfer: 0.5% + 0.30 fixed
    return {
      molam: +(amount * 0.005).toFixed(2),
      provider: 0.3,
    };
  }

  // Default fallback
  return { molam: 0, provider: 0 };
}

/**
 * Get provider name for route
 */
export function getProvider(route: Route): string {
  const providers: Record<Route, string> = {
    wallet: "molam",
    card: "acquirer_x",
    bank: "bank_net",
  };

  return providers[route];
}

/**
 * Check if challenge is required for route
 */
export function requiresChallenge(route: Route, hint: SiraHint, amount: number): {
  required: boolean;
  type: "3ds" | "otp" | "link" | null;
  channel: string | null;
} {
  if (route === "card") {
    const needs3ds = hint.three_ds === "required" || hint.three_ds === "recommended";
    if (needs3ds) {
      return {
        required: true,
        type: "3ds",
        channel: "redirect",
      };
    }
  }

  if (route === "bank") {
    // Bank transfers always require redirect/link
    return {
      required: true,
      type: "link",
      channel: "redirect",
    };
  }

  if (route === "wallet" && amount > 10000) {
    // High-value wallet transactions may require OTP
    return {
      required: true,
      type: "otp",
      channel: "sms",
    };
  }

  return {
    required: false,
    type: null,
    channel: null,
  };
}

/**
 * Get estimated processing time for route (in seconds)
 */
export function estimatedProcessingTime(route: Route): number {
  const times: Record<Route, number> = {
    wallet: 2, // Near-instant
    card: 5, // 3DS may take longer
    bank: 600, // 10 minutes (redirect + authorization)
  };

  return times[route];
}

/**
 * Check if route is available for currency/country
 */
export function isRouteAvailable(route: Route, currency: string, country: string): boolean {
  // Wallet: available in African countries
  if (route === "wallet") {
    const africanCountries = ["SN", "ML", "BF", "CI", "NE", "TG", "BJ", "GW", "KE", "TZ", "UG", "GH", "NG"];
    return africanCountries.includes(country) || ["XOF", "KES", "TZS", "GHS", "NGN"].includes(currency);
  }

  // Card: available everywhere
  if (route === "card") {
    return true;
  }

  // Bank: available in Europe (SEPA) and some other regions
  if (route === "bank") {
    const sepaCountries = ["FR", "DE", "IT", "ES", "NL", "BE", "PT", "AT", "IE", "FI"];
    return sepaCountries.includes(country) || currency === "EUR";
  }

  return false;
}
