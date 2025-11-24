import { pool } from "../db";

export async function checkIdempotency(idempotencyKey: string): Promise<any> {
    const { rows } = await pool.query(
        "SELECT response FROM idempotency_keys WHERE idempotency_key = $1 AND created_at > NOW() - INTERVAL '24 hours'",
        [idempotencyKey]
    );

    return rows[0]?.response || null;
}

export async function saveIdempotency(
    idempotencyKey: string,
    response: any,
    createdBy?: string
): Promise<void> {
    await pool.query(
        "INSERT INTO idempotency_keys (idempotency_key, response, created_by) VALUES ($1, $2, $3)",
        [idempotencyKey, JSON.stringify(response), createdBy]
    );
}