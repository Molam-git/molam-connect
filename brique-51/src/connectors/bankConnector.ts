/**
 * Brique 51 - Refunds & Reversals
 * Bank Transfer Connector
 */

import { Connector, ConnectorResponse } from "./index.js";
import dotenv from "dotenv";

dotenv.config();

const BANK_API_URL = process.env.BANK_API_URL || "http://localhost:8034";

export const bankConnector: Connector = {
  name: "bankTransfer",
  supportsReversal: false,

  /**
   * Execute bank transfer refund
   */
  async refund(params: {
    paymentId: string;
    amount: number;
    currency: string;
  }): Promise<ConnectorResponse> {
    try {
      console.log(`[Bank] Refunding ${params.amount} ${params.currency} for payment ${params.paymentId}`);

      const response = await fetch(`${BANK_API_URL}/api/treasury/payouts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payment_id: params.paymentId,
          amount: params.amount,
          currency: params.currency,
          purpose: "refund",
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`Bank refund failed: ${response.status} ${response.statusText}`);
      }

      const data: any = await response.json();

      return {
        status: "submitted", // Bank transfers are async
        ref: data.payout_id,
        raw: data,
      };
    } catch (err: any) {
      console.error("[Bank] Refund error:", err);
      return {
        status: "failed",
        ref: `error-${Date.now()}`,
        raw: { error: err.message },
      };
    }
  },
};
