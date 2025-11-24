// src/models/TopupTransaction.ts
import { pool } from '../config/database';
import { TopupTransaction } from '../types/topup';

export class TopupTransactionModel {
    static async create(transaction: Omit<TopupTransaction, 'id' | 'created_at'>): Promise<TopupTransaction> {
        const result = await pool.query(
            `INSERT INTO molam_topup_transactions 
       (user_id, operator_id, product_id, phone_number, amount, currency, fx_rate, status, sira_score, fee_total, fee_breakdown) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
       RETURNING *`,
            [
                transaction.user_id,
                transaction.operator_id,
                transaction.product_id,
                transaction.phone_number,
                transaction.amount,
                transaction.currency,
                transaction.fx_rate,
                transaction.status,
                transaction.sira_score,
                transaction.fee_total,
                transaction.fee_breakdown
            ]
        );
        return result.rows[0];
    }

    static async updateStatus(id: string, status: string, providerReference?: string): Promise<void> {
        const timestampColumn = `${status}_at`;
        await pool.query(
            `UPDATE molam_topup_transactions 
       SET status = $1, provider_reference = $2, ${timestampColumn} = NOW() 
       WHERE id = $3`,
            [status, providerReference, id]
        );
    }

    static async findById(id: string): Promise<TopupTransaction | null> {
        const result = await pool.query(
            'SELECT * FROM molam_topup_transactions WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    }
}