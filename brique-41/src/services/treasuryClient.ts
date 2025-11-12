/**
 * Brique 41 - Molam Connect
 * Treasury client - interfaces with Treasury service (B34-35)
 */

import fetch from "node-fetch";

const TREASURY_BASE_URL = process.env.TREASURY_URL || "http://localhost:8034";

export interface PayoutRequest {
  connect_account_id: string;
  external_account_id: string;
  amount: number;
  currency: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface PayoutResponse {
  id: string;
  status: "pending" | "processing" | "sent" | "settled" | "failed";
  amount: number;
  currency: string;
  created_at: string;
  estimated_arrival?: string;
}

/**
 * Create a payout via Treasury service
 */
export async function createPayout(
  idempotencyKey: string,
  payload: PayoutRequest,
  token: string
): Promise<PayoutResponse> {
  try {
    const response = await fetch(`${TREASURY_BASE_URL}/api/treasury/payouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Treasury payout failed (${response.status}): ${error}`);
    }

    const data = (await response.json()) as PayoutResponse;
    console.log(`[Treasury] Payout created: ${data.id}`);

    return data;
  } catch (e: any) {
    console.error("[Treasury] Payout creation failed:", e.message);
    throw new Error(`treasury_error: ${e.message}`);
  }
}

/**
 * Get payout status
 */
export async function getPayoutStatus(payoutId: string, token: string): Promise<PayoutResponse> {
  try {
    const response = await fetch(`${TREASURY_BASE_URL}/api/treasury/payouts/${payoutId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get payout status: ${response.status}`);
    }

    return (await response.json()) as PayoutResponse;
  } catch (e: any) {
    console.error("[Treasury] Get payout status failed:", e.message);
    throw e;
  }
}

/**
 * Cancel a pending payout
 */
export async function cancelPayout(payoutId: string, token: string): Promise<void> {
  try {
    const response = await fetch(`${TREASURY_BASE_URL}/api/treasury/payouts/${payoutId}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to cancel payout: ${response.status}`);
    }

    console.log(`[Treasury] Payout cancelled: ${payoutId}`);
  } catch (e: any) {
    console.error("[Treasury] Cancel payout failed:", e.message);
    throw e;
  }
}

/**
 * Get account balance from Treasury
 */
export async function getBalance(walletId: string, token: string): Promise<any> {
  try {
    const response = await fetch(`${TREASURY_BASE_URL}/api/treasury/balance/${walletId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get balance: ${response.status}`);
    }

    return await response.json();
  } catch (e: any) {
    console.error("[Treasury] Get balance failed:", e.message);
    throw e;
  }
}

/**
 * Health check for Treasury service
 */
export async function checkTreasuryHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${TREASURY_BASE_URL}/healthz`, {
      method: "GET",
      timeout: 5000,
    } as any);

    return response.ok;
  } catch (e) {
    console.error("[Treasury] Health check failed:", e);
    return false;
  }
}
