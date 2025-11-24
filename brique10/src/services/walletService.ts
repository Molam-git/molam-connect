import { pool } from '../config/database';

export class WalletService {
    static async debitUser(userId: string, amount: number, currency: string, description: string): Promise<void> {
        // Implémentation simplifiée : on suppose que la table molam_wallets existe
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Vérifier le solde
            const wallet = await client.query(
                'SELECT balance, currency FROM molam_wallets WHERE user_id = $1 FOR UPDATE',
                [userId]
            );

            if (wallet.rows.length === 0) {
                throw new Error('Wallet not found');
            }

            if (wallet.rows[0].currency !== currency) {
                throw new Error('Currency mismatch');
            }

            if (wallet.rows[0].balance < amount) {
                throw new Error('Insufficient balance');
            }

            // Débiter le solde
            await client.query(
                'UPDATE molam_wallets SET balance = balance - $1 WHERE user_id = $2',
                [amount, userId]
            );

            // Enregistrer la transaction
            await client.query(
                `INSERT INTO molam_wallet_transactions (user_id, amount, currency, type, description, balance_after) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
                [userId, amount, currency, 'debit', description, wallet.rows[0].balance - amount]
            );

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async creditUser(userId: string, amount: number, currency: string, description: string): Promise<void> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Vérifier le portefeuille
            const wallet = await client.query(
                'SELECT balance, currency FROM molam_wallets WHERE user_id = $1 FOR UPDATE',
                [userId]
            );

            if (wallet.rows.length === 0) {
                throw new Error('Wallet not found');
            }

            if (wallet.rows[0].currency !== currency) {
                throw new Error('Currency mismatch');
            }

            // Créditer le solde
            await client.query(
                'UPDATE molam_wallets SET balance = balance + $1 WHERE user_id = $2',
                [amount, userId]
            );

            // Enregistrer la transaction
            await client.query(
                `INSERT INTO molam_wallet_transactions (user_id, amount, currency, type, description, balance_after) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
                [userId, amount, currency, 'credit', description, wallet.rows[0].balance + amount]
            );

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}