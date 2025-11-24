import { pool } from "../db";
import { publishEvent } from "../events";

export class RefundExecutorWorker {
    async processRefundRequest(eventData: any) {
        const { disputeId, amount, txnId } = eventData;

        try {
            // 1. Vérifier que le litige existe et est en statut résolu
            const dispute = await this.getDispute(disputeId);
            if (!dispute || dispute.status !== 'resolved') {
                throw new Error(`Dispute ${disputeId} not found or not resolved`);
            }

            // 2. Créer l'entrée ledger de reversal
            const ledgerEntry = await this.createLedgerReversal(dispute, amount);

            // 3. Appeler Treasury pour le payout si nécessaire
            const treasuryResult = await this.callTreasuryService({
                disputeId,
                amount,
                currency: dispute.currency,
                originId: dispute.origin_id,
                ledgerEntryId: ledgerEntry.id
            });

            // 4. Mettre à jour le statut du litige
            await pool.query(
                `UPDATE disputes SET metadata = metadata || $1 WHERE id = $2`,
                [JSON.stringify({
                    refund_executed: true,
                    refund_date: new Date().toISOString(),
                    treasury_reference: treasuryResult.reference
                }), disputeId]
            );

            // 5. Ajouter à l'historique
            await pool.query(
                `INSERT INTO dispute_history (dispute_id, actor, action, details) VALUES ($1,'system','refund_executed',$2)`,
                [disputeId, {
                    amount,
                    ledger_entry: ledgerEntry.id,
                    treasury_reference: treasuryResult.reference
                }]
            );

            await publishEvent("dispute.refund.completed", {
                disputeId,
                amount,
                success: true
            });

        } catch (error: unknown) {
            console.error(`Refund failed for dispute ${disputeId}:`, error);

            // Gestion sécurisée du type unknown
            let errorMessage = 'Unknown error occurred';

            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (typeof error === 'string') {
                errorMessage = error;
            } else if (error && typeof error === 'object' && 'message' in error) {
                errorMessage = String((error as any).message);
            }

            await publishEvent("dispute.refund.failed", {
                disputeId,
                error: errorMessage
            });
        }
    }

    private async getDispute(disputeId: string) {
        const { rows } = await pool.query("SELECT * FROM disputes WHERE id = $1", [disputeId]);
        return rows[0];
    }

    private async createLedgerReversal(dispute: any, amount: number) {
        // Intégration avec le système de ledger
        // Retourne un mock pour l'exemple
        return {
            id: `ledger_${Date.now()}`,
            amount,
            currency: dispute.currency
        };
    }

    private async callTreasuryService(refundData: any) {
        // Appel au service Treasury pour exécuter le payout
        // Retourne un mock pour l'exemple
        return {
            reference: `trs_${Date.now()}`,
            status: 'processed'
        };
    }
}