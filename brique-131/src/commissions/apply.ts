// ============================================================================
// Fee Application - Idempotent, Ledger-integrated
// ============================================================================

import { Pool } from "pg";
import { calculateFees, TxContext } from "./calc";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Publish webhook event (stub - integrates with webhook engine)
 */
async function publishEvent(
  targetType: string,
  targetId: string,
  eventType: string,
  payload: any
) {
  // TODO: Integrate with Brique XX webhook engine
  console.log(`[WEBHOOK] ${eventType}`, payload);
}

/**
 * Create double-entry ledger entries (stub - integrates with ledger)
 */
async function createLedgerEntry(params: {
  ref: string;
  lines: Array<{ account: string; debit?: string; credit?: string }>;
  metadata?: any;
}): Promise<string> {
  // TODO: Integrate with Brique XX ledger engine
  // For now, returns mock UUID
  return "ledger-entry-" + Math.random().toString(36).substring(7);
}

export type ApplyFeesResult = {
  already_applied: boolean;
  lines: any[];
  total_fee: string;
  currency: string;
};

/**
 * Apply fees to a transaction (idempotent)
 * Creates fee_lines and ledger entries
 */
export async function applyFees(ctx: TxContext): Promise<ApplyFeesResult> {
  // 1) Check idempotency: if fee_lines exist for tx => return existing
  const { rows: existing } = await pool.query(
    `SELECT * FROM fee_lines WHERE transaction_id = $1`,
    [ctx.transaction_id]
  );

  if (existing.length > 0) {
    const totalFee = existing
      .reduce((sum, line) => sum + parseFloat(line.amount), 0)
      .toFixed(2);

    return {
      already_applied: true,
      lines: existing,
      total_fee: totalFee,
      currency: existing[0]?.currency || ctx.currency,
    };
  }

  // 2) Calculate fees
  const calc = await calculateFees(ctx);

  // 3) Insert fee_lines and create ledger entries (atomic transaction)
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const insertedLines: any[] = [];

    for (const b of calc.breakdown) {
      // Create ledger entry first
      const ledgerEntryId = await createLedgerEntry({
        ref: ctx.transaction_id,
        lines: [
          {
            account: `receivables:fees:${ctx.currency}`,
            debit: b.fee,
          },
          {
            account: `revenue:molam:${ctx.currency}`,
            credit: b.molam_share,
          },
          ...(ctx.agent_id && parseFloat(b.agent_share) > 0
            ? [
                {
                  account: `payable:agent:${ctx.agent_id}:${ctx.currency}`,
                  credit: b.agent_share,
                },
              ]
            : []),
        ],
        metadata: {
          type: "fee",
          rule_id: b.rule_id,
          transaction_id: ctx.transaction_id,
        },
      });

      // Insert fee_line
      const { rows } = await client.query(
        `INSERT INTO fee_lines(
          transaction_id, event_type, rule_id, currency, amount,
          percent_applied, fixed_applied, agent_id,
          split_agent_amount, split_molam_amount, ledger_entry_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          ctx.transaction_id,
          ctx.event_type,
          b.rule_id,
          ctx.currency,
          b.fee,
          b.percent,
          b.fixed,
          ctx.agent_id || null,
          b.agent_share,
          b.molam_share,
          ledgerEntryId,
        ]
      );

      insertedLines.push(rows[0]);
    }

    await client.query("COMMIT");

    // 4) Publish webhook event
    await publishEvent(
      "merchant",
      ctx.receiver_id || ctx.sender_id || "system",
      "fee.charged",
      {
        transaction_id: ctx.transaction_id,
        total_fee: calc.total_fee,
        currency: ctx.currency,
        breakdown: calc.breakdown,
      }
    );

    return {
      already_applied: false,
      lines: insertedLines,
      total_fee: calc.total_fee,
      currency: ctx.currency,
    };
  } catch (e: any) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Reverse fees (for chargebacks/disputes)
 * Creates negative fee_line and credit note
 */
export async function reverseFees(transactionId: string, reason: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Fetch original fee lines
    const { rows: originalLines } = await client.query(
      `SELECT * FROM fee_lines WHERE transaction_id = $1`,
      [transactionId]
    );

    if (originalLines.length === 0) {
      throw new Error("no_fees_to_reverse");
    }

    // Create reversal fee lines (negative amounts)
    for (const line of originalLines) {
      const ledgerEntryId = await createLedgerEntry({
        ref: `${transactionId}-reversal`,
        lines: [
          {
            account: `receivables:fees:${line.currency}`,
            credit: line.amount, // reverse debit
          },
          {
            account: `revenue:molam:${line.currency}`,
            debit: line.split_molam_amount, // reverse credit
          },
          ...(line.agent_id
            ? [
                {
                  account: `payable:agent:${line.agent_id}:${line.currency}`,
                  debit: line.split_agent_amount, // reverse credit
                },
              ]
            : []),
        ],
        metadata: {
          type: "fee_reversal",
          original_transaction_id: transactionId,
          reason,
        },
      });

      await client.query(
        `INSERT INTO fee_lines(
          transaction_id, event_type, rule_id, currency, amount,
          percent_applied, fixed_applied, agent_id,
          split_agent_amount, split_molam_amount, ledger_entry_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          `${transactionId}-reversal`,
          line.event_type,
          line.rule_id,
          line.currency,
          `-${line.amount}`, // negative
          line.percent_applied,
          line.fixed_applied,
          line.agent_id,
          `-${line.split_agent_amount}`,
          `-${line.split_molam_amount}`,
          ledgerEntryId,
        ]
      );
    }

    await client.query("COMMIT");

    // Publish reversal event
    await publishEvent("merchant", "system", "fee.reversed", {
      transaction_id: transactionId,
      reason,
    });

    return { reversed: true };
  } catch (e: any) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
