import { Worker, Job } from "bullmq";
import { pool } from "../db";
import { payoutProcessingDuration, payoutStatusCounter } from "../utils/metrics";

const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379')
};

const worker = new Worker("payouts", async (job: Job) => {
    const startTime = Date.now();
    const { payoutId } = job.data;
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Verrouiller la ligne du payout pour le traitement
        const { rows } = await client.query(
            "SELECT * FROM payouts WHERE id = $1 FOR UPDATE",
            [payoutId]
        );

        if (!rows.length) {
            throw new Error(`Payout not found: ${payoutId}`);
        }

        const payout = rows[0];

        // Vérifier si déjà traité
        if (['sent', 'settled', 'processing'].includes(payout.status)) {
            await client.query("COMMIT");
            return { status: 'already_processed', payoutId };
        }

        // Marquer comme en cours de traitement
        await client.query(
            "UPDATE payouts SET status = 'processing', attempts = attempts + 1, updated_at = now() WHERE id = $1",
            [payoutId]
        );

        // Créer un événement d'audit
        await client.query(
            `INSERT INTO payout_events (payout_id, event_type, payload) 
       VALUES ($1, $2, $3)`,
            [payoutId, 'processing_started', JSON.stringify({ attempt: payout.attempts + 1 })]
        );

        // SIMULATION: Envoi à la banque
        // Dans l'implémentation réelle, utiliser le connecteur bancaire approprié
        console.log(`Processing payout ${payoutId} for ${payout.amount} ${payout.currency}`);

        // Simuler un délai de traitement
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Simuler un succès (90% de taux de succès)
        const success = Math.random() < 0.9;

        if (success) {
            const providerRef = `BANK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            await client.query(
                "UPDATE payouts SET status = 'sent', provider_ref = $2, updated_at = now() WHERE id = $1",
                [payoutId, providerRef]
            );

            await client.query(
                `INSERT INTO payout_events (payout_id, event_type, payload) 
         VALUES ($1, $2, $3)`,
                [payoutId, 'sent_to_bank', JSON.stringify({ provider_ref: providerRef })]
            );

            await client.query("COMMIT");

            // Mettre à jour les métriques
            const duration = (Date.now() - startTime) / 1000;
            payoutProcessingDuration.observe({ status: 'sent' }, duration);
            payoutStatusCounter.inc({ status: 'sent', origin_module: payout.origin_module });

            return { status: 'sent', provider_ref: providerRef };

        } else {
            // Échec
            const attempts = payout.attempts + 1;
            const maxAttempts = parseInt(process.env.PAYOUT_MAX_ATTEMPTS || "3");

            await client.query(
                `UPDATE payouts SET status = 'failed', last_error = $2, 
         attempts = $3, updated_at = now() WHERE id = $1`,
                [payoutId, 'Simulated bank failure', attempts]
            );

            await client.query(
                `INSERT INTO payout_events (payout_id, event_type, payload) 
         VALUES ($1, $2, $3)`,
                [payoutId, 'bank_send_failed', JSON.stringify({
                    attempt: attempts,
                    error: 'Simulated bank failure'
                })]
            );

            await client.query("COMMIT");

            // Mettre à jour les métriques
            const duration = (Date.now() - startTime) / 1000;
            payoutProcessingDuration.observe({ status: 'failed' }, duration);
            payoutStatusCounter.inc({ status: 'failed', origin_module: payout.origin_module });

            // Logique de retry
            if (attempts < maxAttempts) {
                const { payoutQueue } = require("../queues");
                const delay = Math.pow(2, attempts) * 60 * 1000; // backoff exponentiel en minutes
                await payoutQueue.add("payout:process", { payoutId }, { delay });
            } else {
                // Échec définitif - libérer le hold ledger
                const { releaseLedgerHold } = require("../services/ledger");
                await releaseLedgerHold(payoutId, 'max_retries_exceeded');
            }

            return { status: 'failed', attempts };
        }

    } catch (error) {
        await client.query("ROLLBACK");
        console.error(`Payout processor error for ${payoutId}:`, error);

        // Gestion sécurisée du type unknown
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        const errorStack = error instanceof Error ? error.stack : undefined;

        // Enregistrer l'erreur
        await client.query(
            `INSERT INTO payout_events (payout_id, event_type, payload) 
       VALUES ($1, $2, $3)`,
            [payoutId, 'processing_error', JSON.stringify({
                error: errorMessage,
                stack: errorStack
            })]
        );

        throw error;
    } finally {
        client.release();
    }
}, { connection });

worker.on('completed', (job) => {
    console.log(`✅ Payout processed: ${job.id}`);
});

worker.on('failed', (job, error) => {
    console.error(`❌ Payout failed: ${job?.id}`, error);
});

export default worker;