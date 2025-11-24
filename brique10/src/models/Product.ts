// src/models/Product.ts
import { pool } from '../config/database';
import { TopupProduct } from '../types/topup';

export class ProductModel {
    static async findByOperator(operatorId: string): Promise<TopupProduct[]> {
        const result = await pool.query(
            `SELECT p.id, p.product_code, p.description, p.amount, p.currency, p.validity_days 
       FROM molam_topup_products p 
       WHERE p.operator_id = $1 AND p.is_active = true`,
            [operatorId]
        );
        return result.rows;
    }

    static async findById(id: string): Promise<TopupProduct | null> {
        const result = await pool.query(
            'SELECT * FROM molam_topup_products WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    }
}