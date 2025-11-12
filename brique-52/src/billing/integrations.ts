/**
 * Billing integration - creates invoices via B46 Billing
 */
import fetch from "node-fetch";

const BILLING_URL = process.env.BILLING_URL || "http://localhost:8046";
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || "";

export interface InvoiceLine {
  description: string;
  amount: number;
  currency: string;
  quantity?: number;
  metadata?: any;
}

export interface BillingInvoice {
  id: string;
  merchant_id: string;
  customer_id: string;
  amount_due: number;
  currency: string;
  status: string;
  [key: string]: any;
}

export async function createInvoiceForSubscription(params: {
  subscriptionId: string;
  merchantId: string;
  customerId: string;
  lines: InvoiceLine[];
  currency: string;
  periodStart: Date;
  periodEnd: Date;
}): Promise<BillingInvoice> {
  const { subscriptionId, merchantId, customerId, lines, currency, periodStart, periodEnd } = params;

  try {
    const response = await fetch(`${BILLING_URL}/internal/create_invoice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        merchant_id: merchantId,
        customer_id: customerId,
        lines,
        currency,
        metadata: {
          subscription_id: subscriptionId,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          source: "subscription_billing",
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(`Billing API error: ${error.message || response.statusText}`);
    }

    return await response.json() as BillingInvoice;
  } catch (err) {
    console.error("Failed to create billing invoice:", err);
    throw err;
  }
}

export async function collectInvoice(invoiceId: string, paymentMethodId?: string): Promise<any> {
  try {
    const response = await fetch(`${BILLING_URL}/internal/invoices/${invoiceId}/collect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        payment_method_id: paymentMethodId,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(`Payment collection failed: ${error.message || response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    console.error("Failed to collect invoice:", err);
    throw err;
  }
}
