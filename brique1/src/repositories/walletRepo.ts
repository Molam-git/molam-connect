import { pool } from "../db/pg";

export async function createWallet(input: {
    user_id: string;
    country_code: string;
    currency: string;
    is_default?: boolean;
    display_name?: string;
    actor_id?: string;
}) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // idempotent: if exists return it
        const existing = await client.query(
            `SELECT * FROM molam_wallets WHERE user_id=$1 AND currency=$2`,
            [input.user_id, input.currency]
        );
        if (existing.rowCount) {
            await client.query("COMMIT");
            return existing.rows[0];
        }
        const res = await client.query(
            `INSERT INTO molam_wallets (user_id, country_code, currency, is_default, display_name, created_by, updated_by)
       VALUES ($1,$2,$3,COALESCE($4,false),$5,$6,$6)
       RETURNING *`,
            [input.user_id, input.country_code, input.currency, input.is_default, input.display_name ?? null, input.actor_id ?? null]
        );
        await client.query("COMMIT");
        return res.rows[0];
    } catch (e) {
        await client.query("ROLLBACK");
        throw e;
    } finally {
        client.release();
    }
}

export async function listWallets(params: { user_id?: string; currency?: string; status?: string; limit?: number; offset?: number }) {
    const filters: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if (params.user_id) { filters.push(`user_id=$${i++}`); vals.push(params.user_id); }
    if (params.currency) { filters.push(`currency=$${i++}`); vals.push(params.currency); }
    if (params.status) { filters.push(`status=$${i++}`); vals.push(params.status); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;
    const res = await pool.query(
        `SELECT * FROM molam_wallets ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`,
        [...vals, limit, offset]
    );
    return res.rows;
}

export async function getWallet(id: string) {
    const res = await pool.query(`SELECT * FROM molam_wallets WHERE id=$1`, [id]);
    return res.rows[0] || null;
}

export async function updateWallet(id: string, input: { is_default?: boolean; status?: "active" | "frozen" | "closed"; display_name?: string; actor_id?: string; }) {
    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;

    if (input.is_default !== undefined) { sets.push(`is_default=$${i++}`); vals.push(input.is_default); }
    if (input.status) { sets.push(`status=$${i++}`); vals.push(input.status); }
    if (input.display_name !== undefined) { sets.push(`display_name=$${i++}`); vals.push(input.display_name); }
    if (!sets.length) return getWallet(id);

    sets.push(`updated_by=$${i++}`); vals.push(input.actor_id ?? null);

    const res = await pool.query(
        `UPDATE molam_wallets SET ${sets.join(", ")}, updated_at=NOW() WHERE id=$${i} RETURNING *`,
        [...vals, id]
    );
    return res.rows[0] || null;
}