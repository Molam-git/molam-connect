import { db } from '../db/knex.js';

export async function ensureIdempotency(key: string) {
    const existing = await db('agent_payouts').where({ idempotency_key: key }).first();
    return existing || null;
}