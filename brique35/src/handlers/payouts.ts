import { Request, Response } from 'express';
import { pool } from "../db";
import { payoutQueue } from "../queues";
import shortid from "shortid";
import { createLedgerHold, releaseLedgerHold } from "../services/ledger";
import { pickRouting } from "../services/routing";
import { saveIdempotency, checkIdempotency } from "../utils/idempotency";
import { computeFees } from "../services/feeCalculator";
import { requiresApproval } from "../utils/validation";
import { payoutCreatedCounter, payoutStatusCounter } from "../utils/metrics";

interface PayoutCreateRequest {
    origin_module: string;
    origin_entity_id: string;
    amount: number;
    currency: string;
    beneficiary: {
        name: string;
        account_number: string;
        bank_code?: string;
        bank_name?: string;
        type: 'individual' | 'business';
    };
    scheduled_for?: string;
    priority?: number;
}

export async function createPayoutHandler(req: Request, res: Response) {
    const idempotency = req.headers["idempotency-key"] as string;

    if (!idempotency) {
        return res.status(400).json({ error: "idempotency_key_required" });
    }

    try {
        // Vérifier l'idempotence
        const existing = await checkIdempotency(idempotency);
        if (existing) {
            return res.json(existing);
        }

        const {
            origin_module,
            origin_entity_id,
            amount,
            currency,
            beneficiary,
            scheduled_for,
            priority = 100
        }: PayoutCreateRequest = req.body;

        // Validation
        if (Number(amount) <= 0) {
            return res.status(400).json({ error: "invalid_amount" });
        }

        if (!beneficiary || !beneficiary.name || !beneficiary.account_number) {
            return res.status(400).json({ error: "invalid_beneficiary" });
        }

        // Générer le code de référence
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const reference = `PAYOUT-${dateStr}-${shortid.generate().toUpperCase()}`;

        // Obtenir le routage SIRA
        const routing = await pickRouting(currency, amount, origin_module);

        // Calculer les frais
        const { molamFee, bankFee, totalDeducted } = computeFees(origin_module, amount, routing.bank_fee);

        // Vérifier si une approbation est requise
        const needsApproval = await requiresApproval(amount, currency, routing.bank_profile_id);

        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            // Créer le hold ledger
            const ledgerEntry = await createLedgerHold(
                origin_entity_id,
                amount,
                currency,
                reference
            );

            // Déterminer le statut initial
            const initialStatus = needsApproval ? 'pending_approval' :
                scheduled_for ? 'scheduled' : 'pending';

            // Insérer le payout
            const { rows } = await client.query(
                `INSERT INTO payouts (
          external_id, origin_module, origin_entity_id, currency, amount, 
          molam_fee, bank_fee, total_deducted, beneficiary, bank_profile_id, 
          treasury_account_id, reference_code, scheduled_for, priority, 
          requires_approval, approval_status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) 
        RETURNING *`,
                [
                    idempotency, origin_module, origin_entity_id, currency, amount,
                    molamFee, bankFee, totalDeducted, JSON.stringify(beneficiary),
                    routing.bank_profile_id, routing.treasury_account_id, reference,
                    scheduled_for, priority, needsApproval,
                    needsApproval ? 'pending' : 'auto_approved',
                    req.user?.id || 'system'
                ]
            );

            const payout = rows[0];

            // Créer le mapping du hold ledger
            await client.query(
                `INSERT INTO ledger_holds (payout_id, ledger_entry_ref, amount, currency) 
         VALUES ($1, $2, $3, $4)`,
                [payout.id, ledgerEntry.ref, amount, currency]
            );

            // Créer l'événement d'audit
            await client.query(
                `INSERT INTO payout_events (payout_id, event_type, payload, actor) 
         VALUES ($1, $2, $3, $4)`,
                [
                    payout.id,
                    'created',
                    JSON.stringify({
                        routing: routing.bank_profile_id,
                        needs_approval: needsApproval
                    }),
                    req.user?.id
                ]
            );

            // Sauvegarder la réponse pour l'idempotence
            const responsePayload = {
                id: payout.id,
                reference_code: payout.reference_code,
                status: payout.status,
                amount: payout.amount,
                currency: payout.currency,
                total_deducted: payout.total_deducted,
                requires_approval: payout.requires_approval
            };

            await saveIdempotency(idempotency, responsePayload, req.user?.id);

            await client.query("COMMIT");

            // Mettre à jour les métriques
            payoutCreatedCounter.inc({ origin_module, currency });
            payoutStatusCounter.inc({ status: payout.status, origin_module });

            // Programmer le traitement si nécessaire
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

            res.status(201).json(responsePayload);

        } catch (error) {
            await client.query("ROLLBACK");
            console.error("Payout creation error:", error);
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error("Payout handler error:", error);

        // Gestion sécurisée du type unknown
        const errorMessage = error instanceof Error ? error.message : 'Unknown payout creation error';

        res.status(500).json({
            error: "payout_creation_failed",
            detail: errorMessage
        });
    }
}

export async function getPayoutHandler(req: Request, res: Response) {
    try {
        const { id } = req.params;

        const { rows } = await pool.query(
            `SELECT p.*, 
              json_agg(
                json_build_object(
                  'id', pe.id,
                  'event_type', pe.event_type,
                  'payload', pe.payload,
                  'actor', pe.actor,
                  'created_at', pe.created_at
                ) ORDER BY pe.created_at
              ) as events
       FROM payouts p
       LEFT JOIN payout_events pe ON p.id = pe.payout_id
       WHERE p.id = $1
       GROUP BY p.id`,
            [id]
        );

        if (!rows.length) {
            return res.status(404).json({ error: "payout_not_found" });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("Get payout error:", error);

        // Gestion sécurisée du type unknown
        const errorMessage = error instanceof Error ? error.message : 'Unknown error fetching payout';

        res.status(500).json({
            error: "server_error",
            detail: errorMessage
        });
    }
}

export async function cancelPayoutHandler(req: Request, res: Response) {
    const client = await pool.connect();

    try {
        const { id } = req.params;
        const { reason } = req.body;

        await client.query("BEGIN");

        // Vérifier si le payout peut être annulé
        const { rows } = await client.query(
            "SELECT * FROM payouts WHERE id = $1 FOR UPDATE",
            [id]
        );

        if (!rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "payout_not_found" });
        }

        const payout = rows[0];

        if (!['pending', 'scheduled', 'pending_approval'].includes(payout.status)) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: "payout_not_cancellable" });
        }

        // Mettre à jour le statut
        await client.query(
            "UPDATE payouts SET status = 'cancelled', updated_at = now() WHERE id = $1",
            [id]
        );

        // Libérer le hold ledger
        await releaseLedgerHold(id, 'cancelled_by_user');

        // Créer l'événement d'audit
        await client.query(
            `INSERT INTO payout_events (payout_id, event_type, payload, actor) 
       VALUES ($1, $2, $3, $4)`,
            [id, 'cancelled', JSON.stringify({ reason }), req.user?.id]
        );

        // Mettre à jour les métriques
        payoutStatusCounter.inc({ status: 'cancelled', origin_module: payout.origin_module });

        await client.query("COMMIT");

        res.json({ status: 'cancelled', payout_id: id });

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Cancel payout error:", error);

        // Gestion sécurisée du type unknown
        const errorMessage = error instanceof Error ? error.message : 'Unknown cancellation error';

        res.status(500).json({
            error: "cancellation_failed",
            detail: errorMessage
        });
    } finally {
        client.release();
    }
}