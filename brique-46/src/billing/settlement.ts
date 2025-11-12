/**
 * Brique 46 - Settlement Logic
 * Automatic invoice collection via wallet/netting/bank
 */

import { pool } from "../utils/db.js";

const WALLET_API_URL = process.env.WALLET_API_URL || "http://localhost:8033";
const TREASURY_API_URL = process.env.TREASURY_API_URL || "http://localhost:8034";

interface SettlementResult {
  success: boolean;
  method: "wallet" | "netting" | "bank_transfer";
  message: string;
  amount?: number;
}

/**
 * Collect invoice payment using settlement cascade
 * Priority: wallet → netting → bank_transfer
 */
export async function collectInvoice(invoiceId: string): Promise<SettlementResult> {
  const { rows: [invoice] } = await pool.query(
    `SELECT * FROM invoices WHERE id = $1`,
    [invoiceId]
  );

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  if (invoice.status === "paid") {
    return { success: true, method: "wallet", message: "Invoice already paid" };
  }

  // 1. Try wallet balance
  if (process.env.WALLET_SETTLEMENT_ENABLED === "true") {
    try {
      const walletResult = await tryWalletPayment(invoice);
      if (walletResult.success) {
        await markInvoicePaid(invoiceId, "wallet", walletResult.reference);
        return { success: true, method: "wallet", message: "Paid from wallet balance", amount: invoice.total_amount };
      }
    } catch (err) {
      console.error("Wallet payment failed:", err);
    }
  }

  // 2. Try netting (deduct from next payout)
  if (process.env.NETTING_SETTLEMENT_ENABLED === "true") {
    try {
      const nettingResult = await scheduleNetting(invoice);
      if (nettingResult.success) {
        await pool.query(
          `UPDATE invoices SET status='paying', payment_method='netting', updated_at=now() WHERE id=$1`,
          [invoiceId]
        );
        return { success: true, method: "netting", message: "Scheduled for netting on next payout", amount: invoice.total_amount };
      }
    } catch (err) {
      console.error("Netting scheduling failed:", err);
    }
  }

  // 3. Fallback: bank transfer (manual)
  await pool.query(
    `UPDATE invoices SET payment_method='bank_transfer', updated_at=now() WHERE id=$1`,
    [invoiceId]
  );

  return {
    success: false,
    method: "bank_transfer",
    message: "Manual bank transfer required. Payment instructions sent to merchant."
  };
}

/**
 * Try to debit wallet balance
 */
async function tryWalletPayment(invoice: any): Promise<{ success: boolean; reference?: string }> {
  try {
    const resp = await fetch(`${WALLET_API_URL}/api/internal/wallet/debit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_id: invoice.merchant_id,
        amount: invoice.total_amount,
        currency: invoice.billing_currency,
        reason: "invoice_payment",
        reference: invoice.invoice_number,
      }),
    });

    if (resp.ok) {
      const data: any = await resp.json();
      return { success: true, reference: data.transaction_id };
    }

    return { success: false };
  } catch (err) {
    console.error("Wallet API error:", err);
    return { success: false };
  }
}

/**
 * Schedule netting deduction
 */
async function scheduleNetting(invoice: any): Promise<{ success: boolean }> {
  try {
    const resp = await fetch(`${TREASURY_API_URL}/api/internal/netting/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_id: invoice.merchant_id,
        amount: invoice.total_amount,
        currency: invoice.billing_currency,
        type: "invoice_deduction",
        reference: invoice.invoice_number,
      }),
    });

    return { success: resp.ok };
  } catch (err) {
    console.error("Treasury API error:", err);
    return { success: false };
  }
}

/**
 * Mark invoice as paid
 */
async function markInvoicePaid(invoiceId: string, paymentMethod: string, reference?: string): Promise<void> {
  await pool.query("BEGIN");

  try {
    const { rows: [invoice] } = await pool.query(
      `UPDATE invoices SET status='paid', payment_method=$1, paid_at=now(), updated_at=now() WHERE id=$2 RETURNING *`,
      [paymentMethod, invoiceId]
    );

    await pool.query(
      `INSERT INTO invoice_payments(invoice_id, amount, currency, payment_method, reference)
       VALUES ($1, $2, $3, $4, $5)`,
      [invoiceId, invoice.total_amount, invoice.billing_currency, paymentMethod, reference]
    );

    await pool.query("COMMIT");

    // TODO: Emit webhook
    // await publishEvent("merchant", invoice.merchant_id, "invoice.payment_succeeded", invoice);
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
}
