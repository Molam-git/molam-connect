// ============================================================================
// Payout Service - Create, manage, and track payouts
// ============================================================================

import { Pool } from "pg";
import { customAlphabet } from "nanoid";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const nanoid = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 10);

/**
 * Ledger service stub (integrates with double-entry ledger)
 */
const ledger = {
  async createHold(params: {
    owner: string;
    amount: number;
    currency: string;
    reason: string;
    ref: string;
  }): Promise<string> {
    // TODO: Integrate with Brique XX ledger
    return params.ref;
  },

  async releaseHold(params: {
    ref: string;
    final: boolean;
    details?: any;
  }): Promise<void> {
    // TODO: Release hold and create final ledger entries
    console.log(`[LEDGER] Releasing hold ${params.ref}`);
  },
};

/**
 * SIRA routing service stub
 */
const pickRouting = async (params: {
  amount: number;
  currency: string;
  origin_module: string;
  origin_entity_id?: string;
}) => {
  // TODO: Integrate with SIRA for intelligent routing
  // Returns recommended treasury_account_id, bank_profile_id, and estimated fees
  return {
    treasury_account_id: "00000000-0000-0000-0000-000000000001",
    bank_profile_id: "00000000-0000-0000-0000-000000000002",
    molam_fee: 0.5,
    bank_fee: 1.0,
  };
};

/**
 * Webhook publisher stub
 */
const publishEvent = async (
  targetType: string,
  targetId: string,
  eventType: string,
  payload: any
) => {
  // TODO: Integrate with webhook engine
  console.log(`[WEBHOOK] ${eventType}`, payload);
};

export interface CreatePayoutParams {
  idempotency: string;
  origin_module: string;
  origin_entity_id?: string;
  origin_owner_type?: string;
  amount: number;
  currency: string;
  payee_bank_account: any;
  scheduled_for?: Date | string;
  priority?: number;
  metadata?: any;
}

/**
 * Create a new payout (idempotent)
 */
export async function createPayout(
  params: CreatePayoutParams
): Promise<any> {
  const {
    idempotency,
    origin_module,
    origin_entity_id,
    origin_owner_type,
    amount,
    currency,
    payee_bank_account,
    scheduled_for,
    priority,
    metadata,
  } = params;

  // 1) Idempotency check
  const { rows: existing } = await pool.query(
    `SELECT * FROM payouts WHERE external_id = $1 LIMIT 1`,
    [idempotency]
  );

  if (existing.length > 0) {
    return existing[0];
  }

  // 2) Pick routing via SIRA
  const routing = await pickRouting({
    amount,
    currency,
    origin_module,
    origin_entity_id,
  });

  // 3) Create ledger hold
  const holdRef = `payout-hold-${nanoid()}`;
  const ledgerHoldRef = await ledger.createHold({
    owner: origin_entity_id || "system",
    amount,
    currency,
    reason: "payout_pending",
    ref: holdRef,
  });

  // 4) Generate reference code
  const refCode = `PAYOUT-${new Date().toISOString().slice(0, 10)}-${nanoid()}`;

  // 5) Calculate total deducted
  const totalDeducted =
    Number(amount) + (routing.molam_fee || 0) + (routing.bank_fee || 0);

  // 6) Insert payout record
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO payouts(
        external_id, origin_module, origin_entity_id, origin_owner_type,
        amount, currency, scheduled_for, priority,
        treasury_account_id, bank_profile_id, payee_bank_account,
        molam_fee, bank_fee, total_deducted, reference_code, metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [
        idempotency,
        origin_module,
        origin_entity_id || null,
        origin_owner_type || null,
        amount,
        currency,
        scheduled_for || new Date(),
        priority || 50,
        routing.treasury_account_id,
        routing.bank_profile_id,
        JSON.stringify(payee_bank_account),
        routing.molam_fee || 0,
        routing.bank_fee || 0,
        totalDeducted,
        refCode,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );

    const payout = rows[0];

    // 7) Store hold link
    await client.query(
      `INSERT INTO payout_holds(payout_id, ledger_hold_ref, amount, currency)
       VALUES ($1,$2,$3,$4)`,
      [payout.id, ledgerHoldRef, amount, currency]
    );

    await client.query("COMMIT");

    // 8) Publish event
    await publishEvent("treasury", payout.id, "payout.created", {
      payout_id: payout.id,
      reference_code: refCode,
      amount,
      currency,
    });

    return payout;
  } catch (e: any) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Cancel a payout (only if not yet sent)
 */
export async function cancelPayout(payoutId: string, reason?: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: [payout] } = await client.query(
      `SELECT * FROM payouts WHERE id = $1 FOR UPDATE`,
      [payoutId]
    );

    if (!payout) {
      throw new Error("payout_not_found");
    }

    if (!["pending", "reserved"].includes(payout.status)) {
      throw new Error("cannot_cancel_payout_in_status_" + payout.status);
    }

    // Update status
    await client.query(
      `UPDATE payouts SET status = 'cancelled', updated_at = now() WHERE id = $1`,
      [payoutId]
    );

    // Release ledger hold
    const { rows: holds } = await client.query(
      `SELECT * FROM payout_holds WHERE payout_id = $1`,
      [payoutId]
    );

    for (const hold of holds) {
      await ledger.releaseHold({
        ref: hold.ledger_hold_ref,
        final: false,
        details: { reason: reason || "payout_cancelled" },
      });

      await client.query(
        `UPDATE payout_holds SET status = 'released', released_at = now() WHERE id = $1`,
        [hold.id]
      );
    }

    await client.query("COMMIT");

    await publishEvent("treasury", payoutId, "payout.cancelled", {
      payout_id: payoutId,
      reason,
    });

    return { cancelled: true };
  } catch (e: any) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Get payout details
 */
export async function getPayout(payoutId: string) {
  const { rows } = await pool.query(
    `SELECT p.*,
            json_agg(pa.*) FILTER (WHERE pa.id IS NOT NULL) as attempts
     FROM payouts p
     LEFT JOIN payout_attempts pa ON pa.payout_id = p.id
     WHERE p.id = $1
     GROUP BY p.id`,
    [payoutId]
  );

  if (rows.length === 0) {
    throw new Error("payout_not_found");
  }

  return rows[0];
}

/**
 * List payouts with filters
 */
export async function listPayouts(filters: {
  status?: string;
  origin_module?: string;
  currency?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}) {
  let query = `SELECT * FROM payouts WHERE 1=1`;
  const params: any[] = [];

  if (filters.status) {
    params.push(filters.status);
    query += ` AND status = $${params.length}`;
  }
  if (filters.origin_module) {
    params.push(filters.origin_module);
    query += ` AND origin_module = $${params.length}`;
  }
  if (filters.currency) {
    params.push(filters.currency);
    query += ` AND currency = $${params.length}`;
  }
  if (filters.from) {
    params.push(filters.from);
    query += ` AND requested_at >= $${params.length}`;
  }
  if (filters.to) {
    params.push(filters.to);
    query += ` AND requested_at <= $${params.length}`;
  }

  query += ` ORDER BY requested_at DESC`;

  if (filters.limit) {
    params.push(filters.limit);
    query += ` LIMIT $${params.length}`;
  }
  if (filters.offset) {
    params.push(filters.offset);
    query += ` OFFSET $${params.length}`;
  }

  const { rows } = await pool.query(query, params);
  return rows;
}

/**
 * Reconcile payout with bank statement line
 */
export async function reconcilePayout(params: {
  payout_id: string;
  statement_line_id: string;
  matched_by: string;
  confidence_score?: number;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Mark payout as settled
    await client.query(
      `UPDATE payouts SET status = 'settled', updated_at = now() WHERE id = $1`,
      [params.payout_id]
    );

    // Create reconciliation record
    await client.query(
      `INSERT INTO payout_reconciliation(payout_id, statement_line_id, matched_by, confidence_score)
       VALUES ($1,$2,$3,$4)`,
      [
        params.payout_id,
        params.statement_line_id,
        params.matched_by,
        params.confidence_score || null,
      ]
    );

    // Release ledger holds and finalize
    const { rows: holds } = await client.query(
      `SELECT * FROM payout_holds WHERE payout_id = $1 AND status = 'active'`,
      [params.payout_id]
    );

    for (const hold of holds) {
      await ledger.releaseHold({
        ref: hold.ledger_hold_ref,
        final: true,
        details: { statement_line_id: params.statement_line_id },
      });

      await client.query(
        `UPDATE payout_holds SET status = 'released', released_at = now() WHERE id = $1`,
        [hold.id]
      );
    }

    await client.query("COMMIT");

    await publishEvent("treasury", params.payout_id, "payout.settled", {
      payout_id: params.payout_id,
      statement_line_id: params.statement_line_id,
    });

    return { settled: true };
  } catch (e: any) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
