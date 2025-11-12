/**
 * Brique 51 - Refunds & Reversals
 * Card Payment Gateway Connector
 */

import { Connector, ConnectorResponse } from "./index.js";
import dotenv from "dotenv";

dotenv.config();

const CARD_GATEWAY_URL = process.env.CARD_GATEWAY_URL || "http://localhost:8041";
const CARD_GATEWAY_KEY = process.env.CARD_GATEWAY_KEY || "test-key";

export const cardConnector: Connector = {
  name: "cardGateway",
  supportsReversal: true,

  /**
   * Execute card refund via payment gateway
   */
  async refund(params: {
    paymentId: string;
    amount: number;
    currency: string;
  }): Promise<ConnectorResponse> {
    try {
      console.log(`[Card] Refunding ${params.amount} ${params.currency} for payment ${params.paymentId}`);

      const response = await fetch(`${CARD_GATEWAY_URL}/api/payments/${params.paymentId}/refunds`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CARD_GATEWAY_KEY}`,
        },
        body: JSON.stringify({
          amount: params.amount,
          currency: params.currency,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`Card gateway refund failed: ${response.status} ${response.statusText}`);
      }

      const data: any = await response.json();

      return {
        status: data.status === "succeeded" ? "settled" : "submitted",
        ref: data.id || data.refund_id,
        raw: data,
      };
    } catch (err: any) {
      console.error("[Card] Refund error:", err);
      return {
        status: "failed",
        ref: `error-${Date.now()}`,
        raw: { error: err.message },
      };
    }
  },

  /**
   * Execute card reversal (void) before settlement
   */
  async reverse(params: { paymentId: string; amount: number; currency: string }): Promise<ConnectorResponse> {
    try {
      console.log(`[Card] Reversing payment ${params.paymentId}`);

      const response = await fetch(`${CARD_GATEWAY_URL}/api/payments/${params.paymentId}/reverse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CARD_GATEWAY_KEY}`,
        },
        body: JSON.stringify({
          amount: params.amount,
          currency: params.currency,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        // If reversal not supported or failed, return not_supported
        if (response.status === 400 || response.status === 404) {
          return {
            status: "not_supported",
            raw: { error: "Reversal window expired or not supported" },
          };
        }

        throw new Error(`Card gateway reversal failed: ${response.status} ${response.statusText}`);
      }

      const data: any = await response.json();

      return {
        status: "reversed",
        ref: data.id || data.reversal_id,
        raw: data,
      };
    } catch (err: any) {
      console.error("[Card] Reversal error:", err);
      return {
        status: "failed",
        ref: `error-${Date.now()}`,
        raw: { error: err.message },
      };
    }
  },
};
