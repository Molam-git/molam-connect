import { Worker, Job } from "bullmq";
import { pool } from "../db";
import { createAuditEvent } from "../services/audit";
import { finalizeLedgerEntry } from "../services/ledger";

const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379')
};

const worker = new Worker("reconciliation", async (job: Job) => {
    const { statementLine } = job.data;

    // Logique de réconciliation
    // 1. Essayez de faire correspondre par reference_code ou provider_ref
    // 2. Si correspondance trouvée, marquer comme settled
    // 3. Si non, créer un ticket pour investigation

    const { rows } = await pool.query(
        `SELECT * FROM payouts 
     WHERE reference_code = $1 OR provider_ref = $2 
     AND status = 'sent'`,
        [statementLine.reference, statementLine.provider_ref]
    );

    if (rows.length > 0) {
        const payout = rows[0];

        // Mettre à jour le statut
        await pool.query(
            "UPDATE payouts SET status = 'settled', updated_at = now() WHERE id = $1",
            [payout.id]
        );

        // Finaliser l'entrée ledger
        await finalizeLedgerEntry(payout.id, new Date(statementLine.settled_at));

        // Créer un événement d'audit
        await createAuditEvent(payout.id, 'settled', {
            statement_line: statementLine.id,
            settled_at: statementLine.settled_at
        });

        return { matched: true, payout_id: payout.id };
    } else {
        // Aucune correspondance : log pour investigation
        console.log(`No match found for statement line: ${statementLine.reference}`);
        // TODO: Créer un ticket d'incident
        return { matched: false };
    }
}, { connection });

worker.on('completed', (job) => {
    console.log(`✅ Reconciliation processed: ${job.id}`);
});

worker.on('failed', (job, error) => {
    console.error(`❌ Reconciliation failed: ${job?.id}`, error);
});

export default worker;