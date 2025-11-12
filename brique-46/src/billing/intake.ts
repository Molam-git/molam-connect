// ============================================================================
// Brique 46 - Billing & Invoicing
// Charge Intake (API for modules to publish fees)
// ============================================================================

import { pool } from "../utils/db";

export interface ChargeInput {
  source_module: string;      // 'connect','wallet','shop','eats'
  merchant_id: string;
  event_type: string;          // 'payment_fee','instant_payout_fee','fx_fee','dispute_fee','subscription'
  source_id: string;           // payment_id/refund_id/dispute_id
  amount: number;              // in source_currency
  source_currency: string;     // 'XOF','USD','EUR'
  occurred_at: Date;
  metadata?: any;
}

/**
 * Record a charge (idempotent by source_module + source_id + event_type)
 */
export async function recordCharge(input: ChargeInput): Promise<void> {
  await pool.query(
    `INSERT INTO billing_charges(source_module, merchant_id, event_type, source_id, amount, source_currency, occurred_at, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (source_module, source_id, event_type) DO NOTHING`,
    [
      input.source_module,
      input.merchant_id,
      input.event_type,
      input.source_id,
      input.amount,
      input.source_currency,
      input.occurred_at,
      input.metadata || {},
    ]
  );
}
