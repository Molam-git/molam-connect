// src/models/Operator.ts
import { pool } from '../config/database';
import { TelecomOperator } from '../types/topup';

export class OperatorModel {
    static async findByCountry(countryCode: string): Promise<TelecomOperator[]> {
        const result = await pool.query(
            'SELECT id, name, country_code, currency, commission_rate FROM molam_telecom_operators WHERE country_code = $1 AND status = $2',
            [countryCode, 'active']
        );
        return result.rows;
    }

    static async findById(id: string): Promise<TelecomOperator | null> {
        const result = await pool.query(
            'SELECT * FROM molam_telecom_operators WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    }
}