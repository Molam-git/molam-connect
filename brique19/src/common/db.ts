// src/common/db.ts
import { PoolClient } from "pg";

export async function withTx(client: PoolClient, callback: (tx: PoolClient) => Promise<void>) {
    try {
        await client.query('BEGIN');
        await callback(client);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
}