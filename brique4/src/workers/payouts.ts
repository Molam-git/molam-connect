// src/workers/payouts.ts
import { db } from "../util/db";

export async function enqueueBatchBuild(providerId: string, currency: string) {
    // push to queue system (BullMQ/RabbitMQ), omitted
    console.log(`Enqueuing batch build for provider ${providerId}, currency ${currency}`);
}

export async function buildOrUpdateOpenBatch(providerId: string, currency: string) {
    // find or create open batch for current schedule window
    const provider = await db.one(`SELECT * FROM molam_payout_providers WHERE id=$1`, [providerId]);
    const schedule: string = (provider.config as any).schedule || 'weekly';
    const now = new Date();

    // compute window_start/window_end based on schedule (simplified)
    const window_start = new Date(now); window_start.setHours(0, 0, 0, 0);
    const window_end = new Date(now); window_end.setDate(now.getDate() + (schedule === 'weekly' ? 7 : 30));

    const batch = await db.oneOrNone(
        `SELECT * FROM molam_bank_payout_batches
     WHERE provider_id=$1 AND currency=$2 AND status='open' LIMIT 1`,
        [providerId, currency]
    ) || await db.one(
        `INSERT INTO molam_bank_payout_batches (provider_id, currency, schedule, window_start, window_end)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [providerId, currency, schedule, window_start, window_end]
    );

    // attach queued withdrawals
    const items = await db.manyOrNone(
        `UPDATE molam_withdrawals
     SET scheduled_batch_id=$1, status='processing', updated_at=NOW()
     WHERE provider_id=$2 AND currency=$3 AND status='queued'
     RETURNING id, amount`,
        [batch.id, providerId, currency]
    );

    if (items.length > 0) {
        const total = items.reduce((s, i) => s + Number(i.amount), 0);
        await db.none(
            `UPDATE molam_bank_payout_batches
       SET total_count = total_count + $1, total_amount = total_amount + $2, updated_at=NOW()
       WHERE id=$3`,
            [items.length, total, batch.id]
        );
    }

    return batch;
}

export async function submitBatchToBank(batchId: string) {
    // call bank API with consolidated file/payment order (adapter layer)
    // on success → mark submitted, then bank webhook updates to settled/failed/partial
    await db.none(`UPDATE molam_bank_payout_batches SET status='submitted', updated_at=NOW() WHERE id=$1`, [batchId]);
}

export async function runDailyReconcile() {
    const rows = await db.manyOrNone(
        `SELECT * FROM v_withdrawal_settlement_summary WHERE day = CURRENT_DATE - INTERVAL '1 day'`
    );
    // compare vs provider/bank reports (adapter); record diffs for Ops
    console.log(`Daily reconciliation: ${rows.length} settlement rows to process`);
}

export async function enqueueReconcile() {
    // Enqueue reconciliation task
    console.log("Enqueuing daily reconciliation");
}