import { Pool } from 'pg';
import { config } from '../config/database';

export const pool = new Pool(config);

export const db = {
    one: async (query: string, params: any[] = []) => {
        const result = await pool.query(query, params);
        if (result.rows.length === 0) {
            throw new Error('No rows returned');
        }
        return result.rows[0];
    },

    oneOrNone: async (query: string, params: any[] = []) => {
        const result = await pool.query(query, params);
        return result.rows[0] || null;
    },

    many: async (query: string, params: any[] = []) => {
        const result = await pool.query(query, params);
        return result.rows;
    },

    manyOrNone: async (query: string, params: any[] = []) => {
        const result = await pool.query(query, params);
        return result.rows;
    },

    none: async (query: string, params: any[] = []) => {
        await pool.query(query, params);
    }
};