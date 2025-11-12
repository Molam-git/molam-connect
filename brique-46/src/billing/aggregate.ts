// ============================================================================
// Brique 46 - Billing & Invoicing
// Invoice Aggregation (Monthly/Weekly Worker)
// ============================================================================

import { startOfMonth, endOfMonth } from "date-fns";
import { pool } from "../utils/db";

export async function buildInvoicesForPeriod(period: "monthly" | "weekly", asOf = new Date()) {
  const { rows: merchants } = await pool.query(
    `SELECT id, billing_currency, billing_country, locale FROM merchants WHERE status='active'`
  );

  for (const m of merchants) {
    const periodStart = period === "monthly" ? startOfMonth(asOf) : new Date(asOf.getTime() - 7 * 24 * 3600 * 1000);
    const periodEnd = period === "monthly" ? endOfMonth(asOf) : asOf;

    const { rows: charges } = await pool.query(
      `SELECT * FROM billing_charges
       WHERE merchant_id=$1 AND status='unbilled' AND occurred_at >= $2 AND occurred_at <= $3
       ORDER BY occurred_at ASC`,
      [m.id, periodStart, periodEnd]
    );

    if (!charges.length) continue;

    const legalEntity = pickLegalEntity(m.billing_country);
    const invoiceNumber = await nextInvoiceNumber(legalEntity);

    const { rows: [inv] } = await pool.query(
      `INSERT INTO invoices(invoice_number, merchant_id, period_start, period_end, billing_currency, status, legal_entity, locale)
       VALUES ($1,$2,$3,$4,$5,'draft',$6,$7) RETURNING *`,
      [invoiceNumber, m.id, periodStart, periodEnd, m.billing_currency, legalEntity, m.locale || 'fr']
    );

    let subtotal = 0, taxTotal = 0;

    for (const c of charges) {
      const fx = await getFxRate(new Date(c.occurred_at), c.source_currency, m.billing_currency);
      const amountBilling = Math.round(Number(c.amount) * fx * 100) / 100;
      const rule = await pickTaxRule(m.billing_country, c.event_type, new Date(c.occurred_at));
      const tax = Math.round(amountBilling * Number(rule.rate_percent || 0) / 100 * 100) / 100;

      await pool.query(
        `INSERT INTO invoice_lines(invoice_id, charge_id, description, unit_amount, line_amount, tax_rate_percent, tax_amount, source_currency, source_amount, occurred_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [inv.id, c.id, describeCharge(c), amountBilling, amountBilling, rule.rate_percent || 0, tax, c.source_currency, c.amount, c.occurred_at]
      );

      subtotal += amountBilling;
      taxTotal += tax;
      await pool.query(`UPDATE billing_charges SET status='billed' WHERE id=$1`, [c.id]);
    }

    const total = Math.round((subtotal + taxTotal) * 100) / 100;
    await pool.query(`UPDATE invoices SET subtotal_amount=$2, tax_amount=$3, total_amount=$4 WHERE id=$1`, [inv.id, subtotal, taxTotal, total]);
  }
}

async function getFxRate(asOf: Date, from: string, to: string): Promise<number> {
  if (from === to) return 1;
  const { rows: [r] } = await pool.query(
    `SELECT rate FROM fx_rates WHERE as_of_date=$1 AND base_currency=$2 AND quote_currency=$3`,
    [asOf.toISOString().slice(0, 10), from, to]
  );
  return r ? Number(r.rate) : 1;
}

async function nextInvoiceNumber(legalEntity: string): Promise<string> {
  const { rows: [seq] } = await pool.query(
    `INSERT INTO invoice_sequences(legal_entity, sequence_type, current_number)
     VALUES ($1,'invoice',0)
     ON CONFLICT (legal_entity, sequence_type) DO UPDATE SET current_number=invoice_sequences.current_number+1
     RETURNING current_number`,
    [legalEntity]
  );
  return `${legalEntity}-${new Date().getFullYear()}-${String(seq.current_number).padStart(6, '0')}`;
}

async function pickTaxRule(country: string, eventType: string, when: Date) {
  const { rows } = await pool.query(
    `SELECT * FROM tax_rules
     WHERE country=$1 AND $2 = ANY(applies_to) AND effective_from <= $3 AND (effective_to IS NULL OR effective_to >= $3)
     ORDER BY effective_from DESC LIMIT 1`,
    [country, eventType, when.toISOString().slice(0, 10)]
  );
  return rows[0] || { rate_percent: 0 };
}

function describeCharge(c: any): string {
  const map: Record<string, string> = {
    payment_fee: 'Frais de traitement paiement',
    instant_payout_fee: 'Frais virement instantané',
    fx_fee: 'Frais de change',
    dispute_fee: 'Frais litige',
    subscription: 'Abonnement Molam',
  };
  return map[c.event_type] || `Frais ${c.event_type}`;
}

function pickLegalEntity(country: string): string {
  if (country === 'FR') return 'MOLAM-FR';
  if (country === 'SN') return 'MOLAM-SN';
  return 'MOLAM-GLOBAL';
}

/**
 * Finalize invoice and generate PDF
 */
export async function finalizeInvoice(invoiceId: string): Promise<void> {
  const { rows: [invoice] } = await pool.query(
    `SELECT i.*, m.name as merchant_name, m.email as merchant_email, m.address as merchant_address
     FROM invoices i
     JOIN merchants m ON i.merchant_id = m.id
     WHERE i.id = $1`,
    [invoiceId]
  );

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  if (invoice.status !== "draft") {
    throw new Error("Invoice already finalized");
  }

  // Get invoice lines
  const { rows: lines } = await pool.query(
    `SELECT * FROM invoice_lines WHERE invoice_id = $1 ORDER BY occurred_at`,
    [invoiceId]
  );

  // Generate PDF
  const { renderHTMLToPDF } = await import("../utils/pdf.js");
  const { putS3WORM } = await import("../utils/s3.js");

  const html = generateInvoiceHTML(invoice, lines);
  const pdfBuffer = await renderHTMLToPDF(html);

  // Store in S3/local storage
  const s3Key = `invoices/${invoice.legal_entity}/${new Date().getFullYear()}/${invoice.invoice_number}.pdf`;
  await putS3WORM(s3Key, pdfBuffer);

  // Update invoice
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (Number(process.env.DEFAULT_PAYMENT_TERMS) || 14));

  await pool.query(
    `UPDATE invoices SET status='finalized', pdf_s3_key=$1, finalized_at=now(), due_date=$2, updated_at=now() WHERE id=$3`,
    [s3Key, dueDate, invoiceId]
  );

  // TODO: Emit webhook
  // await publishEvent("merchant", invoice.merchant_id, "invoice.finalized", invoice);
}

function generateInvoiceHTML(invoice: any, lines: any[]): string {
  const locale = invoice.locale || "fr";
  const translations: any = {
    fr: { invoice: "Facture", date: "Date", due: "Échéance", description: "Description", amount: "Montant", subtotal: "Sous-total", tax: "TVA", total: "Total" },
    en: { invoice: "Invoice", date: "Date", due: "Due date", description: "Description", amount: "Amount", subtotal: "Subtotal", tax: "Tax", total: "Total" },
  };
  const t = translations[locale] || translations.fr;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #333; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #f4f4f4; }
    .total { font-weight: bold; font-size: 1.2em; }
  </style>
</head>
<body>
  <h1>${t.invoice} ${invoice.invoice_number}</h1>
  <p><strong>${t.date}:</strong> ${new Date(invoice.created_at).toLocaleDateString(locale)}</p>
  <p><strong>${t.due}:</strong> ${new Date(invoice.due_date).toLocaleDateString(locale)}</p>

  <table>
    <thead>
      <tr>
        <th>${t.description}</th>
        <th>${t.amount}</th>
      </tr>
    </thead>
    <tbody>
      ${lines.map(line => `
        <tr>
          <td>${line.description}</td>
          <td>${Number(line.line_amount).toFixed(2)} ${invoice.billing_currency}</td>
        </tr>
      `).join('')}
    </tbody>
    <tfoot>
      <tr>
        <td>${t.subtotal}</td>
        <td>${Number(invoice.subtotal_amount).toFixed(2)} ${invoice.billing_currency}</td>
      </tr>
      <tr>
        <td>${t.tax}</td>
        <td>${Number(invoice.tax_amount).toFixed(2)} ${invoice.billing_currency}</td>
      </tr>
      <tr class="total">
        <td>${t.total}</td>
        <td>${Number(invoice.total_amount).toFixed(2)} ${invoice.billing_currency}</td>
      </tr>
    </tfoot>
  </table>
</body>
</html>
  `.trim();
}
