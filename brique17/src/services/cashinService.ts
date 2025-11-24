import { db } from '../utils/database';
import { prometheusMetrics } from '../utils/prometheus';

export const cashinService = {
    async validateOTP(userId: string, otp: string): Promise<boolean> {
        const result = await db.query(
            `SELECT * FROM user_otps 
             WHERE user_id = $1 AND code = $2 
             AND expires_at > NOW() AND used = false`,
            [userId, otp]
        );

        if (result.rows.length === 0) {
            return false;
        }

        // Marquer l'OTP comme utilisé
        await db.query(
            `UPDATE user_otps SET used = true, updated_at = NOW() 
             WHERE user_id = $1 AND code = $2`,
            [userId, otp]
        );

        return true;
    },

    async validateAgentKYC(agentId: string): Promise<boolean> {
        const result = await db.query(
            `SELECT kyc_status FROM agents 
             WHERE id = $1 AND status = 'ACTIVE'`,
            [agentId]
        );

        return result.rows.length > 0 && result.rows[0].kyc_status === 'VERIFIED';
    },

    async executeCashin(
        agentId: string,
        userId: string,
        amount: number,
        currency: string
    ): Promise<string> {
        try {
            const result = await db.query(
                `SELECT cashin_transaction($1, $2, $3, $4) as tx_id`,
                [agentId, userId, amount, currency]
            );

            // Mettre à jour les métriques Prometheus
            prometheusMetrics.cashinTransactionsTotal.inc({
                country: currency.substring(0, 3),
                status: 'success'
            });

            prometheusMetrics.cashinVolumeSum.inc(amount);

            return result.rows[0].tx_id;
        } catch (error: any) {
            // Métriques d'erreur
            prometheusMetrics.cashinTransactionsTotal.inc({
                country: currency.substring(0, 3),
                status: 'error'
            });

            throw error;
        }
    },

    async getTransactionStatus(transactionId: string): Promise<any> {
        const result = await db.query(
            `SELECT * FROM agent_transactions WHERE tx_id = $1`,
            [transactionId]
        );

        if (result.rows.length === 0) {
            throw new Error('Transaction not found');
        }

        return result.rows[0];
    }
};