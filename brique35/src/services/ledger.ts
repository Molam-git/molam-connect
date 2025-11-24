import { pool } from "../db";

interface LedgerHold {
    ref: string;
    amount: number;
    currency: string;
}

export async function createLedgerHold(
    entityId: string,
    amount: number,
    currency: string,
    reference: string
): Promise<LedgerHold> {
    // Integration with central ledger service
    // This is a simplified version - actual implementation would call ledger service API

    const ledgerRef = `HOLD-${reference}-${Date.now()}`;

    // In real implementation, we would call:
    // const response = await fetch(`${process.env.LEDGER_SERVICE_URL}/holds`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     entity_id: entityId,
    //     amount,
    //     currency,
    //     reference: ledgerRef,
    //     type: 'payout_hold'
    //   })
    // });

    console.log(`Created ledger hold: ${ledgerRef} for ${amount} ${currency}`);

    return {
        ref: ledgerRef,
        amount,
        currency
    };
}

export async function releaseLedgerHold(
    payoutId: string,
    reason: string
): Promise<void> {
    const { rows } = await pool.query(
        "SELECT * FROM ledger_holds WHERE payout_id = $1 AND released_at IS NULL",
        [payoutId]
    );

    for (const hold of rows) {
        // Call ledger service to release hold
        console.log(`Releasing ledger hold: ${hold.ledger_entry_ref} - ${reason}`);

        await pool.query(
            "UPDATE ledger_holds SET released_at = now() WHERE id = $1",
            [hold.id]
        );
    }
}

export async function finalizeLedgerEntry(
    payoutId: string,
    settledAt: Date
): Promise<void> {
    const { rows } = await pool.query(
        "SELECT * FROM ledger_holds WHERE payout_id = $1",
        [payoutId]
    );

    for (const hold of rows) {
        // Call ledger service to finalize the entry
        console.log(`Finalizing ledger entry: ${hold.ledger_entry_ref} at ${settledAt}`);

        // Mark as settled in our tracking
        await pool.query(
            "UPDATE ledger_holds SET released_at = $1 WHERE id = $2",
            [settledAt, hold.id]
        );
    }
}