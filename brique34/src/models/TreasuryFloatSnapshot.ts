// src/models/TreasuryFloatSnapshot.ts
import { db } from '../config';

export class TreasuryFloatSnapshot {
    static async create(data: {
        treasury_account_id: string;
        balance: number;
        reserved: number;
        available: number;
        currency: string;
    }) {
        const result = await db.query(
            `INSERT INTO treasury_float_snapshots 
       (treasury_account_id, balance, reserved, available, currency) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
            [data.treasury_account_id, data.balance, data.reserved, data.available, data.currency]
        );
        return result.rows[0];
    }

    static async getLatestByAccount(accountId: string) {
        const result = await db.query(
            `SELECT * FROM treasury_float_snapshots 
       WHERE treasury_account_id = $1 
       ORDER BY snapshot_ts DESC 
       LIMIT 1`,
            [accountId]
        );
        return result.rows[0];
    }
}