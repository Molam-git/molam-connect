// src/common/db.ts
import { Pool, PoolClient } from "pg";

export async function withTx<T>(client: PoolClient, callback: (tx: PoolClient) => Promise<T>): Promise<T> {
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
}