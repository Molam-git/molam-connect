/**
 * Brique 46 - Ops Routes
 * Billing operations endpoints
 */

import { Router, Request, Response } from "express";
import { pool } from "../utils/db.js";
import { requireRole } from "../utils/authz.js";
import { finalizeInvoice } from "../billing/aggregate.js";
import { collectInvoice } from "../billing/settlement.js";

const router = Router();

/**
 * GET /api/ops/billing/invoices
 * List all invoices (ops view)
 */
router.get("/invoices", requireRole("billing_ops", "finance_ops"), async (req: Request, res: Response) => {
  try {
    const { status, merchant_id, limit = 100, offset = 0 } = req.query;

    let query = `SELECT i.*, m.name as merchant_name, m.email as merchant_email
                 FROM invoices i
                 LEFT JOIN merchants m ON i.merchant_id = m.id
                 WHERE 1=1`;
    const params: any[] = [];

    if (status) {
      query += ` AND i.status = $${params.length + 1}`;
      params.push(status);
    }

    if (merchant_id) {
      query += ` AND i.merchant_id = $${params.length + 1}`;
      params.push(merchant_id);
    }

    query += ` ORDER BY i.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    res.json({ data: rows });
  } catch (err: any) {
    console.error("Error fetching invoices:", err);
    res.status(500).json({ error: { message: "Failed to fetch invoices", type: "database_error" } });
  }
});

/**
 * POST /api/ops/billing/invoices/:id/finalize
 * Finalize an invoice (generate PDF)
 */
router.post("/invoices/:id/finalize", requireRole("billing_ops"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { rows: [invoice] } = await pool.query(
      `SELECT * FROM invoices WHERE id = $1`,
      [id]
    );

    if (!invoice) {
      return res.status(404).json({ error: { message: "Invoice not found", type: "not_found" } });
    }

    if (invoice.status !== "draft") {
      return res.status(400).json({ error: { message: "Invoice already finalized", type: "invalid_state" } });
    }

    await finalizeInvoice(id);

    res.json({ message: "Invoice finalized", invoice_id: id });
  } catch (err: any) {
    console.error("Error finalizing invoice:", err);
    res.status(500).json({ error: { message: err.message || "Failed to finalize invoice", type: "finalization_error" } });
  }
});

/**
 * POST /api/ops/billing/invoices/:id/collect
 * Trigger collection for an invoice
 */
router.post("/invoices/:id/collect", requireRole("billing_ops"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { rows: [invoice] } = await pool.query(
      `SELECT * FROM invoices WHERE id = $1`,
      [id]
    );

    if (!invoice) {
      return res.status(404).json({ error: { message: "Invoice not found", type: "not_found" } });
    }

    if (invoice.status === "paid") {
      return res.status(400).json({ error: { message: "Invoice already paid", type: "invalid_state" } });
    }

    const result = await collectInvoice(id);

    res.json(result);
  } catch (err: any) {
    console.error("Error collecting invoice:", err);
    res.status(500).json({ error: { message: err.message || "Failed to collect invoice", type: "collection_error" } });
  }
});

/**
 * POST /api/ops/billing/invoices/:id/mark-paid
 * Manually mark invoice as paid
 */
router.post("/invoices/:id/mark-paid", requireRole("billing_ops", "finance_ops"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { payment_method = "bank_transfer", payment_reference, amount, note } = req.body;

    const { rows: [invoice] } = await pool.query(
      `SELECT * FROM invoices WHERE id = $1`,
      [id]
    );

    if (!invoice) {
      return res.status(404).json({ error: { message: "Invoice not found", type: "not_found" } });
    }

    const paymentAmount = amount || invoice.total_amount;

    await pool.query("BEGIN");

    await pool.query(
      `UPDATE invoices SET status='paid', payment_method=$1, paid_at=now(), updated_at=now() WHERE id=$2`,
      [payment_method, id]
    );

    await pool.query(
      `INSERT INTO invoice_payments(invoice_id, amount, currency, payment_method, reference, note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, paymentAmount, invoice.billing_currency, payment_method, payment_reference, note]
    );

    await pool.query("COMMIT");

    res.json({ message: "Invoice marked as paid", invoice_id: id });
  } catch (err: any) {
    await pool.query("ROLLBACK");
    console.error("Error marking invoice as paid:", err);
    res.status(500).json({ error: { message: "Failed to mark invoice as paid", type: "database_error" } });
  }
});

/**
 * POST /api/ops/billing/credit-notes
 * Create a credit note
 */
router.post("/credit-notes", requireRole("billing_ops", "finance_ops"), async (req: Request, res: Response) => {
  try {
    const { merchant_id, invoice_id, amount, currency, reason, note } = req.body;

    if (!merchant_id || !amount || !currency || !reason) {
      return res.status(400).json({ error: { message: "Missing required fields", type: "validation_error" } });
    }

    const creditNoteNumber = await generateCreditNoteNumber();

    const { rows: [creditNote] } = await pool.query(
      `INSERT INTO credit_notes(merchant_id, invoice_id, credit_note_number, amount, currency, reason, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [merchant_id, invoice_id, creditNoteNumber, amount, currency, reason, note]
    );

    // TODO: Emit webhook
    // await publishEvent("merchant", merchant_id, "credit_note.issued", creditNote);

    res.status(201).json(creditNote);
  } catch (err: any) {
    console.error("Error creating credit note:", err);
    res.status(500).json({ error: { message: "Failed to create credit note", type: "database_error" } });
  }
});

/**
 * GET /api/ops/billing/stats
 * Billing statistics
 */
router.get("/stats", requireRole("billing_ops", "finance_ops"), async (req: Request, res: Response) => {
  try {
    const { rows: [invoiceStats] } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='draft') as draft_count,
        COUNT(*) FILTER (WHERE status='finalized') as finalized_count,
        COUNT(*) FILTER (WHERE status='paying') as paying_count,
        COUNT(*) FILTER (WHERE status='paid') as paid_count,
        SUM(total_amount) FILTER (WHERE status='finalized') as outstanding_amount,
        SUM(total_amount) FILTER (WHERE status='paid') as paid_amount
      FROM invoices
    `);

    const { rows: [chargeStats] } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='unbilled') as unbilled_count,
        COUNT(*) FILTER (WHERE status='billed') as billed_count,
        SUM(amount) FILTER (WHERE status='unbilled') as unbilled_amount
      FROM billing_charges
    `);

    res.json({
      invoices: invoiceStats,
      charges: chargeStats,
    });
  } catch (err: any) {
    console.error("Error fetching stats:", err);
    res.status(500).json({ error: { message: "Failed to fetch stats", type: "database_error" } });
  }
});

// Helper function
async function generateCreditNoteNumber(): Promise<string> {
  const legalEntity = process.env.DEFAULT_LEGAL_ENTITY || "molam-france";
  const year = new Date().getFullYear();

  const { rows: [seq] } = await pool.query(
    `INSERT INTO invoice_sequences(legal_entity, year, type, next_value)
     VALUES ($1, $2, 'credit_note', 2)
     ON CONFLICT (legal_entity, year, type)
     DO UPDATE SET next_value = invoice_sequences.next_value + 1
     RETURNING next_value - 1 as num`,
    [legalEntity, year]
  );

  const prefix = process.env.CREDIT_NOTE_SEQUENCE_PREFIX || "CN";
  return `${prefix}-${legalEntity.toUpperCase()}-${year}-${String(seq.num).padStart(6, "0")}`;
}

export default router;
