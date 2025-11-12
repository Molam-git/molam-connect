/**
 * Brique 51 - Refunds & Reversals
 * Ledger Integration Service (Double-Entry Accounting)
 */

import dotenv from "dotenv";

dotenv.config();

const LEDGER_API_URL = process.env.LEDGER_API_URL || "http://localhost:8034";

/**
 * Create ledger hold for pending refund
 * Reserves funds in double-entry system
 */
export async function createLedgerHold(params: {
  paymentId: string;
  amount: number;
  currency: string;
  reason: string;
}): Promise<void> {
  try {
    console.log(`[Ledger] Creating hold: ${params.amount} ${params.currency} for ${params.paymentId}`);

    const response = await fetch(`${LEDGER_API_URL}/api/ledger/holds`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reference_id: params.paymentId,
        reference_type: "payment",
        amount: params.amount,
        currency: params.currency,
        reason: params.reason,
      }),
    });

    if (!response.ok) {
      console.error("Ledger hold creation failed:", response.statusText);
    }
  } catch (err) {
    console.error("Ledger hold error:", err);
  }
}

/**
 * Release ledger hold
 */
export async function releaseLedgerHold(params: { paymentId: string; reason: string }): Promise<void> {
  try {
    console.log(`[Ledger] Releasing hold for ${params.paymentId}`);

    const response = await fetch(`${LEDGER_API_URL}/api/ledger/holds/release`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reference_id: params.paymentId,
        reason: params.reason,
      }),
    });

    if (!response.ok) {
      console.error("Ledger hold release failed:", response.statusText);
    }
  } catch (err) {
    console.error("Ledger hold release error:", err);
  }
}

/**
 * Finalize refund in ledger (double-entry)
 * Creates final ledger entries for completed refund
 */
export async function finalizeLedgerRefund(refundId: string, providerResp: any): Promise<void> {
  try {
    console.log(`[Ledger] Finalizing refund ${refundId}`);

    const response = await fetch(`${LEDGER_API_URL}/api/ledger/refunds/finalize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refund_id: refundId,
        provider_ref: providerResp.ref,
        status: providerResp.status,
        raw: providerResp.raw,
      }),
    });

    if (!response.ok) {
      console.error("Ledger refund finalization failed:", response.statusText);
    }
  } catch (err) {
    console.error("Ledger refund finalization error:", err);
  }
}

/**
 * Reverse ledger entries for payment
 * Creates reverse entries to nullify original transaction
 */
export async function reverseLedgerEntries(paymentId: string, refundId: string): Promise<void> {
  try {
    console.log(`[Ledger] Reversing entries for payment ${paymentId}`);

    const response = await fetch(`${LEDGER_API_URL}/api/ledger/reverse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payment_id: paymentId,
        refund_id: refundId,
      }),
    });

    if (!response.ok) {
      console.error("Ledger reversal failed:", response.statusText);
    }
  } catch (err) {
    console.error("Ledger reversal error:", err);
  }
}
