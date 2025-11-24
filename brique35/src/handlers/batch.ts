import { Request, Response } from 'express';
import { pool } from "../db";
import { payoutQueue } from "../queues";
import { computeFees } from "../services/feeCalculator";
import { pickRouting } from "../services/routing";
import { requiresApproval } from "../utils/validation";
import shortid from "shortid";

interface BatchPayoutItem {
    origin_module: string;
    origin_entity_id: string;
    amount: number;
    currency: string;
    beneficiary: any;
    scheduled_for?: string;
    priority?: number;
}

export async function batchPayoutHandler(req: Request, res: Response) {
    const { payouts } = req.body; // Tableau de payouts

    if (!Array.isArray(payouts) || payouts.length === 0) {
        return res.status(400).json({ error: "invalid_batch_data" });
    }

    // Limiter la taille du batch
    if (payouts.length > 1000) {
        return res.status(400).json({ error: "batch_too_large" });
    }

    const client = await pool.connect();
    const results = [];

    try {
        await client.query("BEGIN");

        for (const item of payouts) {
            try {
                const {
                    origin_module,
                    origin_entity_id,
                    amount,
                    currency,
                    beneficiary,
                    scheduled_for,
                    priority = 100
                }: BatchPayoutItem = item;

                // Validation de base
                if (Number(amount) <= 0) {
                    results.push({ error: "invalid_amount", item });
                    continue;
                }

                // Générer une référence
                const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                const reference = `PAYOUT-${dateStr}-${shortid.generate().toUpperCase()}`;

                // Routage et frais
                const routing = await pickRouting(currency, amount, origin_module);
                const { molamFee, bankFee, totalDeducted } = computeFees(origin_module, amount, routing.bank_fee);
                const needsApproval = await requiresApproval(amount, currency, routing.bank_profile_id);

                const initialStatus = needsApproval ? 'pending_approval' :
                    scheduled_for ? 'scheduled' : 'pending';

                // Insertion du payout
                const { rows } = await client.query(
                    `INSERT INTO payouts (
            origin_module, origin_entity_id, currency, amount, 
            molam_fee, bank_fee, total_deducted, beneficiary, bank_profile_id, 
            treasury_account_id, reference_code, scheduled_for, priority, 
            requires_approval, approval_status, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) 
          RETURNING *`,
                    [
                        origin_module, origin_entity_id, currency, amount,
                        molamFee, bankFee, totalDeducted, JSON.stringify(beneficiary),
                        routing.bank_profile_id, routing.treasury_account_id, reference,
                        scheduled_for, priority, needsApproval,
                        needsApproval ? 'pending' : 'auto_approved',
                        req.user?.id || 'system'
                    ]
                );

                const payout = rows[0];

                // Créer un événement d'audit
                await client.query(
                    `INSERT INTO payout_events (payout_id, event_type, payload, actor) 
           VALUES ($1, $2, $3, $4)`,
                    [
                        payout.id,
                        'created',
                        JSON.stringify({
                            routing: routing.bank_profile_id,
                            needs_approval: needsApproval,
                            batch: true
                        }),
                        req.user?.id
                    ]
                );

                // Si pas besoin d'approbation et non programmé, ajouter à la queue
                if (!needsApproval && (!scheduled_for || new Date(scheduled_for) <= new Date())) {
                    await payoutQueue.add("payout:process", { payoutId: payout.id }, {
                        priority: payout.priority
                    });
                } else if (scheduled_for && new Date(scheduled_for) > new Date()) {
                    const delay = new Date(scheduled_for).getTime() - Date.now();
                    await payoutQueue.add("payout:process", { payoutId: payout.id }, {
                        delay,
                        priority: payout.priority
                    });
                }

                results.push({ success: true, payout_id: payout.id, reference: payout.reference_code });

            } catch (error) {
                console.error("Error processing batch item:", error);

                // Gestion sécurisée du type unknown
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

                results.push({
                    error: "item_processing_failed",
                    detail: errorMessage,
                    item
                });
            }
        }

        await client.query("COMMIT");
        res.json({ results });

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Batch payout error:", error);

        // Gestion sécurisée du type unknown pour l'erreur globale
        const errorMessage = error instanceof Error ? error.message : 'Unknown batch processing error';

        res.status(500).json({
            error: "batch_processing_failed",
            detail: errorMessage
        });
    } finally {
        client.release();
    }
}