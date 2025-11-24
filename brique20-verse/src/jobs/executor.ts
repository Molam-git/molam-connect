import { db } from '../db/knex.js';
import { executePayout } from '../domain/payout.js';
import { v4 as uuid } from 'uuid';

export async function executeReadyPayouts() {
    const readyCycles = await db('agent_payout_cycles')
        .where({ status: 'READY' })
        .select('*');

    for (const cycle of readyCycles) {
        try {
            const idempotencyKey = uuid();
            await executePayout(cycle.cycle_id, idempotencyKey);
        } catch (error) {
            console.error(`Error executing payout for cycle ${cycle.cycle_id}:`, error);
        }
    }
}