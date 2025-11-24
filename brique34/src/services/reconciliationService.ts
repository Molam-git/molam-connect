// src/services/reconciliationService.ts
import { db, ledger } from '../config';

export class ReconciliationService {
    async reconcileStatementLines(lines: any[]): Promise<void> {
        for (const line of lines) {
            // Match exact par reference_code
            const payout = await db.query(
                'SELECT * FROM payouts WHERE reference_code = $1',
                [line.reference]
            );

            if (payout.rows.length > 0) {
                await this.matchPayout(payout.rows[0], line);
                continue;
            }

            // Match flou par montant + date
            const candidates = await db.query(
                `SELECT * FROM payouts 
         WHERE currency = $1 
         AND amount BETWEEN $2 AND $3
         AND created_at::date = $4
         AND status IN ('sent', 'processing')`,
                [
                    line.currency,
                    line.amount * 0.995, // 0.5% de tolérance
                    line.amount * 1.005,
                    line.statement_date
                ]
            );

            if (candidates.rows.length === 1) {
                await this.matchPayout(candidates.rows[0], line);
                continue;
            }

            // Ligne suspecte
            await db.query(
                'UPDATE bank_statement_lines SET reconciliation_status = $1 WHERE id = $2',
                ['suspicious', line.id]
            );

            await this.createOpsTicket(line);
        }
    }

    private async matchPayout(payout: any, statementLine: any): Promise<void> {
        await db.query('BEGIN');

        try {
            // Mettre à jour la ligne de relevé
            await db.query(
                `UPDATE bank_statement_lines 
         SET matched_payout_id = $1, reconciliation_status = $2 
         WHERE id = $3`,
                [payout.id, 'matched', statementLine.id]
            );

            // Mettre à jour le payout
            await db.query(
                'UPDATE payouts SET status = $1 WHERE id = $2',
                ['settled', payout.id]
            );

            // Finaliser dans le ledger
            await ledger.finalizeHold({
                origin: payout.origin_entity_id,
                amount: payout.amount,
                currency: payout.currency,
                reason: 'payout_settled',
                ref: payout.reference_code
            });

            // Journaliser
            await db.query(
                `INSERT INTO reconciliation_logs (actor, action, details) 
         VALUES ($1, $2, $3)`,
                ['system', 'auto_reconciled', JSON.stringify({
                    payout_id: payout.id,
                    statement_line_id: statementLine.id
                })]
            );

            await db.query('COMMIT');
        } catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }
    }

    private async createOpsTicket(line: any): Promise<void> {
        // Créer un ticket d'ops pour ligne suspecte
    }
}