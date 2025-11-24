import { PoolClient } from 'pg';
import { db } from './db.js';

// Implémentation correcte de withTxn
export const withTxn = async (callback: (client: PoolClient) => Promise<any>) => {
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};