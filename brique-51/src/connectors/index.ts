/**
 * Brique 51 - Refunds & Reversals
 * Connector Interface & Registry
 */

export interface ConnectorResponse {
  status: "submitted" | "settled" | "reversed" | "failed" | "not_supported";
  ref?: string;
  raw?: any;
}

export interface Connector {
  name: string;
  supportsReversal?: boolean;
  refund: (params: {
    paymentId: string;
    amount: number;
    currency: string;
    refundMethod?: string;
  }) => Promise<ConnectorResponse>;
  reverse?: (params: { paymentId: string; amount: number; currency: string }) => Promise<ConnectorResponse>;
}

import { cardConnector } from "./cardConnector.js";
import { walletConnector } from "./walletConnector.js";
import { bankConnector } from "./bankConnector.js";

/**
 * Connector registry - pick appropriate connector based on origin and method
 */
export const connectors = {
  pick: (originModule: string, refundMethod?: string): Connector => {
    if (originModule === "connect" || refundMethod === "to_card") {
      return cardConnector;
    }

    if (originModule === "wallet" || refundMethod === "to_wallet" || refundMethod === "to_agent") {
      return walletConnector;
    }

    if (refundMethod === "to_bank") {
      return bankConnector;
    }

    // Default to wallet for unknown
    return walletConnector;
  },
};
