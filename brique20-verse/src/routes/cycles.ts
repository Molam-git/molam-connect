import { FastifyInstance } from 'fastify';
import { createCycleForPeriod, executePayout } from '../domain/payout.js';

export default async function cyclesRoutes(f: FastifyInstance) {
    f.post('/api/agents/:agentId/payout-cycles', async (req: any, rep) => {
        const { agentId } = req.params;
        const { currency, frequency, period_start, period_end } = req.body;
        const res = await createCycleForPeriod(agentId, currency, frequency, period_start, period_end);
        return rep.send(res);
    });

    f.post('/api/payout-cycles/:cycleId/execute', async (req: any, rep) => {
        const { cycleId } = req.params;
        const idemKey = req.headers['idempotency-key'] as string;
        if (!idemKey) return rep.code(400).send({ error: 'IDEMPOTENCY_KEY_REQUIRED' });
        const res = await executePayout(cycleId, idemKey);
        return rep.send(res);
    });
}