import { Pool, PoolClient } from 'pg';

export const db = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'molam_pay',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
});

// Export avecTxn depuis db.ts aussi pour compatibilité
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