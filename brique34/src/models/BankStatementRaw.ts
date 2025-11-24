// src/models/BankStatementRaw.ts
import { db } from '../config';

export class BankStatementRaw {
    static async create(data: {
        bank_profile_id: string;
        file_s3_key: string;
        parsed?: any;
        status?: string;
    }) {
        const result = await db.query(
            `INSERT INTO bank_statements_raw 
       (bank_profile_id, file_s3_key, parsed, status) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
            [data.bank_profile_id, data.file_s3_key, data.parsed, data.status || 'uploaded']
        );
        return result.rows[0];
    }

    static async findByBankProfile(bankProfileId: string) {
        const result = await db.query(
            'SELECT * FROM bank_statements_raw WHERE bank_profile_id = $1 ORDER BY imported_at DESC',
            [bankProfileId]
        );
        return result.rows;
    }
}