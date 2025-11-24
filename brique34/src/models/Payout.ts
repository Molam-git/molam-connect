// src/models/Payout.ts
import { db } from '../config';
import { Payout, PayoutStatus } from '../types/treasury';

export class PayoutModel {
    static async create(data: {
        external_id: string;
        origin_module: string;
        origin_entity_id: string;
        currency: string;
        amount: number;
        bank_account: any;
        bank_profile_id?: string;
        treasury_account_id?: string;
        molam_fee?: number;
        bank_fee?: number;
        total_deducted?: number;
        reference_code: string;
        status?: PayoutStatus;
    }): Promise<Payout> {
        const result = await db.query(
            `INSERT INTO payouts 
       (external_id, origin_module, origin_entity_id, currency, amount, 
        bank_account, bank_profile_id, treasury_account_id, molam_fee, 
        bank_fee, total_deducted, reference_code, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
       RETURNING *`,
            [
                data.external_id,
                data.origin_module,
                data.origin_entity_id,
                data.currency,
                data.amount,
                JSON.stringify(data.bank_account),
                data.bank_profile_id,
                data.treasury_account_id,
                data.molam_fee || 0,
                data.bank_fee || 0,
                data.total_deducted || data.amount,
                data.reference_code,
                data.status || 'pending'
            ]
        );
        return result.rows[0];
    }

    static async findById(id: string): Promise<Payout | null> {
        const result = await db.query('SELECT * FROM payouts WHERE id = $1', [id]);
        return result.rows[0] || null;
    }

    static async findByExternalId(externalId: string): Promise<Payout | null> {
        const result = await db.query('SELECT * FROM payouts WHERE external_id = $1', [externalId]);
        return result.rows[0] || null;
    }

    static async findByReferenceCode(referenceCode: string): Promise<Payout | null> {
        const result = await db.query('SELECT * FROM payouts WHERE reference_code = $1', [referenceCode]);
        return result.rows[0] || null;
    }

    static async updateStatus(id: string, status: PayoutStatus, providerRef?: string): Promise<Payout> {
        const updates: string[] = ['status = $2', 'updated_at = now()'];
        const values: any[] = [id, status];

        if (providerRef) {
            updates.push('provider_ref = $3');
            values.push(providerRef);
        }

        const result = await db.query(
            `UPDATE payouts SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
            values
        );
        return result.rows[0];
    }

    static async findByStatus(status: PayoutStatus, limit: number = 100): Promise<Payout[]> {
        const result = await db.query(
            'SELECT * FROM payouts WHERE status = $1 ORDER BY created_at DESC LIMIT $2',
            [status, limit]
        );
        return result.rows;
    }

    static async findByOrigin(originModule: string, originEntityId: string): Promise<Payout[]> {
        const result = await db.query(
            'SELECT * FROM payouts WHERE origin_module = $1 AND origin_entity_id = $2 ORDER BY created_at DESC',
            [originModule, originEntityId]
        );
        return result.rows;
    }

    static async findPendingByBankProfile(bankProfileId: string): Promise<Payout[]> {
        const result = await db.query(
            `SELECT * FROM payouts 
       WHERE bank_profile_id = $1 
       AND status IN ('pending', 'processing') 
       ORDER BY created_at ASC`,
            [bankProfileId]
        );
        return result.rows;
    }

    static async cancelPayout(id: string): Promise<Payout> {
        const result = await db.query(
            `UPDATE payouts 
       SET status = 'failed', updated_at = now() 
       WHERE id = $1 AND status = 'pending' 
       RETURNING *`,
            [id]
        );

        if (result.rows.length === 0) {
            throw new Error('Payout not found or cannot be cancelled');
        }

        return result.rows[0];
    }

    static async reversePayout(id: string): Promise<Payout> {
        const result = await db.query(
            `UPDATE payouts 
       SET status = 'reversed', updated_at = now() 
       WHERE id = $1 AND status = 'settled' 
       RETURNING *`,
            [id]
        );

        if (result.rows.length === 0) {
            throw new Error('Payout not found or cannot be reversed');
        }

        return result.rows[0];
    }

    static async getStats(period: 'day' | 'week' | 'month' = 'day'): Promise<{
        total_count: number;
        total_amount: number;
        settled_count: number;
        settled_amount: number;
        failed_count: number;
    }> {
        const intervalMap = {
            day: '1 day',
            week: '1 week',
            month: '1 month'
        };

        const result = await db.query(
            `SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(amount), 0) as total_amount,
        COUNT(*) FILTER (WHERE status = 'settled') as settled_count,
        COALESCE(SUM(amount) FILTER (WHERE status = 'settled'), 0) as settled_amount,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_count
       FROM payouts 
       WHERE created_at >= NOW() - INTERVAL '${intervalMap[period]}'`
        );

        return result.rows[0];
    }

    static async searchPayouts(filters: {
        status?: PayoutStatus;
        origin_module?: string;
        currency?: string;
        date_from?: Date;
        date_to?: Date;
        limit?: number;
        offset?: number;
    }): Promise<{ payouts: Payout[]; total: number }> {
        let query = 'FROM payouts WHERE 1=1';
        const values: any[] = [];
        let paramCount = 0;

        if (filters.status) {
            paramCount++;
            query += ` AND status = $${paramCount}`;
            values.push(filters.status);
        }

        if (filters.origin_module) {
            paramCount++;
            query += ` AND origin_module = $${paramCount}`;
            values.push(filters.origin_module);
        }

        if (filters.currency) {
            paramCount++;
            query += ` AND currency = $${paramCount}`;
            values.push(filters.currency);
        }

        if (filters.date_from) {
            paramCount++;
            query += ` AND created_at >= $${paramCount}`;
            values.push(filters.date_from);
        }

        if (filters.date_to) {
            paramCount++;
            query += ` AND created_at <= $${paramCount}`;
            values.push(filters.date_to);
        }

        // Count total for pagination
        const countResult = await db.query(`SELECT COUNT(*) ${query}`, values);
        const total = parseInt(countResult.rows[0].count);

        // Apply pagination
        paramCount++;
        query += ` ORDER BY created_at DESC LIMIT $${paramCount}`;
        values.push(filters.limit || 50);

        if (filters.offset) {
            paramCount++;
            query += ` OFFSET $${paramCount}`;
            values.push(filters.offset);
        }

        const payoutsResult = await db.query(`SELECT * ${query}`, values);

        return {
            payouts: payoutsResult.rows,
            total
        };
    }
}