/**
 * Brique 51 - Refunds & Reversals
 * Molam Wallet Connector
 */

import { Connector, ConnectorResponse } from "./index.js";
import dotenv from "dotenv";

dotenv.config();

const WALLET_API_URL = process.env.WALLET_API_URL || "http://localhost:8042";

export const walletConnector: Connector = {
  name: "molamWallet",
  supportsReversal: false, // Wallet doesn't support pre-settlement reversals

  /**
   * Execute wallet refund (credit customer wallet)
   */
  async refund(params: {
    paymentId: string;
    amount: number;
    currency: string;
    refundMethod?: string;
  }): Promise<ConnectorResponse> {
    try {
      console.log(`[Wallet] Refunding ${params.amount} ${params.currency} for payment ${params.paymentId}`);

      const response = await fetch(`${WALLET_API_URL}/api/internal/refund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payment_id: params.paymentId,
          amount: params.amount,
          currency: params.currency,
          method: params.refundMethod || "to_wallet",
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`Wallet refund failed: ${response.status} ${response.statusText}`);
      }

      const data: any = await response.json();

      return {
        status: data.status === "completed" ? "settled" : "submitted",
        ref: data.ref || data.transaction_id,
        raw: data,
      };
    } catch (err: any) {
      console.error("[Wallet] Refund error:", err);
      return {
        status: "failed",
        ref: `error-${Date.now()}`,
        raw: { error: err.message },
      };
    }
  },
};
