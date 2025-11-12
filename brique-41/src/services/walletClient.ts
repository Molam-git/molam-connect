/**
 * Brique 41 - Molam Connect
 * Wallet client - interfaces with Wallet service (B33)
 */

import fetch from "node-fetch";

const WALLET_BASE_URL = process.env.WALLET_URL || "http://localhost:8033";

export interface WalletInfo {
  id: string;
  user_id: string;
  balance: number;
  currency: string;
  status: "active" | "frozen" | "closed";
  verification_status: "unverified" | "pending" | "verified" | "failed";
}

export interface WalletTransactionRequest {
  from_wallet_id: string;
  to_wallet_id: string;
  amount: number;
  currency: string;
  description?: string;
  metadata?: Record<string, any>;
}

/**
 * Get wallet information
 */
export async function getWallet(walletId: string, token: string): Promise<WalletInfo> {
  try {
    const response = await fetch(`${WALLET_BASE_URL}/api/wallet/${walletId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get wallet: ${response.status}`);
    }

    return (await response.json()) as WalletInfo;
  } catch (e: any) {
    console.error("[Wallet] Get wallet failed:", e.message);
    throw e;
  }
}

/**
 * Create internal wallet transfer
 * Used for merchant settlements
 */
export async function createTransfer(
  idempotencyKey: string,
  payload: WalletTransactionRequest,
  token: string
): Promise<any> {
  try {
    const response = await fetch(`${WALLET_BASE_URL}/api/wallet/transfers`, {
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
      throw new Error(`Wallet transfer failed (${response.status}): ${error}`);
    }

    const data = (await response.json()) as any;
    console.log(`[Wallet] Transfer created: ${data.id}`);

    return data;
  } catch (e: any) {
    console.error("[Wallet] Transfer creation failed:", e.message);
    throw new Error(`wallet_error: ${e.message}`);
  }
}

/**
 * Get wallet verification status
 */
export async function getVerificationStatus(walletId: string, token: string): Promise<string> {
  try {
    const response = await fetch(`${WALLET_BASE_URL}/api/wallet/${walletId}/verification`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get verification status: ${response.status}`);
    }

    const data: any = await response.json();
    return data.status;
  } catch (e: any) {
    console.error("[Wallet] Get verification status failed:", e.message);
    throw e;
  }
}

/**
 * Check if wallet exists and is active
 */
export async function isWalletActive(walletId: string, token: string): Promise<boolean> {
  try {
    const wallet = await getWallet(walletId, token);
    return wallet.status === "active";
  } catch (e) {
    console.error("[Wallet] Check wallet active failed:", e);
    return false;
  }
}

/**
 * Get wallet balance
 */
export async function getWalletBalance(
  walletId: string,
  token: string
): Promise<{ balance: number; currency: string }> {
  try {
    const wallet = await getWallet(walletId, token);
    return {
      balance: wallet.balance,
      currency: wallet.currency,
    };
  } catch (e: any) {
    console.error("[Wallet] Get balance failed:", e.message);
    throw e;
  }
}

/**
 * Health check for Wallet service
 */
export async function checkWalletHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${WALLET_BASE_URL}/healthz`, {
      method: "GET",
      timeout: 5000,
    } as any);

    return response.ok;
  } catch (e) {
    console.error("[Wallet] Health check failed:", e);
    return false;
  }
}
