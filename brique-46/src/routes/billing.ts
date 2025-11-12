/**
 * Brique 46 - Billing Routes
 * Merchant-facing billing endpoints
 */

import { Router, Request, Response } from "express";
import { pool } from "../utils/db.js";
import { requireRole } from "../utils/authz.js";
import { generateSignedURL } from "../utils/s3.js";

const router = Router();

/**
 * GET /api/billing/merchants/:merchantId/charges
 * List unbilled charges for a merchant
 */
router.get("/merchants/:merchantId/charges", requireRole("merchant_admin", "billing_ops"), async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    const { status = "unbilled", limit = 100, offset = 0 } = req.query;

    // Verify access
    if (req.user && req.user.roles.includes("merchant_admin") && req.user.merchantId !== merchantId) {
      return res.status(403).json({ error: { message: "Access denied", type: "forbidden" } });
    }

    const { rows } = await pool.query(
      `SELECT id, source_module, event_type, source_id, amount, source_currency, occurred_at, status, created_at
       FROM billing_charges
       WHERE merchant_id = $1 AND status = $2
       ORDER BY occurred_at DESC
       LIMIT $3 OFFSET $4`,
      [merchantId, status, limit, offset]
    );

    const { rows: [{ count }] } = await pool.query(
      `SELECT COUNT(*) as count FROM billing_charges WHERE merchant_id=$1 AND status=$2`,
      [merchantId, status]
    );

    res.json({
      data: rows,
      pagination: { limit: Number(limit), offset: Number(offset), total: Number(count) },
    });
  } catch (err: any) {
    console.error("Error fetching charges:", err);
    res.status(500).json({ error: { message: "Failed to fetch charges", type: "database_error" } });
  }
});

/**
 * GET /api/billing/merchants/:merchantId/invoices
 * List invoices for a merchant
 */
router.get("/merchants/:merchantId/invoices", requireRole("merchant_admin", "billing_ops"), async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    const { status, limit = 50, offset = 0 } = req.query;

    // Verify access
    if (req.user && req.user.roles.includes("merchant_admin") && req.user.merchantId !== merchantId) {
      return res.status(403).json({ error: { message: "Access denied", type: "forbidden" } });
    }

    let query = `SELECT id, invoice_number, period_start, period_end, subtotal, tax_amount, total_amount, billing_currency, status, due_date, finalized_at, created_at
                 FROM invoices
                 WHERE merchant_id = $1`;
    const params: any[] = [merchantId];

    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    const { rows: [{ count }] } = await pool.query(
      `SELECT COUNT(*) as count FROM invoices WHERE merchant_id=$1${status ? " AND status=$2" : ""}`,
      status ? [merchantId, status] : [merchantId]
    );

    res.json({
      data: rows,
      pagination: { limit: Number(limit), offset: Number(offset), total: Number(count) },
    });
  } catch (err: any) {
    console.error("Error fetching invoices:", err);
    res.status(500).json({ error: { message: "Failed to fetch invoices", type: "database_error" } });
  }
});

/**
 * GET /api/billing/invoices/:id
 * Get invoice details with line items
 */
router.get("/invoices/:id", requireRole("merchant_admin", "billing_ops"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { rows: [invoice] } = await pool.query(
      `SELECT * FROM invoices WHERE id = $1`,
      [id]
    );

    if (!invoice) {
      return res.status(404).json({ error: { message: "Invoice not found", type: "not_found" } });
    }

    // Verify access
    if (req.user && req.user.roles.includes("merchant_admin") && req.user.merchantId !== invoice.merchant_id) {
      return res.status(403).json({ error: { message: "Access denied", type: "forbidden" } });
    }

    const { rows: lines } = await pool.query(
      `SELECT * FROM invoice_lines WHERE invoice_id = $1 ORDER BY created_at`,
      [id]
    );

    const { rows: payments } = await pool.query(
      `SELECT * FROM invoice_payments WHERE invoice_id = $1 ORDER BY created_at`,
      [id]
    );

    res.json({
      ...invoice,
      lines,
      payments,
    });
  } catch (err: any) {
    console.error("Error fetching invoice:", err);
    res.status(500).json({ error: { message: "Failed to fetch invoice", type: "database_error" } });
  }
});

/**
 * GET /api/billing/invoices/:id/pdf
 * Download invoice PDF (signed URL)
 */
router.get("/invoices/:id/pdf", requireRole("merchant_admin", "billing_ops"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { rows: [invoice] } = await pool.query(
      `SELECT merchant_id, pdf_s3_key, status FROM invoices WHERE id = $1`,
      [id]
    );

    if (!invoice) {
      return res.status(404).json({ error: { message: "Invoice not found", type: "not_found" } });
    }

    // Verify access
    if (req.user && req.user.roles.includes("merchant_admin") && req.user.merchantId !== invoice.merchant_id) {
      return res.status(403).json({ error: { message: "Access denied", type: "forbidden" } });
    }

    if (invoice.status === "draft") {
      return res.status(400).json({ error: { message: "Invoice not finalized", type: "invalid_state" } });
    }

    if (!invoice.pdf_s3_key) {
      return res.status(404).json({ error: { message: "PDF not available", type: "not_found" } });
    }

    const signedUrl = await generateSignedURL(invoice.pdf_s3_key, 300); // 5 minutes

    res.json({ url: signedUrl, expires_in: 300 });
  } catch (err: any) {
    console.error("Error generating PDF URL:", err);
    res.status(500).json({ error: { message: "Failed to generate PDF URL", type: "storage_error" } });
  }
});

/**
 * GET /api/billing/merchants/:merchantId/credit-notes
 * List credit notes for a merchant
 */
router.get("/merchants/:merchantId/credit-notes", requireRole("merchant_admin", "billing_ops"), async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Verify access
    if (req.user && req.user.roles.includes("merchant_admin") && req.user.merchantId !== merchantId) {
      return res.status(403).json({ error: { message: "Access denied", type: "forbidden" } });
    }

    const { rows } = await pool.query(
      `SELECT * FROM credit_notes WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [merchantId, limit, offset]
    );

    const { rows: [{ count }] } = await pool.query(
      `SELECT COUNT(*) as count FROM credit_notes WHERE merchant_id=$1`,
      [merchantId]
    );

    res.json({
      data: rows,
      pagination: { limit: Number(limit), offset: Number(offset), total: Number(count) },
    });
  } catch (err: any) {
    console.error("Error fetching credit notes:", err);
    res.status(500).json({ error: { message: "Failed to fetch credit notes", type: "database_error" } });
  }
});

export default router;
