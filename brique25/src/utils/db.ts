import { Pool } from "pg";
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 20 });

export async function withTx<R>(fn: (c: any) => Promise<R>): Promise<R> {
    const c = await pool.connect();
    try {
        await c.query("BEGIN");
        const r = await fn(c);
        await c.query("COMMIT");
        return r;
    } catch (e) {
        await c.query("ROLLBACK"); throw e;
    } finally { c.release(); }
}