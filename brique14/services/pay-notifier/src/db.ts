import pg from "pg";

export const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

export async function q<T = any>(text: string, params?: any[]): Promise<{ rows: T[] }> {
    const result = await pool.query(text, params);
    return { rows: result.rows as T[] };
}