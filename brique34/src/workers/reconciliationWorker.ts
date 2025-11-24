import { db } from '../config';
import { ReconciliationService } from '../services/reconciliationService';

const reconciliationService = new ReconciliationService();

export async function startReconciliationWorker() {
    // Exécuter la réconciliation périodiquement
    setInterval(async () => {
        try {
            // Récupérer les lignes de relevé non reconciliées
            const { rows } = await db.query(`
        SELECT * FROM bank_statement_lines 
        WHERE reconciliation_status = 'unmatched'
      `);
            await reconciliationService.reconcileStatementLines(rows);
        } catch (error) {
            console.error('Error in reconciliation worker:', error);
        }
    }, 5 * 60 * 1000); // Toutes les 5 minutes
}