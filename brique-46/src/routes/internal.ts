/**
 * Brique 46 - Internal Routes
 * Service-to-service endpoints (no authentication)
 */

import { Router, Request, Response } from "express";
import { recordCharge } from "../billing/intake.js";

const router = Router();

/**
 * POST /api/internal/billing/charges
 * Record a charge from another module
 */
router.post("/charges", async (req: Request, res: Response) => {
  try {
    const { source_module, merchant_id, event_type, source_id, amount, source_currency, occurred_at, metadata } = req.body;

    if (!source_module || !merchant_id || !event_type || !amount || !source_currency) {
      return res.status(400).json({ error: { message: "Missing required fields", type: "validation_error" } });
    }

    await recordCharge({
      source_module,
      merchant_id,
      event_type,
      source_id,
      amount,
      source_currency,
      occurred_at: occurred_at ? new Date(occurred_at) : new Date(),
      metadata,
    });

    res.status(201).json({ message: "Charge recorded" });
  } catch (err: any) {
    console.error("Error recording charge:", err);
    res.status(500).json({ error: { message: "Failed to record charge", type: "database_error" } });
  }
});

/**
 * POST /api/internal/billing/credit-notes
 * Create credit note (called by Brique 47 for disputes)
 */
router.post("/credit-notes", async (req: Request, res: Response) => {
  try {
    const { merchant_id, amount, currency, reason, reference } = req.body;

    if (!merchant_id || !amount || !currency || !reason) {
      return res.status(400).json({ error: { message: "Missing required fields", type: "validation_error" } });
    }

    const creditNoteNumber = await generateCreditNoteNumber();

    const { rows: [creditNote] } = await pool.query(
      `INSERT INTO credit_notes(merchant_id, credit_note_number, amount, currency, reason, reference)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [merchant_id, creditNoteNumber, amount, currency, reason, reference]
    );

    res.status(201).json(creditNote);
  } catch (err: any) {
    console.error("Error creating credit note:", err);
    res.status(500).json({ error: { message: "Failed to create credit note", type: "database_error" } });
  }
});

// Helper
import { pool } from "../utils/db.js";

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
